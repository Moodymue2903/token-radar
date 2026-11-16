// Token Radar round 2 — Stage A: clean-comps experiment.
//
// FROZEN DESIGN (written before any variant was run; do not tune after seeing results).
//
// SPLITS (identical for all four variants; test observations never touch fitting):
//   Blind 80/20 x5: seeds [11,23,37,41,53], mulberry32 + Fisher-Yates over the 128 peer
//     indices in snapshot order, hold = first 26 shuffled indices. This is EXACTLY the
//     split generator in lib/model.ts validateModel, so M0's blind numbers reproduce
//     round 1's reported blindMedian/blindWithin2.
//   Time-split: train = listed_at < '2025-01-01' (97 peers), test = listed_at >= '2025-01-01'
//     (31 peers); peers with listed_at null (33) are in NEITHER side, as in round 1.
//   LOO: all 128 folds, full refit each fold, filtering applied within-train each fold.
// LEAKAGE RULES: every filter, winsor bound, category calibration, size-curve fit and
//   hyperparameter is computed from TRAIN peers only inside each split/fold. The only
//   whole-snapshot inputs are the peer-universe definition (isPeer: token present,
//   mcap>0, tvl>0) and the fixed a-priori constants below. No test target is ever used
//   to select peers, set a threshold, or pick a variant.
//
// VARIANTS (predictions exclude growth/maturity throughout — the round-1 LOO convention):
//   M0 current 128-peer model: fitModel(train) + impliedValue no-gm.
//   M1 strict clean-comps: peers filtered by R1+R2+R3 (below), then SIZE CURVE ONLY
//     (OLS log10 mcap on log10 tvl on the filtered train peers). Tests the clean peer
//     set in its purest form.
//   M2 category-specific robust regression: per-category Huber-IRLS log-log fit for
//     categories with n_train >= 8, slope shrunk toward the global Huber slope
//     (w = n/(n+10)), shrunk slope clipped to [0.3, 0.8] (sub-linear scaling is the
//     established regularity; superlinear slopes on n<=15 are noise — round-1 variant 5
//     fitted plain OLS per category and got Lending 1.50 / Dexs 1.78, worst RMSE, so
//     this variant exists precisely to test whether shrinkage + robustness fixes that),
//     intercept = median residual given the shrunk slope; categories with n_train < 8
//     use the global Huber fit. No category multiples.
//   M3 hybrid clean-comps + category shrinkage: M1's filtered peer set + the FULL M0
//     machinery (fitModel + impliedValue no-gm). M0 vs M3 isolates the peer filter;
//     M1 vs M3 isolates the category-shrinkage machinery on clean peers.
//
// M1/M3 CLEAN-COMPS RULES (fixed a priori, on observable features only):
//   R1. Exclude category CEX (exchange-held assets are not protocol TVL; the board
//       itself already excludes CEX from ranking).
//   R2. Exclude versioned pool names (VERSIONED regex: a slice of another protocol's
//       economics, not a standalone comparable).
//   R3. Exclude ratios mcap/tvl outside [0.01, 10] (a 1000x span; beyond it the token
//       is not priced off its TVL — dust TVL, or value that comes from elsewhere).
//   NOTE on token-family dedup: the snapshot carries NO duplicate gecko_id and NO
//   duplicate symbol among the 128 peers (verified 2026-11-16), so there is nothing
//   to deduplicate by token identity; R2 (versioned names) is the only family-style
//   removal, and it removes exactly one peer (aave-v2).
//
// METRICS per variant per protocol (blind / time-split / LOO): median 1+MdAPE
//   ("median error"), median max-ratio, % within 2x, % within 3x, log10 RMSE,
//   Spearman(pred, act), worst-5 max-ratios, per-category pooled blind median (n>=5).
//   Blind aggregates are the MEAN of the 5 per-seed values (round-1 convention);
//   pooled blind values are reported as a secondary check (peers repeat across seeds).
//
// DECISION RULE (from the brief, not overridable here): ship a variant only if it beats
//   M0 on blind median error AND is not worse on blind Spearman. A variant that beats
//   one clearly and is slightly worse on the other is a STOP-and-report tradeoff, not
//   a ship. No variant beating M0 means Stage B falls back to bands + reframe on M0.
//
// Run with the kit's Node 22 (type stripping):
//   ~/workspace/makefun/node22/node-v22.23.5-linux-x64/bin/node stageA/experiment.ts

import { readFileSync } from 'node:fs';
import {
  MODEL,
  fitModel,
  impliedValue,
  looMetrics,
  median,
  mulberry32,
  ols,
  parseSnapshot,
  peersOf,
  spearman,
  type FittedModel,
  type SnapshotProtocol,
} from '../../lib/model.ts';

