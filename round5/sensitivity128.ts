// 128-peer sensitivity: LOO on the FULL traded-peer universe (peersOf, n=128),
// using the same predictors validateModel uses on the 95 fit peers.
// Answers the auditors' question: does including the 33 dateless peers
// change the within-3x number? The noGm predictor does not consume listed_at
// (no growth/maturity), so the 33 can be included in this LOO.
// Run: node sensitivity128.ts --input <snapshot.json>
import { readFileSync } from 'node:fs';
import { MODEL, fitPeersOf, impliedValue, looRun, parseSnapshot, peersOf } from '../lib/model.ts';

const arg = (name: string, fallback: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
};

const inputFile = arg('input', '/input/snapshot.json');
const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const asOf = snapshot.as_of;
const peers95 = fitPeersOf(snapshot);
const peers128 = peersOf(snapshot);
console.log(`peers95=${peers95.length} peers128=${peers128.length} dateless=${peers128.length - peers95.length}`);

const noGm = (p: any, f: any): number => impliedValue(p, f, asOf, MODEL, false).raw;
const flat = (p: any): number => Math.max(1, p.tvl_usd * 0.25);
const global = (p: any, f: any): number => Math.max(1, p.tvl_usd * f.globalMedian);
const sizeOnly = (p: any, f: any): number => Math.max(1, Math.pow(10, f.sizeA + f.sizeB * Math.log10(p.tvl_usd)));
const damped = (p: any, f: any): number => impliedValue(p, f, asOf, MODEL, false, 0.5).raw;

for (const [label, peers] of [['n=95', peers95], ['n=128', peers128]] as const) {
  const mAdopted = looRun(peers, asOf, noGm, MODEL);
  const mFlat = looRun(peers, asOf, flat, MODEL);
  const mGlobal = looRun(peers, asOf, global, MODEL);
  const mSize = looRun(peers, asOf, sizeOnly, MODEL);
  const mDamped = looRun(peers, asOf, damped, MODEL);
  console.log(`--- ${label} (n=${peers.length}) ---`);
  console.log(`adopted (full, shrunk s=1.0): within3=${mAdopted.within3.toFixed(4)}% spearman=${mAdopted.spearman.toFixed(4)} medianMax=${mAdopted.medianMax.toFixed(4)} within2=${mAdopted.within2.toFixed(4)}%`);
  console.log(`size curve only:              within3=${mSize.within3.toFixed(4)}% spearman=${mSize.spearman.toFixed(4)} medianMax=${mSize.medianMax.toFixed(4)} within2=${mSize.within2.toFixed(4)}%`);
  console.log(`damped s=0.5:                 within3=${mDamped.within3.toFixed(4)}% spearman=${mDamped.spearman.toFixed(4)} medianMax=${mDamped.medianMax.toFixed(4)} within2=${mDamped.within2.toFixed(4)}%`);
  console.log(`flat 0.25x:                   within3=${mFlat.within3.toFixed(4)}% spearman=${mFlat.spearman.toFixed(4)} medianMax=${mFlat.medianMax.toFixed(4)} within2=${mFlat.within2.toFixed(4)}%`);
  console.log(`global median:                within3=${mGlobal.within3.toFixed(4)}% spearman=${mGlobal.spearman.toFixed(4)} medianMax=${mGlobal.medianMax.toFixed(4)} within2=${mGlobal.within2.toFixed(4)}%`);
}
