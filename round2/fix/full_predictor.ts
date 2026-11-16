// Round-2 fix, item 9 — validate the FULL predictor (growth + maturity included).
// The production validation (LOO / blind / time-split) uses the no-gm predictor
// (impliedValue withGm=false), but the production board uses withGm=true. This script
// runs LOO, blind x5 and the time-split with BOTH predictors on the same frozen splits
// and reports whether the full predictor's numbers differ materially from the no-gm ones.
// Run: node round2/fix/full_predictor.ts (Kit Node 22), from the repo root.

import { readFileSync } from 'node:fs';
import {
  MODEL,
  fitModel,
  impliedValue,
  looMetrics,
  looRun,
  median,
  mulberry32,
  parseSnapshot,
  peersOf,
  type SnapshotProtocol,
} from '../../lib/model.ts';

const SNAPSHOT = '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json';
const SEEDS = [11, 23, 37, 41, 53];
const TIME_CUT = '2025-01-01';

const snapshot = parseSnapshot(readFileSync(SNAPSHOT, 'utf8'));
const peers = peersOf(snapshot);
const asOf = snapshot.as_of;

const noGm = (p: SnapshotProtocol, f: ReturnType<typeof fitModel>): number =>
  impliedValue(p, f, asOf, MODEL, false).raw;
const fullGm = (p: SnapshotProtocol, f: ReturnType<typeof fitModel>): number =>
  impliedValue(p, f, asOf, MODEL, true).raw;

const fmt = (x: number, d = 4): string => (Number.isFinite(x) ? x.toFixed(d) : 'NaN');

// ---- LOO (128 folds, full refit each fold) ----
const looNoGm = looRun(peers, asOf, noGm, MODEL);
const looFull = looRun(peers, asOf, fullGm, MODEL);
console.log('LOO (128 folds):');
console.log(`  no-gm : median x${fmt(looNoGm.median1p)} | medMax x${fmt(looNoGm.medianMax)} | within2 ${fmt(looNoGm.within2, 1)}% | within3 ${fmt(looNoGm.within3, 1)}% | Spearman ${fmt(looNoGm.spearman, 3)} | logRMSE ${fmt(looNoGm.logRmse)}`);
console.log(`  full  : median x${fmt(looFull.median1p)} | medMax x${fmt(looFull.medianMax)} | within2 ${fmt(looFull.within2, 1)}% | within3 ${fmt(looFull.within3, 1)}% | Spearman ${fmt(looFull.spearman, 3)} | logRMSE ${fmt(looFull.logRmse)}`);

// ---- blind 80/20 x5 (frozen splits, identical to validateModel) ----
function blindSplits(): { train: SnapshotProtocol[]; test: SnapshotProtocol[] }[] {
  const holdN = Math.round(peers.length * 0.2);
  return SEEDS.map((seed) => {
    const rng = mulberry32(seed);
    const idx = peers.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = idx[i]!;
      idx[i] = idx[j]!;
      idx[j] = tmp;
    }
    const hold = new Set(idx.slice(0, holdN));
    return {
      train: peers.filter((_, i) => !hold.has(i)),
      test: peers.filter((_, i) => hold.has(i)),
    };
  });
}
const splits = blindSplits();
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
function blindAgg(predict: (p: SnapshotProtocol, f: ReturnType<typeof fitModel>) => number) {
  const per = splits.map(({ train, test }) => {
    const f = fitModel(train, MODEL);
    return looMetrics(test.map((p) => predict(p, f)), test.map((p) => p.mcap_usd!));
  });
  return {
    median: mean(per.map((m) => m.median1p)),
    within2: mean(per.map((m) => m.within2)),
    within3: mean(per.map((m) => m.within3)),
    spearman: mean(per.map((m) => m.spearman)),
    medianMax: mean(per.map((m) => m.medianMax)),
  };
}
const bNoGm = blindAgg(noGm);
const bFull = blindAgg(fullGm);
console.log('BLIND x5 (mean of 5 seeds):');
console.log(`  no-gm : median x${fmt(bNoGm.median)} | medMax x${fmt(bNoGm.medianMax)} | within2 ${fmt(bNoGm.within2, 1)}% | within3 ${fmt(bNoGm.within3, 1)}% | Spearman ${fmt(bNoGm.spearman, 3)}`);
console.log(`  full  : median x${fmt(bFull.median)} | medMax x${fmt(bFull.medianMax)} | within2 ${fmt(bFull.within2, 1)}% | within3 ${fmt(bFull.within3, 1)}% | Spearman ${fmt(bFull.spearman, 3)}`);

// ---- time-split (train listed < 2025-01-01, test >=) ----
const trainTs = peers.filter((p) => p.listed_at !== null && p.listed_at < TIME_CUT);
const testTs = peers.filter((p) => p.listed_at !== null && p.listed_at >= TIME_CUT);
function timeSplit(predict: (p: SnapshotProtocol, f: ReturnType<typeof fitModel>) => number) {
  const f = fitModel(trainTs, MODEL);
  return looMetrics(testTs.map((p) => predict(p, f)), testTs.map((p) => p.mcap_usd!));
}
const tNoGm = timeSplit(noGm);
const tFull = timeSplit(fullGm);
console.log(`TIME-SPLIT (n=${testTs.length}):`);
console.log(`  no-gm : median x${fmt(tNoGm.median1p)} | medMax x${fmt(tNoGm.medianMax)} | within2 ${fmt(tNoGm.within2, 1)}% | within3 ${fmt(tNoGm.within3, 1)}% | Spearman ${fmt(tNoGm.spearman, 3)}`);
console.log(`  full  : median x${fmt(tFull.median1p)} | medMax x${fmt(tFull.medianMax)} | within2 ${fmt(tFull.within2, 1)}% | within3 ${fmt(tFull.within3, 1)}% | Spearman ${fmt(tFull.spearman, 3)}`);

// ---- verdict: is the difference material? ----
const dLoo = looFull.median1p - looNoGm.median1p;
const dBlind = bFull.median - bNoGm.median;
const dTs = tFull.median1p - tNoGm.median1p;
console.log('DIFFERENCES (full - no-gm) on median error:');
console.log(`  LOO x${fmt(dLoo)} | blind x${fmt(dBlind)} | time-split x${fmt(dTs)}`);
console.log(`  (a change under ~0.02 on median error is inside the seed noise; the blind per-seed SD is ~0.03)`);
console.log(`  median of |growth mult - 1| across peers: ${fmt(median(peers.map((p) => Math.abs(impliedValue(p, fitModel(peers, MODEL), asOf, MODEL, true).growthMult - 1))))}`);
console.log(`  median maturity mult across peers: ${fmt(median(peers.map((p) => impliedValue(p, fitModel(peers, MODEL), asOf, MODEL, true).maturityMult)))}`);