const SNAPSHOT = '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json';
const SEEDS = [11, 23, 37, 41, 53];
const TIME_CUT = '2025-01-01';
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

const snapshot = parseSnapshot(readFileSync(SNAPSHOT, 'utf8'));
const PEERS = peersOf(snapshot); // 128, snapshot order
const AS_OF = snapshot.as_of;

// ---------------------------------------------------------------- filters
function isClean(p: SnapshotProtocol): boolean {
  if ((p.category ?? '') === 'CEX') return false;
  if (VERSIONED.test(p.name)) return false;
  const r = p.mcap_usd! / p.tvl_usd;
  if (r < 0.01 || r > 10) return false;
  return true;
}

// ---------------------------------------------------------------- Huber IRLS
function huberFit(xs: number[], ys: number[]): { a: number; b: number } {
  let { a, b } = ols(xs, ys);
  for (let iter = 0; iter < 50; iter++) {
    const res = ys.map((y, i) => y - (a + b * xs[i]!));
    const med = median(res);
    const mad = median(res.map((r) => Math.abs(r - med)));
    const sigma = Math.max(1.4826 * mad, 1e-9);
    const k = 1.345 * sigma;
    const w = res.map((r) => (Math.abs(r) <= k ? 1 : k / Math.abs(r)));
    let sw = 0;
    let swx = 0;
    let swy = 0;
    let swxx = 0;
    let swxy = 0;
    for (let i = 0; i < xs.length; i++) {
      sw += w[i]!;
      swx += w[i]! * xs[i]!;
      swy += w[i]! * ys[i]!;
      swxx += w[i]! * xs[i]! * xs[i]!;
      swxy += w[i]! * xs[i]! * ys[i]!;
    }
    const denom = sw * swxx - swx * swx;
    if (denom === 0) break;
    const b2 = (sw * swxy - swx * swy) / denom;
    const a2 = (swy - b2 * swx) / sw;
    const done = Math.abs(b2 - b) < 1e-10 && Math.abs(a2 - a) < 1e-10;
    a = a2;
    b = b2;
    if (done) break;
  }
  return { a, b };
}

// ---------------------------------------------------------------- variants
type Predictor = (p: SnapshotProtocol) => number;

function m0(train: SnapshotProtocol[]): Predictor {
  const f = fitModel(train);
  return (p) => impliedValue(p, f, AS_OF, MODEL, false).raw;
}

function m1(train: SnapshotProtocol[]): Predictor {
  const clean = train.filter(isClean);
  const xs = clean.map((p) => Math.log10(p.tvl_usd));
  const ys = clean.map((p) => Math.log10(p.mcap_usd!));
  const { a, b } = ols(xs, ys);
  return (p) => Math.max(1, Math.pow(10, a + b * Math.log10(p.tvl_usd)));
}

function m2(train: SnapshotProtocol[]): Predictor {
  const xsAll = train.map((p) => Math.log10(p.tvl_usd));
  const ysAll = train.map((p) => Math.log10(p.mcap_usd!));
  const g = huberFit(xsAll, ysAll);
  const byCat = new Map<string | null, SnapshotProtocol[]>();
  for (const p of train) {
    const bucket = byCat.get(p.category) ?? [];
    bucket.push(p);
    byCat.set(p.category, bucket);
  }
  const catFit = new Map<string | null, { a: number; b: number }>();
  for (const [cat, ps] of byCat) {
    if (ps.length < 8) continue;
    const xs = ps.map((p) => Math.log10(p.tvl_usd));
    const ys = ps.map((p) => Math.log10(p.mcap_usd!));
    const cf = huberFit(xs, ys);
    const w = ps.length / (ps.length + 10);
    let b = w * cf.b + (1 - w) * g.b;
    b = Math.max(0.3, Math.min(0.8, b));
    const a = median(ps.map((p) => Math.log10(p.mcap_usd!) - b * Math.log10(p.tvl_usd)));
    catFit.set(cat, { a, b });
  }
  return (p) => {
    const cf = catFit.get(p.category);
    const { a, b } = cf ?? g;
    return Math.max(1, Math.pow(10, a + b * Math.log10(p.tvl_usd)));
  };
}

function m3(train: SnapshotProtocol[]): Predictor {
  const clean = train.filter(isClean);
  const f = fitModel(clean);
  return (p) => impliedValue(p, f, AS_OF, MODEL, false).raw;
}

