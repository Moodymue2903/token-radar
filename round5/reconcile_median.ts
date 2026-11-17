// Reconcile Qwen's median-error finding: is "median error x1.82" consistent
// with "50.5% within 3x"? Compute the median LOO log-residual (bias check),
// the median max-ratio (the statistic a reader expects), and the blind /
// time-split median max-ratios. Also check the Huber delta=1.0 scale:
// how many of the 95 peers' log10 residuals exceed delta (i.e. are actually
// downweighted by Huber)?
// Run: node reconcile_median.ts --input <snapshot.json>
import { readFileSync } from 'node:fs';
import {
  MODEL, fitModel, fitPeersOf, impliedValue, looLogResiduals, looMetrics,
  looRun, parseSnapshot,
} from '../lib/model.ts';

const arg = (name: string, fallback: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
};

const inputFile = arg('input', '/input/snapshot.json');
const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const asOf = snapshot.as_of;
const peers = fitPeersOf(snapshot);
const noGm = (p: any, f: any): number => impliedValue(p, f, asOf, MODEL, false).raw;

// 1. LOO residuals (log10 pred/actual), one per peer, genuine nested refit.
const resid = looLogResiduals(peers, snapshot, MODEL);
const sorted = [...resid].sort((a, b) => a - b);
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
};
const medResid = median(resid);
const meanResid = resid.reduce((s, x) => s + x, 0) / resid.length;
const sdResid = Math.sqrt(resid.reduce((s, x) => s + (x - meanResid) ** 2, 0) / resid.length);
const within3 = resid.filter((r) => Math.abs(r) <= Math.log10(3)).length;
const maxRatios = resid.map((r) => Math.pow(10, Math.abs(r)));
const medMaxRatio = median(maxRatios);
const med1p = 1 + median(resid.map((r) => Math.abs(Math.pow(10, r) - 1)));
console.log(`LOO n=${peers.length}: within3=${within3}/${peers.length} (${(100 * within3 / peers.length).toFixed(2)}%)`);
console.log(`median log10 residual (bias) = ${medResid.toFixed(4)} dex  -> median pred/actual = ${Math.pow(10, medResid).toFixed(4)}x`);
console.log(`mean log10 residual = ${meanResid.toFixed(4)} dex, sd = ${sdResid.toFixed(4)} dex`);
console.log(`median max-ratio (medianMax) = ${medMaxRatio.toFixed(4)}x`);
console.log(`median 1+APE (median1p, the reported "median error") = ${med1p.toFixed(4)}x`);
console.log(`residual percentiles: p10=${sorted[Math.floor(0.1 * sorted.length)]!.toFixed(3)} p25=${sorted[Math.floor(0.25 * sorted.length)]!.toFixed(3)} p75=${sorted[Math.floor(0.75 * sorted.length)]!.toFixed(3)} p90=${sorted[Math.floor(0.9 * sorted.length)]!.toFixed(3)}`);

// 2. Huber delta=1.0 scale: residuals are log10, sd ~0.69 dex. How many
// |resid| exceed delta=1.0 (i.e. are actually downweighted)?
const over = resid.filter((r) => Math.abs(r) > 1.0).length;
console.log(`Huber delta=1.0: |log10 resid| > 1.0 for ${over}/${resid.length} peers (${(100 * over / resid.length).toFixed(1)}%) — these are the only ones Huber downweights vs OLS`);

// 3. Full-fit residual sd (the sigma Huber sees) and the fitted slope/intercept.
const fit = fitModel(peers, MODEL);
console.log(`full fit: sizeA=${fit.sizeA.toFixed(4)} sizeB=${fit.sizeB.toFixed(4)} R2=${fit.sizeR2.toFixed(4)} residSd=${fit.residualSd.toFixed(4)} dex winsor=[${fit.winsorLo.toFixed(4)}, ${fit.winsorHi.toFixed(4)}]`);

// 4. Blind and time-split median max-ratios (the statistic that reconciles
// with within-3x), using the same splits validateModel uses.
const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const seeds = [11, 23, 37, 41, 53];
const holdN = Math.round(peers.length * 0.2);
for (const seed of seeds) {
  const rng = mulberry32(seed);
  const idx = peers.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = idx[i]!; idx[i] = idx[j]!; idx[j] = tmp;
  }
  const hold = new Set(idx.slice(0, holdN));
  const train = peers.filter((_, i) => !hold.has(i));
  const test = peers.filter((_, i) => hold.has(i));
  const m = looRun(test, asOf, noGm, MODEL);
  // NOTE: looRun refits on test-only peers here for the metric; the real
  // blind fits on train and predicts test. Recompute properly:
  const fTrain = fitModel(train, MODEL);
  const preds = test.map((p) => noGm(p, fTrain));
  const acts = test.map((p) => p.mcap_usd!);
  const mm = looMetrics(preds, acts);
  console.log(`blind seed ${seed}: n=${test.length} within3=${mm.within3.toFixed(2)}% median1p=${mm.median1p.toFixed(4)} medianMax=${mm.medianMax.toFixed(4)} spearman=${mm.spearman.toFixed(4)}`);
}
const trainTs = peers.filter((p) => p.listed_at !== null && p.listed_at < '2025-01-01');
const testTs = peers.filter((p) => p.listed_at !== null && p.listed_at >= '2025-01-01');
const fTs = fitModel(trainTs, MODEL);
const mTs = looMetrics(testTs.map((p) => noGm(p, fTs)), testTs.map((p) => p.mcap_usd!));
console.log(`time-split: train=${trainTs.length} test=${testTs.length} within3=${mTs.within3.toFixed(2)}% median1p=${mTs.median1p.toFixed(4)} medianMax=${mTs.medianMax.toFixed(4)} spearman=${mTs.spearman.toFixed(4)}`);
