// Round 12 Phase 1 — diagnostics (OFFLINE, read-only).
// Recomputes, independently of lib's fitOdds aggregates:
//  1. Brier skill gate: climatology (base-rate) Brier per split, model Brier
//     (replicated LOO + WF logistic, age+size), Brier skill, ECE per split.
//  2. LOO-vs-WF inversion: per-fold LOO log-residuals, tail dominance.
//  3. Split-conformal 80% intervals on the WF folds (date-split calibration).
//  4. Reconciliation + TVL-only-naive baseline delta, from the frozen
//     round-8 rebuild (round12-phase01/out-r8a).
// Writes results only into round12-phase01/ (phase1-results.json/.md).
// Run: node round12-phase01/phase1.ts  (from ~/workspace/makefun/token-radar)
import { readFileSync, writeFileSync } from 'node:fs';
import {
  parseSnapshot, fitPeersOf, fitModel, impliedValue, looLogResiduals,
  median, percentile, solveLinear, ageYears, isPreToken, MODEL,
  type SnapshotProtocol,
} from '../lib/model.ts';

const SNAP = '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json';
const OUT = 'round12-phase01/out-r8a';
const snap = parseSnapshot(readFileSync(SNAP, 'utf8'));
const log: string[] = [];
const out = (s: string) => { console.log(s); log.push(s); };
const fmt = (v: number, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : String(v));
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const brier = (preds: number[], ys: number[]) => preds.reduce((s, p, i) => s + (p - ys[i]!) ** 2, 0) / ys.length;

// ---------- 1. Odds: replicate lib's age+size logistic LOO + WF ----------
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const rankableType = (p: SnapshotProtocol): boolean => p.category !== 'CEX' && !VERSIONED.test(p.name);
const train = snap.protocols.filter((p) => p.listed_at !== null && rankableType(p));
const ys = train.map((p) => (isPreToken(p) ? 0 : 1));
const baseRate = mean(ys);
const logit = (z: number): number => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
const feats = (p: SnapshotProtocol): number[] => [ageYears(snap.as_of, p.listed_at), Math.log(p.tvl_usd) - Math.log(1e8)];
// Newton-Raphson IRLS, mirroring lib/model.ts fitLogit (ridge 1e-6, 50 iters).
function fitLogit(set: SnapshotProtocol[], setY: number[]): number[] {
  const X = set.map((p) => [1, ...feats(p)]);
  const base = mean(setY);
  const d = 3;
  let beta = [Math.log(base / (1 - base)), 0, 0];
  for (let it = 0; it < 50; it++) {
    const ps = X.map((row) => logit(row.reduce((s, v, j) => s + v * beta[j]!, 0)));
    const A = Array.from({ length: d }, () => new Array<number>(d).fill(0));
    const g = new Array<number>(d).fill(0);
    for (let i = 0; i < set.length; i++) {
      const w = Math.max(1e-6, ps[i]! * (1 - ps[i]!));
      const r = setY[i]! - ps[i]!;
      for (let a = 0; a < d; a++) {
        g[a]! += X[i]![a]! * r;
        for (let b = 0; b < d; b++) A[a]![b]! += w * X[i]![a]! * X[i]![b]!;
      }
    }
    for (let j = 1; j < d; j++) A[j]![j]! += 1e-6;
    const step = solveLinear(A, g);
    let maxStep = 0;
    for (let j = 0; j < d; j++) { beta[j]! += step[j]!; maxStep = Math.max(maxStep, Math.abs(step[j]!)); }
    if (maxStep < 1e-9) break;
  }
  return beta;
}
const pred1 = (beta: number[], p: SnapshotProtocol): number => logit(beta[0]! + beta[1]! * feats(p)[0]! + beta[2]! * feats(p)[1]!);
const looPreds = train.map((p, i) => {
  const tr = train.filter((_, j) => j !== i);
  const trY = ys.filter((_, j) => j !== i);
  return pred1(fitLogit(tr, trY), p);
});
const trainWf = train.filter((p) => p.listed_at! < '2025-01-01');
const testWf = train.filter((p) => p.listed_at! >= '2025-01-01');
const yWfTrain = trainWf.map((p) => (isPreToken(p) ? 0 : 1));
const yWfTest = testWf.map((p) => (isPreToken(p) ? 0 : 1));
const baseWf = mean(yWfTrain);
const wfFit = fitLogit(trainWf, yWfTrain);
const wfPreds = testWf.map((p) => pred1(wfFit, p));
const brierLoo = brier(looPreds, ys);
const brierWf = brier(wfPreds, yWfTest);
const climLoo = brier(ys.map(() => baseRate), ys);
const climWf = brier(yWfTest.map(() => baseWf), yWfTest);
const skillLoo = 1 - brierLoo / climLoo;
const skillWf = 1 - brierWf / climWf;
// ECE, 10 equal-count bins by predicted probability.
function ece(preds: number[], actual: number[]): number {
  const order = preds.map((_, i) => i).sort((a, b) => preds[a]! - preds[b]!);
  const n = preds.length;
  let e = 0;
  for (let b = 0; b < 10; b++) {
    const idx = order.slice(Math.floor((b * n) / 10), Math.floor(((b + 1) * n) / 10));
    if (idx.length === 0) continue;
    const mp = mean(idx.map((i) => preds[i]!));
    const mo = mean(idx.map((i) => actual[i]!));
    e += (idx.length / n) * Math.abs(mo - mp);
  }
  return e;
}
const eceLoo = ece(looPreds, ys);
const eceWf = ece(wfPreds, yWfTest);
out('=== 1. BRIER SKILL GATE (independent replication of lib fitOdds) ===');
out(`odds train n=${train.length} baseRate=${fmt(baseRate)} | WF train=${trainWf.length} test=${testWf.length} baseWf=${fmt(baseWf)}`);
out(`replicated LOO Brier=${fmt(brierLoo)} (lib 0.2085) | WF Brier=${fmt(brierWf)} (lib 0.2253)`);
out(`climatology Brier: LOO=${fmt(climLoo)} (lib baseBrierLoo 0.2499) | WF=${fmt(climWf)} (lib baseBrierWf 0.3316)`);
out(`Brier skill: LOO=${fmt(skillLoo)} | WF=${fmt(skillWf)}  (bar: skill >= +0.05 on BOTH splits)`);
out(`ECE (10 equal-count bins): LOO=${fmt(eceLoo)} | WF=${fmt(eceWf)}  (bar if recalibrating: worse split Brier <= 0.215 and ECE <= 0.03)`);
out(`GATE: ${skillLoo >= 0.05 && skillWf >= 0.05 ? 'PASS — no recalibration indicated' : 'FAIL — recalibration required'}`);

