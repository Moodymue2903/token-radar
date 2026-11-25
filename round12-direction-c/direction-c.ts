// Round 12, Direction C — category comps with hierarchical shrinkage.
// Implements the Arena (kimi-k3) spec exactly. OFFLINE, read-only on the
// sealed snapshot; writes results only into round12-direction-c/.
//   ln M_hat_j = s_j + mu_j,  s_j = ln(tvl_j)  (metric = TVL, the only
//   metric the spec's rho = ln(M) - ln(metric) can be on this snapshot:
//   rho is then ln(mcap/tvl), the log multiple).
//   rho_i = ln(M_i) - ln(tvl_i) for launched peers only, training folds only.
//   Per-fold variance components, training rows only:
//     rho_bar = mean(rho_i); mu_c, n_c per category;
//     sigma2 = pooled within-category variance, categories with n_c>=2 only
//       = sum_c sum_i (rho_i - mu_c)^2 / sum_c (n_c - 1);
//     s2_btw = sample variance (ddof=1, unweighted) of the category means
//       mu_c across all categories in the training set;
//     tau2 = max(0, s2_btw - sigma2 * mean_c(1/n_c)).
//   Peer set P_j = launched peers, same category as j, training folds only,
//     i != j. Kernel h = 0.75 dex = 0.75*ln(10) ≈ 1.727, FROZEN, not tuned.
//     w_ij = exp(-(s_i - s_j)^2 / (2 h^2)).
//   n_eff(j) = (sum w)^2 / sum w^2 (0 if P_j empty);
//   mu_loc(j) = sum(w*rho) / sum(w);
//   lam(j) = tau2 / (tau2 + sigma2/n_eff(j)), lam = 0 if no peers;
//   mu_j = lam*mu_loc + (1-lam)*rho_bar. M_hat_j = exp(s_j + mu_j),
//   a MEDIAN estimator — sigma2/2 is NOT added.
//   Display: top 5 peers by w desc, ties by peer name asc then slug asc;
//     peer name, slug, w_ij, rho_i, s_i to 3 dp. Empty peer set:
//     "No launched peers in category — shrunk to global mean".
//   Few-peer categories: n_c=0 -> global mean only, logged; n_c=1 -> the
//     formula handles it; lam is NOT overridden to 1, rows are NOT dropped.
// FORBIDDEN (and not done here): tuning h, new features, holdout rows as
//   peers, re-estimating on full data, live board as peers.
// Holdout test: launched-cohort holdout, same folds as the ridge baselines
//   (LOO n=95; WF train listed < 2025-01-01 n=64, test >= 2025-01-01 n=31).
//   Metric median |log err| (natural log), factor = exp(median |log err|).
//   Frozen baselines: ridge LOO x2.74 (primary), WF x2.19 (secondary).
//   Improvement = (2.74 - C_factor) / 2.74.
//   Bootstrap CIs: 1000 resamples, mulberry32(555000) (the frozen LOO band
//   seed base), 95% CI for the C factor and for the improvement — reporting
//   only, never changes the verdict.
//   Blind pairwise (5 rows, mulberry32(11) — first frozen blind split
//   seed — stratified by category, same rows both models, A/B randomised
//   per row, explanations visible): ONLY a tie-breaker in the parity band.
// Verdict table (pre-registered, not re-run on a different seed):
//   PASS clear  if C >= 5% better than ridge LOO;
//   PASS parity if within +/-2% AND blind >= 4-1;
//   KILL        if worse by > 2% AND blind <= 3-2;
//   otherwise UNDECIDED — do not force, do not re-run, do not re-draw.
// Run: node round12-direction-c/direction-c.ts (from ~/workspace/makefun/token-radar)
import { readFileSync, writeFileSync } from 'node:fs';
import {
  parseSnapshot, fitPeersOf, fitModel, impliedValue, looLogResiduals,
  median, mulberry32, MODEL, type SnapshotProtocol,
} from '../lib/model.ts';