const VARIANTS: Record<string, (train: SnapshotProtocol[]) => Predictor> = { M0, M1, M2, M3 };
function M0(t: SnapshotProtocol[]): Predictor {
  return m0(t);
}
function M1(t: SnapshotProtocol[]): Predictor {
  return m1(t);
}
function M2(t: SnapshotProtocol[]): Predictor {
  return m2(t);
}
function M3(t: SnapshotProtocol[]): Predictor {
  return m3(t);
}

// ---------------------------------------------------------------- splits
function blindSplits(): { train: SnapshotProtocol[]; test: SnapshotProtocol[] }[] {
  const holdN = Math.round(PEERS.length * 0.2); // 26
  return SEEDS.map((seed) => {
    const rng = mulberry32(seed);
    const idx = PEERS.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = idx[i]!;
      idx[i] = idx[j]!;
      idx[j] = tmp;
    }
    const hold = new Set(idx.slice(0, holdN));
    return {
      train: PEERS.filter((_, i) => !hold.has(i)),
      test: PEERS.filter((_, i) => hold.has(i)),
    };
  });
}

function timeSplit(): { train: SnapshotProtocol[]; test: SnapshotProtocol[] } {
  return {
    train: PEERS.filter((p) => p.listed_at !== null && p.listed_at < TIME_CUT),
    test: PEERS.filter((p) => p.listed_at !== null && p.listed_at >= TIME_CUT),
  };
}

// ---------------------------------------------------------------- metrics
interface FullMetrics {
  median: number;
  medianMax: number;
  within2: number;
  within3: number;
  logRmse: number;
  spearman: number;
  worst5: { slug: string; pred: number; act: number; ratio: number }[];
}

