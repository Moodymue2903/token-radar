// Isolate the walk-forward gap: size-curve-only vs full model vs ridge,
// on the SAME test sets the top tier uses (the 31 newest tokens, and
// older-half/newer-half). Also reports the per-variant flat baseline.
// Run: node wf2.ts from the token-radar dir (node v22.23.5).
import { readFileSync } from 'node:fs';
import {
  parseSnapshot, fitPeersOf, fitModel, impliedValue, looMetrics, median, MODEL,
} from '../lib/model.ts';

const snap = parseSnapshot(readFileSync(
  '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json', 'utf8'));
const peers = fitPeersOf(snap).slice().sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));

const sizeOnly = (p, f) => Math.max(1, Math.pow(10, f.sizeA + f.sizeB * Math.log10(p.tvl_usd)));
const noGm = (p, f) => impliedValue(p, f, snap.as_of, MODEL, false).raw;
// Category-median-only (no size curve): tvl * shrunk category multiple.
const catOnly = (p, f) => {
  const c = f.categories.find((x) => x.category === p.category);
  let mult = f.globalMedian;
  if (c !== undefined && c.n >= MODEL.minPeers) {
    const w = c.n / (c.n + MODEL.shrinkK);
    mult = w * c.median + (1 - w) * f.globalMedian;
  }
  return Math.max(1, p.tvl_usd * mult);
};

function report(label, train, test) {
  const f = fitModel(train, MODEL);
  const cFlat = median(train.map((p) => p.mcap_usd / p.tvl_usd));
  const variants = { 'FULL (ours)': noGm, 'SIZE-ONLY': sizeOnly, 'CAT-ONLY': catOnly };
  console.log(`${label} (train=${train.length} test=${test.length})`);
  for (const [name, pred] of Object.entries(variants)) {
    const m = looMetrics(test.map((p) => pred(p, f)), test.map((p) => p.mcap_usd));
    console.log(`  ${name}: medianMax=${m.medianMax.toFixed(2)} within3=${m.within3.toFixed(1)}% spearman=${m.spearman.toFixed(3)}`);
  }
  const mf = looMetrics(test.map((p) => Math.max(1, cFlat * p.tvl_usd)), test.map((p) => p.mcap_usd));
  console.log(`  FLAT (train median ${cFlat.toFixed(3)}x): medianMax=${mf.medianMax.toFixed(2)} within3=${mf.within3.toFixed(1)}%`);
}

// The 31 newest tokens (europa-nova's "31 since" 2025-01-23; ours is 2025-01-01 — same 31)
report('A: cutoff 2025-01-01', peers.filter((p) => p.listed_at < '2025-01-01'), peers.filter((p) => p.listed_at >= '2025-01-01'));
report('A2: cutoff 2025-01-23', peers.filter((p) => p.listed_at < '2025-01-23'), peers.filter((p) => p.listed_at >= '2025-01-23'));
const half = Math.floor(peers.length / 2);
report('B: older-half / newer-half', peers.slice(0, half), peers.slice(half));
// LOO reference for the variants (all 95)
const fAll = fitModel(peers, MODEL);
for (const [name, pred] of Object.entries({ 'FULL (ours)': noGm, 'SIZE-ONLY': sizeOnly, 'CAT-ONLY': catOnly })) {
  const preds = peers.map((p, i) => {
    const tr = peers.filter((_, j) => j !== i);
    return pred(p, fitModel(tr, MODEL));
  });
  const m = looMetrics(preds, peers.map((p) => p.mcap_usd));
  console.log(`LOO n=95 ${name}: medianMax=${m.medianMax.toFixed(2)} within3=${m.within3.toFixed(1)}% spearman=${m.spearman.toFixed(3)}`);
}