const SNAP = '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json';
const OUTDIR = 'round12-direction-c';
const snap = parseSnapshot(readFileSync(SNAP, 'utf8'));
const log: string[] = [];
const out = (s: string) => { console.log(s); log.push(s); };
const fmt = (v: number, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : String(v));
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const LN10 = Math.log(10);
const H = 0.75 * LN10; // frozen kernel bandwidth, dex -> natural log units
const BOOT_N = 1000;
const BOOT_SEED = 555000; // frozen LOO band seed base
const BLIND_SEED = 11; // first frozen blind split seed

const peers = fitPeersOf(snap); // 95 launched peers with a listing date, snapshot order
const excludedMetric = peers.filter((p) => !(p.tvl_usd > 0) || !(p.mcap_usd! > 0));
const sOf = (p: SnapshotProtocol): number => Math.log(p.tvl_usd); // ln(metric), metric = TVL
const rhoOf = (p: SnapshotProtocol): number => Math.log(p.mcap_usd!) - Math.log(p.tvl_usd);

interface VarianceComponents {
  rhoBar: number;
  sigma2: number;
  tau2: number;
  s2btw: number;
  meanInvN: number;
  nCats: number;
  catsWithN1: number;
  catsWithN0: number; // categories present in the full peer set but absent from this train set
}

function varianceComponents(train: SnapshotProtocol[]): VarianceComponents {
  const byCat = new Map<string, SnapshotProtocol[]>();
  for (const p of train) {
    const k = p.category ?? '__null__';
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k)!.push(p);
  }
  const rhos = train.map(rhoOf);
  const rhoBar = mean(rhos);
  const mus: number[] = [];
  const invNs: number[] = [];
  let ssWithin = 0;
  let dfWithin = 0;
  let catsWithN1 = 0;
  for (const [, members] of byCat) {
    const rs = members.map(rhoOf);
    const mu = mean(rs);
    mus.push(mu);
    invNs.push(1 / members.length);
    if (members.length === 1) catsWithN1++;
    if (members.length >= 2) {
      ssWithin += sum(rs.map((r) => (r - mu) ** 2));
      dfWithin += members.length - 1;
    }
  }
  const sigma2 = dfWithin > 0 ? ssWithin / dfWithin : 0;
  const m = mean(mus);
  const s2btw = mus.length > 1 ? sum(mus.map((x) => (x - m) ** 2)) / (mus.length - 1) : 0;
  const meanInvN = mean(invNs);
  const tau2 = Math.max(0, s2btw - sigma2 * meanInvN);
  const allCats = new Set(peers.map((p) => p.category ?? '__null__'));
  const catsWithN0 = [...allCats].filter((c) => !byCat.has(c)).length;
  return { rhoBar, sigma2, tau2, s2btw, meanInvN, nCats: byCat.size, catsWithN1, catsWithN0 };
}

interface PeerDisplay {
  name: string;
  slug: string;
  w: number;
  rho: number;
  s: number;
}

interface CPrediction {
  target: SnapshotProtocol;
  pred: number;
  mu: number;
  lam: number;
  muLoc: number | null;
  nEff: number;
  nPeers: number;
  rhoBar: number;
  sigma2: number;
  tau2: number;
  topPeers: PeerDisplay[];
  emptyPeerSet: boolean;
}

function predictC(target: SnapshotProtocol, train: SnapshotProtocol[], vc: VarianceComponents): CPrediction {
  const sJ = sOf(target);
  const cat = target.category ?? '__null__';
  const sameCat = train.filter((p) => (p.category ?? '__null__') === cat && p.slug !== target.slug);
  const weighted = sameCat.map((p) => {
    const d = sOf(p) - sJ;
    const w = Math.exp(-(d * d) / (2 * H * H));
    return { p, w, rho: rhoOf(p), s: sOf(p) };
  });
  const sumW = sum(weighted.map((x) => x.w));
  const sumW2 = sum(weighted.map((x) => x.w * x.w));
  const empty = weighted.length === 0;
  const nEff = empty ? 0 : (sumW * sumW) / sumW2;
  const muLoc = empty ? null : sum(weighted.map((x) => x.w * x.rho)) / sumW;
  const lam = empty ? 0 : vc.tau2 / (vc.tau2 + vc.sigma2 / nEff);
  const mu = empty ? vc.rhoBar : lam * muLoc! + (1 - lam) * vc.rhoBar;
  const topPeers: PeerDisplay[] = [...weighted]
    .sort((a, b) => (b.w - a.w) || (a.p.name < b.p.name ? -1 : a.p.name > b.p.name ? 1 : 0) || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, 5)
    .map((x) => ({ name: x.p.name, slug: x.p.slug, w: x.w, rho: x.rho, s: x.s }));
  return {
    target, pred: Math.exp(sJ + mu), mu, lam, muLoc, nEff,
    nPeers: weighted.length, rhoBar: vc.rhoBar, sigma2: vc.sigma2, tau2: vc.tau2,
    topPeers, emptyPeerSet: empty,
  };
}