function fullMetrics(preds: number[], acts: number[], slugs: string[]): FullMetrics {
  const m = looMetrics(preds, acts);
  const worst = preds
    .map((p, i) => ({ slug: slugs[i]!, pred: p, act: acts[i]!, ratio: Math.max(p / acts[i]!, acts[i]! / p) }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 5);
  return {
    median: m.median1p,
    medianMax: m.medianMax,
    within2: m.within2,
    within3: m.within3,
    logRmse: m.logRmse,
    spearman: m.spearman,
    worst5: worst,
  };
}

const fmt = (x: number, d = 4): string => (Number.isFinite(x) ? x.toFixed(d) : 'NaN');

// ---------------------------------------------------------------- run
console.log(`Stage A: ${PEERS.length} peers, blind 80/20 x5 seeds ${SEEDS.join(',')}, time-split cut ${TIME_CUT}`);
const cleanFull = PEERS.filter(isClean);
const removed = PEERS.filter((p) => !isClean(p));
console.log(
  `clean-comps filter on the full peer set: ${cleanFull.length}/${PEERS.length} kept; removed ${removed.length}: ` +
    `CEX ${removed.filter((p) => p.category === 'CEX').length}, ` +
    `versioned ${removed.filter((p) => VERSIONED.test(p.name)).length}, ` +
    `ratio outside [0.01,10] ${removed.filter((p) => { const r = p.mcap_usd! / p.tvl_usd; return r < 0.01 || r > 10; }).length} ` +
    `(overlaps counted in each bucket)`,
);
console.log(`removed slugs: ${removed.map((p) => p.slug).join(', ')}`);

const splits = blindSplits();
const ts = timeSplit();
console.log(`blind: ${splits[0]!.train.length} train / ${splits[0]!.test.length} test per seed; time-split: ${ts.train.length} train / ${ts.test.length} test`);

for (const [name, build] of Object.entries(VARIANTS)) {
  // blind x5
  const perSeed: FullMetrics[] = [];
  const pooledPreds: number[] = [];
  const pooledActs: number[] = [];
  const pooledSlugs: string[] = [];
  const pooledCats: (string | null)[] = [];
  for (const s of splits) {
    const predict = build(s.train);
    const preds = s.test.map((p) => predict(p));
    const acts = s.test.map((p) => p.mcap_usd!);
    perSeed.push(fullMetrics(preds, acts, s.test.map((p) => p.slug)));
    pooledPreds.push(...preds);
    pooledActs.push(...acts);
    pooledSlugs.push(...s.test.map((p) => p.slug));
    pooledCats.push(...s.test.map((p) => p.category));
  }
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  const blindPooled = fullMetrics(pooledPreds, pooledActs, pooledSlugs);
  // time-split
  const tsPredict = build(ts.train);
  const tsM = fullMetrics(
    ts.test.map((p) => tsPredict(p)),
    ts.test.map((p) => p.mcap_usd!),
    ts.test.map((p) => p.slug),
  );
  // LOO (full refit each fold; filtering inside each fold's train)
  const looPreds: number[] = [];
  const looActs: number[] = [];
  for (let i = 0; i < PEERS.length; i++) {
    const train = PEERS.filter((_, j) => j !== i);
    looPreds.push(build(train)(PEERS[i]!));
    looActs.push(PEERS[i]!.mcap_usd!);
  }
  const looM = fullMetrics(looPreds, looActs, PEERS.map((p) => p.slug));
  // per-category pooled blind median (n>=5 pooled test obs)
  const catApe = new Map<string, number[]>();
  pooledPreds.forEach((p, i) => {
    const ape = Math.abs(p - pooledActs[i]!) / pooledActs[i]!;
    const key = pooledCats[i] ?? '(null)';
    const arr = catApe.get(key) ?? [];
    arr.push(ape);
    catApe.set(key, arr);
  });
  const catLines = [...catApe.entries()]
    .filter(([, v]) => v.length >= 5)
    .map(([k, v]) => `${k} n=${v.length} med-x${(1 + median(v)).toFixed(2)}`)
    .sort();

  console.log(`\n=== ${name} ===`);
  console.log(`BLIND x5 (mean of 5 seeds): median x${fmt(mean(perSeed.map((m) => m.median)))} | medMax x${fmt(mean(perSeed.map((m) => m.medianMax)))} | within2 ${fmt(mean(perSeed.map((m) => m.within2)), 1)}% | within3 ${fmt(mean(perSeed.map((m) => m.within3)), 1)}% | logRMSE ${fmt(mean(perSeed.map((m) => m.logRmse)))} | Spearman ${fmt(mean(perSeed.map((m) => m.spearman)), 3)}`);
  console.log(`  per-seed medians: ${perSeed.map((m) => `x${m.median.toFixed(3)}`).join(' ')} | per-seed Spearman: ${perSeed.map((m) => m.spearman.toFixed(3)).join(' ')}`);
  console.log(`  BLIND pooled (130 preds): median x${fmt(blindPooled.median)} | within2 ${fmt(blindPooled.within2, 1)}% | within3 ${fmt(blindPooled.within3, 1)}% | Spearman ${fmt(blindPooled.spearman, 3)} | worst max-ratio x${fmt(blindPooled.worst5[0]!.ratio, 1)} (${blindPooled.worst5[0]!.slug})`);
  console.log(`  worst-5 pooled: ${blindPooled.worst5.map((w) => `${w.slug} x${w.ratio.toFixed(1)}`).join(', ')}`);
  console.log(`  per-category pooled blind median (n>=5): ${catLines.join(' | ')}`);
  console.log(`TIME-SPLIT (n=${ts.test.length}): median x${fmt(tsM.median)} | medMax x${fmt(tsM.medianMax)} | within2 ${fmt(tsM.within2, 1)}% | within3 ${fmt(tsM.within3, 1)}% | logRMSE ${fmt(tsM.logRmse)} | Spearman ${fmt(tsM.spearman, 3)}`);
  console.log(`LOO (n=128): median x${fmt(looM.median)} | medMax x${fmt(looM.medianMax)} | within2 ${fmt(looM.within2, 1)}% | within3 ${fmt(looM.within3, 1)}% | logRMSE ${fmt(looM.logRmse)} | Spearman ${fmt(looM.spearman, 3)}`);
}

// M2 internals, for the record: which categories got their own curve on the full peer set
{
  const g = huberFit(
    PEERS.map((p) => Math.log10(p.tvl_usd)),
    PEERS.map((p) => Math.log10(p.mcap_usd!)),
  );
  console.log(`\nM2 internals (full 128 peers): global Huber a=${g.a.toFixed(4)} b=${g.b.toFixed(4)} (OLS b=0.5223)`);
  const byCat = new Map<string | null, SnapshotProtocol[]>();
  for (const p of PEERS) {
    const bucket = byCat.get(p.category) ?? [];
    bucket.push(p);
    byCat.set(p.category, bucket);
  }
  for (const [cat, ps] of [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)) {
    if (ps.length < 8) continue;
    const cf = huberFit(
      ps.map((p) => Math.log10(p.tvl_usd)),
      ps.map((p) => Math.log10(p.mcap_usd!)),
    );
    const w = ps.length / (ps.length + 10);
    let b = w * cf.b + (1 - w) * g.b;
    const clipped = b < 0.3 || b > 0.8;
    b = Math.max(0.3, Math.min(0.8, b));
    console.log(`  ${cat}: n=${ps.length} raw Huber b=${cf.b.toFixed(3)} w=${w.toFixed(2)} shrunk b=${b.toFixed(3)}${clipped ? ' (CLIPPED)' : ''}`);
  }
}