// ---------- 2. LOO-vs-WF inversion: per-fold tail dominance ----------
const peers = fitPeersOf(snap).slice().sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : 0));
const resid = looLogResiduals(peers, snap, MODEL); // log10(pred/actual), n=95
const maxr = resid.map((r) => Math.pow(10, Math.abs(r)));
const sq = resid.map((r) => r * r);
const sqTot = sum(sq);
const orderDesc = [...sq].map((_, i) => i).sort((a, b) => sq[b]! - sq[a]!);
const topShare = (k: number) => sum(orderDesc.slice(0, k).map((i) => sq[i]!)) / sqTot;
const medMaxExcl = (k: number) => {
  const rest = maxr.filter((_, i) => !orderDesc.slice(0, k).includes(i));
  return median(rest);
};
out('');
out('=== 2. LOO-vs-WF INVERSION (per-fold LOO residuals, n=95) ===');
out(`LOO median max-ratio=${fmt(median(maxr), 2)} | P90=${fmt(Math.pow(10, percentile(resid.map((r) => Math.abs(r)), 0.9)), 2)} | max=${fmt(Math.max(...maxr), 2)}`);
out(`worst 5 folds: ${orderDesc.slice(0, 5).map((i) => `${peers[i]!.name} x${fmt(maxr[i]!, 1)}`).join(', ')}`);
out(`share of sum of squared log-errors: top-5 folds=${fmt(topShare(5) * 100, 1)}% | top-10=${fmt(topShare(10) * 100, 1)}% | top-19 (20%)=${fmt(topShare(19) * 100, 1)}%`);
out(`median max-ratio excluding worst 5=${fmt(medMaxExcl(5), 2)} | excluding worst 10=${fmt(medMaxExcl(10), 2)} | excluding worst 19=${fmt(medMaxExcl(19), 2)}`);
out(`WF-cutoff (n=31) median x2.19 vs LOO (n=95) median x2.74: LOO is WORSE than WF despite the larger, easier-looking pool.`);
out(`tail verdict: ${topShare(10) >= 0.5 ? 'a few tail folds dominate LOO (top-10 >= 50% of squared log-error) — evidence FOR Direction A (nonlinear/quantile)' : 'no single tail dominates; the LOO/WF gap is broad, not a few folds'}`);