// ---------- LOO (primary): n=95, train = other 94 ----------
const looPreds: CPrediction[] = [];
const looVCs: VarianceComponents[] = [];
for (let i = 0; i < peers.length; i++) {
  const train = peers.filter((_, j) => j !== i);
  const vc = varianceComponents(train);
  looVCs.push(vc);
  looPreds.push(predictC(peers[i]!, train, vc));
}
const looErr = looPreds.map((pr, i) => Math.log(pr.pred / peers[i]!.mcap_usd!));
const looAbs = looErr.map(Math.abs);
const looFactor = Math.exp(median(looAbs));
const looWithin3 = (100 * looPreds.filter((pr, i) => Math.max(pr.pred / peers[i]!.mcap_usd!, peers[i]!.mcap_usd! / pr.pred) <= 3).length) / peers.length;
const looEmpty = looPreds.filter((p) => p.emptyPeerSet).length;

// Ridge LOO cross-check on the same folds (lib, independent of the frozen number).
const ridgeLooResid = looLogResiduals(peers, snap, MODEL); // log10(pred/actual)
const ridgeLooFactor = Math.pow(10, median(ridgeLooResid.map(Math.abs)));

// ---------- WF (secondary): train < 2025-01-01 (64), test >= (31) ----------
const trainWf = peers.filter((p) => p.listed_at! < '2025-01-01');
const testWf = peers.filter((p) => p.listed_at! >= '2025-01-01');
const vcWf = varianceComponents(trainWf);
const wfPreds = testWf.map((p) => predictC(p, trainWf, vcWf));
const wfErr = wfPreds.map((pr, i) => Math.log(pr.pred / testWf[i]!.mcap_usd!));
const wfAbs = wfErr.map(Math.abs);
const wfFactor = Math.exp(median(wfAbs));
const wfWithin3 = (100 * wfPreds.filter((pr, i) => Math.max(pr.pred / testWf[i]!.mcap_usd!, testWf[i]!.mcap_usd! / pr.pred) <= 3).length) / testWf.length;
const wfEmpty = wfPreds.filter((p) => p.emptyPeerSet).length;

// ---------- Bootstrap CIs (reporting only) ----------
function bootCI(absErrs: number[], baseFactor: number): { lo: number; hi: number; impLo: number; impHi: number } {
  const rng = mulberry32(BOOT_SEED);
  const n = absErrs.length;
  const facs: number[] = [];
  for (let b = 0; b < BOOT_N; b++) {
    const sample: number[] = [];
    for (let k = 0; k < n; k++) sample.push(absErrs[Math.floor(rng() * n)]!);
    facs.push(Math.exp(median(sample)));
  }
  facs.sort((a, b) => a - b);
  const lo = facs[Math.floor(0.025 * BOOT_N)]!;
  const hi = facs[Math.ceil(0.975 * BOOT_N) - 1]!;
  // Improvement vs frozen ridge LOO 2.74, computed per resample would need the
  // ridge resample too; the CI on improvement is the transform of the factor CI.
  return { lo, hi, impLo: (2.74 - hi) / 2.74, impHi: (2.74 - lo) / 2.74 };
}
const looBoot = bootCI(looAbs, looFactor);
const wfBoot = bootCI(wfAbs, wfFactor);

// ---------- Verdict (pre-registered) ----------
const RIDGE_LOO = 2.74;
const RIDGE_WF = 2.19;
const improvementLoo = (RIDGE_LOO - looFactor) / RIDGE_LOO;
const improvementWf = (RIDGE_WF - wfFactor) / RIDGE_WF;
let verdict: string;
let blindRun = false;
let blindScore = '';
// Literal pre-registered table: PASS clear >= +5%; PASS parity within ±2%
// AND blind >= 4-1; KILL worse than -2% AND blind <= 3-2; otherwise
// UNDECIDED. Blind is ONLY a tie-breaker in the parity band, so it is not
// run outside it — which leaves a non-parity worse result UNDECIDED on the
// letter of the table even though no blind outcome can reach PASS (the quant
// bar is required regardless of blind outcome, per the Arena plan). The
// substantive reading is recorded in VERDICT.md; the recorded verdict below
// follows the table literally and does not force a KILL.
if (improvementLoo >= 0.05) {
  verdict = 'PASS clear';
} else if (improvementLoo >= -0.02) {
  verdict = 'UNDECIDED — parity band (±2%), blind tie-breaker not run in this task (external judges via parent); no forced verdict, no re-run, no re-draw';
} else {
  verdict = 'UNDECIDED — worse than -2% on the quant bar, but the literal table requires blind <= 3-2 for KILL and blind is only run in the parity band, so it was not run; no blind outcome can reach PASS (quant bar failed decisively: LOO -24.7%, WF -139.6%); substantive recommendation is KILL — see VERDICT.md';
}
out('=== DIRECTION C — CATEGORY COMPS WITH HIERARCHICAL SHRINKAGE ===');
out(`peers n=${peers.length} (fit peers, listed_at present) | categories=${new Set(peers.map((p) => p.category)).size} | metric<=0 excluded=${excludedMetric.length} (logged; none)`);
out(`kernel h=${fmt(H, 4)} (0.75 dex, frozen) | bootstrap ${BOOT_N} resamples, mulberry32(${BOOT_SEED}) | blind seed ${BLIND_SEED} (only if parity)`);
out('');
out('--- LOO (primary, n=95) ---');
out(`C factor = exp(median |log err|) = x${fmt(looFactor, 2)} | median |log err| = ${fmt(median(looAbs), 4)} | within-3x = ${fmt(looWithin3, 1)}% | empty peer sets = ${looEmpty}/95`);
out(`ridge LOO cross-check (lib, same folds) = x${fmt(ridgeLooFactor, 2)} (frozen baseline x2.74)`);
out(`improvement vs ridge LOO = ${fmt(improvementLoo * 100, 1)}%  (bar: >= +5% PASS clear; <= -2% KILL; within ±2% parity)`);
out(`bootstrap 95% CI: C factor [x${fmt(looBoot.lo, 2)}, x${fmt(looBoot.hi, 2)}] | improvement [${fmt(looBoot.impLo * 100, 1)}%, ${fmt(looBoot.impHi * 100, 1)}%] (reporting only)`);
out(`variance components (median over LOO folds): tau2=${fmt(median(looVCs.map((v) => v.tau2)), 4)} | sigma2=${fmt(median(looVCs.map((v) => v.sigma2)), 4)} | rho_bar=${fmt(median(looVCs.map((v) => v.rhoBar)), 4)} | cats/fold=${median(looVCs.map((v) => v.nCats))} | n_c=1 cats/fold (median)=${median(looVCs.map((v) => v.catsWithN1))} | n_c=0 cats/fold (median)=${median(looVCs.map((v) => v.catsWithN0))}`);
out(`lam distribution (LOO): median=${fmt(median(looPreds.map((p) => p.lam)), 3)} | n_eff median=${fmt(median(looPreds.map((p) => p.nEff)), 2)} | nPeers median=${median(looPreds.map((p) => p.nPeers))}`);
out('');
out('--- WF (secondary, train 64 / test 31) ---');
out(`C factor = x${fmt(wfFactor, 2)} | within-3x = ${fmt(wfWithin3, 1)}% | empty peer sets = ${wfEmpty}/31`);
out(`improvement vs ridge WF (x2.19) = ${fmt(improvementWf * 100, 1)}%`);
out(`bootstrap 95% CI: C factor [x${fmt(wfBoot.lo, 2)}, x${fmt(wfBoot.hi, 2)}]`);
out(`WF variance components: tau2=${fmt(vcWf.tau2, 4)} | sigma2=${fmt(vcWf.sigma2, 4)} | rho_bar=${fmt(vcWf.rhoBar, 4)} | s2_btw=${fmt(vcWf.s2btw, 4)} | mean(1/n_c)=${fmt(vcWf.meanInvN, 4)} | cats=${vcWf.nCats} | n_c=1 cats=${vcWf.catsWithN1} | n_c=0 cats=${vcWf.catsWithN0}`);
out('');
out('--- VERDICT (pre-registered) ---');
out(`improvement vs ridge LOO = ${fmt(improvementLoo * 100, 1)}% | blind run = ${blindRun} | blind score = ${blindScore || 'n/a'}`);
out(`VERDICT: ${verdict}`);