// ---------- 3. Split-conformal 80% intervals on the WF folds ----------
const trainV = peers.filter((p) => p.listed_at! < '2025-01-01'); // 64
const testV = peers.filter((p) => p.listed_at! >= '2025-01-01'); // 31
const noGm = (p: SnapshotProtocol, f: ReturnType<typeof fitModel>): number => impliedValue(p, f, snap.as_of, MODEL, false).raw;
// Variant A: date-split calibration — fit oldest 48 of train, calibrate newest 16.
const fitA = trainV.slice(0, 48);
const calA = trainV.slice(48);
const fA = fitModel(fitA, MODEL);
const sA = calA.map((p) => Math.abs(Math.log10(noGm(p, fA) / p.mcap_usd!))).sort((a, b) => a - b);
const qA = sA[Math.ceil((calA.length + 1) * 0.8) - 1]!;
const covA = testV.filter((p) => Math.abs(Math.log10(noGm(p, fA) / p.mcap_usd!)) <= qA).length / testV.length;
// Variant B: calibration = LOO residuals of the 64 train peers (train-only).
const residTrain: number[] = [];
for (let i = 0; i < trainV.length; i++) {
  const tr = trainV.filter((_, j) => j !== i);
  const f = fitModel(tr, MODEL);
  residTrain.push(Math.abs(Math.log10(noGm(trainV[i]!, f) / trainV[i]!.mcap_usd!)));
}
residTrain.sort((a, b) => a - b);
const qB = residTrain[Math.ceil((trainV.length + 1) * 0.8) - 1]!;
const fFull = fitModel(trainV, MODEL);
const covB = testV.filter((p) => Math.abs(Math.log10(noGm(p, fFull) / p.mcap_usd!)) <= qB).length / testV.length;
out('');
out('=== 3. SPLIT-CONFORMAL 80% INTERVALS (WF folds, n=31 test) ===');
out(`variant A (fit oldest 48, calibrate newest 16): q80=${fmt(qA)} dex (x${fmt(Math.pow(10, qA), 2)}) coverage=${fmt(covA * 100, 1)}% (${Math.round(covA * 31)}/31)`);
out(`variant B (calibrate on LOO residuals of 64 train peers): q80=${fmt(qB)} dex (x${fmt(Math.pow(10, qB), 2)}) coverage=${fmt(covB * 100, 1)}% (${Math.round(covB * 31)}/31)`);
out(`bar: 80% coverage within 76-84% on WF folds. Cross-check: implemented band timeCov80=74.2% (23/31).`);
out(`GATE A: ${covA >= 0.76 && covA <= 0.84 ? 'PASS' : 'FAIL'} | GATE B: ${covB >= 0.76 && covB <= 0.84 ? 'PASS' : 'FAIL'}`);