// ---------- Outputs ----------
const peerRows = (preds: CPrediction[], acts: SnapshotProtocol[]) => preds.map((pr, i) => ({
  slug: pr.target.slug, name: pr.target.name, category: pr.target.category,
  tvl_usd: pr.target.tvl_usd, actual_mcap_usd: acts[i]!.mcap_usd,
  pred_mcap_usd: pr.pred, log_err_ln: Math.log(pr.pred / acts[i]!.mcap_usd!),
  max_ratio: Math.max(pr.pred / acts[i]!.mcap_usd!, acts[i]!.mcap_usd! / pr.pred),
  mu: pr.mu, lam: pr.lam, mu_loc: pr.muLoc, n_eff: pr.nEff, n_peers: pr.nPeers,
  rho_bar: pr.rhoBar, sigma2: pr.sigma2, tau2: pr.tau2,
  empty_peer_set: pr.emptyPeerSet,
  top_peers: pr.topPeers.map((t) => ({
    name: t.name, slug: t.slug, w: Number(t.w.toFixed(3)), rho: Number(t.rho.toFixed(3)), s: Number(t.s.toFixed(3)),
  })),
  peer_note: pr.emptyPeerSet ? 'No launched peers in category — shrunk to global mean' : undefined,
}));

const results = {
  spec: 'Direction C per Arena kimi-k3 spec; metric=TVL; h=0.75 dex frozen; median estimator, no sigma2/2; bootstrap 1000 mulberry32(555000); blind seed 11 (only if parity)',
  baselines_frozen: { ridge_loo: RIDGE_LOO, ridge_wf: RIDGE_WF },
  exclusions: { metric_le_0: excludedMetric.map((p) => p.slug) },
  loo: {
    n: peers.length, factor: looFactor, median_abs_log_err: median(looAbs),
    within3_pct: looWithin3, empty_peer_sets: looEmpty,
    ridge_loo_crosscheck: ridgeLooFactor,
    improvement_vs_ridge_loo_pct: improvementLoo * 100,
    bootstrap_ci95_factor: [looBoot.lo, looBoot.hi],
    bootstrap_ci95_improvement_pct: [looBoot.impLo * 100, looBoot.impHi * 100],
  },
  wf: {
    train_n: trainWf.length, test_n: testWf.length, factor: wfFactor,
    median_abs_log_err: median(wfAbs), within3_pct: wfWithin3, empty_peer_sets: wfEmpty,
    improvement_vs_ridge_wf_pct: improvementWf * 100,
    bootstrap_ci95_factor: [wfBoot.lo, wfBoot.hi],
    variance_components: vcWf,
  },
  loo_variance_components_median: {
    tau2: median(looVCs.map((v) => v.tau2)), sigma2: median(looVCs.map((v) => v.sigma2)),
    rho_bar: median(looVCs.map((v) => v.rhoBar)),
  },
  blind: { run: blindRun, score: blindScore || null, note: 'Only a tie-breaker in the parity band; not run here.' },
  verdict,
};
writeFileSync(`${OUTDIR}/results.json`, JSON.stringify(results, null, 2));
writeFileSync(`${OUTDIR}/loo-peers.json`, JSON.stringify(peerRows(looPreds, peers), null, 2));
writeFileSync(`${OUTDIR}/wf-peers.json`, JSON.stringify(peerRows(wfPreds, testWf), null, 2));
writeFileSync(`${OUTDIR}/results.md`, log.join('\n') + '\n');
out('');
out(`wrote ${OUTDIR}/results.json, loo-peers.json, wf-peers.json, results.md`);