// ---------- 4. Reconciliation + TVL-only-naive baseline delta ----------
const board = JSON.parse(readFileSync(`${OUT}/board.json`, 'utf8')).rows as any[];
const dataJs = readFileSync(`${OUT}/data.js`, 'utf8');
const radar = JSON.parse(dataJs.slice('window.RADAR='.length).replace(/;\s*$/, ''));
const wl = board.filter((r: any) => r.is_watchlist);
const early = board.filter((r: any) => !r.is_watchlist);
const sImplied = (rs: any[]) => rs.reduce((s: number, r: any) => s + r.implied_value_usd, 0);
const sVil = (rs: any[]) => rs.reduce((s: number, r: any) => s + r.model.value_if_launches, 0);
const acct = radar.accounting.groups.reduce((s: number, g: any) => s + g.count, 0);
const flatLoo = radar.validation.loo.find((r: any) => r.model.startsWith('flat'));
const flatWf = radar.validation.flatTimeSplitMedianMaxRatio;
const flatWfHalf = radar.validation.flatWfHalfMedianMaxRatio;
const flatBlind = radar.validation.flatBlindMedianMaxRatio;
out('');
out('=== 4. RECONCILIATION + BASELINE-DELTA HEADLINE ===');
out(`accounting groups sum=${acct} (snapshot total 758) — groups: ${radar.accounting.groups.map((g: any) => `${g.label} ${g.count}`).join(' | ')}`);
out(`board rows=${board.length} (watchlist ${wl.length} + early ${early.length})`);
out(`implied totals: board $${(sImplied(board) / 1e6).toFixed(1)}M = watchlist $${(sImplied(wl) / 1e6).toFixed(1)}M + early $${(sImplied(early) / 1e6).toFixed(1)}M`);
out(`value-if-launches totals: board $${(sVil(board) / 1e6).toFixed(1)}M = watchlist $${(sVil(wl) / 1e6).toFixed(1)}M + early $${(sVil(early) / 1e6).toFixed(1)}M`);
out(`verdicts: ${JSON.stringify(board.reduce((m: any, r: any) => { m[r.farm.verdict] = (m[r.farm.verdict] || 0) + 1; return m; }, {}))} (FARM total incl. P25-POSITIVE = ${board.filter((r: any) => r.farm.verdict === 'FARM' || r.farm.verdict === 'P25-POSITIVE').length})`);
out(`TVL-only naive (flat 0.25x constant multiple): LOO x${fmt(flatLoo.medianMaxRatio, 2)} within-3x ${fmt(flatLoo.within3, 1)}% | WF-cutoff x${fmt(flatWf, 2)} | WF-half x${fmt(flatWfHalf, 2)} | blind x${fmt(flatBlind, 2)}`);
out(`adopted ridge: LOO x${fmt(radar.validation.adoptedMedianMaxRatio, 2)} within-3x ${fmt(radar.validation.adoptedWithin3, 1)}% | WF-cutoff x${fmt(radar.validation.timeSplitMedianMaxRatio, 2)} | WF-half x${fmt(radar.validation.wfHalfMedianMaxRatio, 2)} | blind x${fmt(radar.validation.blindMedianMaxRatio, 2)}`);
out(`HEADLINE: the ridge beats the TVL-only naive model by ${fmt((1 - radar.validation.timeSplitMedianMaxRatio / flatWf) * 100, 0)}% on walk-forward error (x${fmt(radar.validation.timeSplitMedianMaxRatio, 2)} vs x${fmt(flatWf, 2)}), ${fmt((1 - radar.validation.adoptedMedianMaxRatio / flatLoo.medianMaxRatio) * 100, 0)}% on LOO (x${fmt(radar.validation.adoptedMedianMaxRatio, 2)} vs x${fmt(flatLoo.medianMaxRatio, 2)}).`);

writeFileSync('round12-phase01/phase1-results.json', JSON.stringify({
  brier: { loo: brierLoo, wf: brierWf, climLoo, climWf, skillLoo, skillWf, eceLoo, eceWf, gate: skillLoo >= 0.05 && skillWf >= 0.05 },
  looTail: { medianMax: median(maxr), p90Max: Math.pow(10, percentile(resid.map((r) => Math.abs(r)), 0.9)), top5Share: topShare(5), top10Share: topShare(10), top19Share: topShare(19), medianExcl5: medMaxExcl(5), medianExcl10: medMaxExcl(10), medianExcl19: medMaxExcl(19) },
  conformal: { variantA: { q80dex: qA, coverage: covA }, variantB: { q80dex: qB, coverage: covB } },
  reconciliation: { accountingSum: acct, boardRows: board.length, impliedBoardM: sImplied(board) / 1e6, impliedWatchM: sImplied(wl) / 1e6, impliedEarlyM: sImplied(early) / 1e6, vilBoardM: sVil(board) / 1e6, vilWatchM: sVil(wl) / 1e6 },
  flatBaseline: { loo: flatLoo.medianMaxRatio, looWithin3: flatLoo.within3, wfCutoff: flatWf, wfHalf: flatWfHalf, blind: flatBlind },
}, null, 2));
writeFileSync('round12-phase01/phase1-results.md', log.join('\n') + '\n');
out('');
out('wrote round12-phase01/phase1-results.json and phase1-results.md');
