// Walk-forward comparison for Tidegauge (round 6) vs the top tier.
// Reads the sealed snapshot, fits OUR model on older-listed peers and tests
// on newer-listed peers, under several splits, and reports the median
// max-ratio ("miss"), within-3x and Spearman, plus the flat baseline on the
// SAME split. Also reports a ridge-category variant (kiencx's approach:
// log(mcap) = a + b*log(tvl) + ridge-shrunk per-category offsets, fitted
// jointly) to test whether that is what closes the walk-forward gap.
// Run: node wf.mjs  (node v22.23.5, type stripping) from the token-radar dir.
import { readFileSync } from 'node:fs';
import {
  parseSnapshot, fitPeersOf, fitModel, impliedValue, looMetrics, median, MODEL,
} from '../lib/model.ts';

const snap = parseSnapshot(readFileSync(
  '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json', 'utf8'));
const peers = fitPeersOf(snap).slice().sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
console.log(`fit peers n=${peers.length}, listed range ${peers[0].listed_at} .. ${peers[peers.length - 1].listed_at}`);

const noGm = (p, f) => impliedValue(p, f, snap.as_of, MODEL, false).raw;

function report(label, train, test) {
  const f = fitModel(train, MODEL);
  const m = looMetrics(test.map((p) => noGm(p, f)), test.map((p) => p.mcap_usd));
  const cFlat = median(train.map((p) => p.mcap_usd / p.tvl_usd));
  const mf = looMetrics(test.map((p) => Math.max(1, cFlat * p.tvl_usd)), test.map((p) => p.mcap_usd));
  console.log(`${label} (train=${train.length} test=${test.length}):`);
  console.log(`  OURS  medianMax=${m.medianMax.toFixed(2)} median1p=${m.median1p.toFixed(2)} within3=${m.within3.toFixed(1)}% spearman=${m.spearman.toFixed(3)}`);
  console.log(`  FLAT  medianMax=${mf.medianMax.toFixed(2)} median1p=${mf.median1p.toFixed(2)} within3=${mf.within3.toFixed(1)}% spearman=${mf.spearman.toFixed(3)}  ratio-to-flat=${(m.medianMax / mf.medianMax).toFixed(3)}`);
  return { m, mf };
}

// Split A: 2025-01-01 cutoff (the model's own timeSplit; n=31 test)
const trainA = peers.filter((p) => p.listed_at < '2025-01-01');
const testA = peers.filter((p) => p.listed_at >= '2025-01-01');
report('A: cutoff 2025-01-01', trainA, testA);

// Split B: older half fits, newer half tests (nyx77-style 35/35, kiencx-style)
const half = Math.floor(peers.length / 2);
report('B: older-half / newer-half', peers.slice(0, half), peers.slice(half));

// Split C: oldest 35 fit, newest 35 test (nyx77's exact shape)
report('C: oldest-35 / newest-35', peers.slice(0, 35), peers.slice(peers.length - 35));

// Split D: pre-2024-07-15 fit, post test (nyx77's date cutoff)
const trainD = peers.filter((p) => p.listed_at < '2024-07-15');
const testD = peers.filter((p) => p.listed_at >= '2024-07-15');
report('D: cutoff 2024-07-15', trainD, testD);

// --- Ridge-category variant (kiencx's value-model structure) ---
// log10(mcap) = a + b*log10(tvl) + sum_cat offset_cat * 1[cat], ridge penalty
// lambda on the category offsets only (intercept and slope unpenalised).
// Solved by normal equations with a small Gaussian-elimination routine.
// Categories with <3 peers get offset 0 (fall back to the global fit).
function ridgeFit(train, lambda) {
  const cats = [...new Set(train.map((p) => p.category))].filter((c) => {
    return train.filter((p) => p.category === c).length >= 3;
  });
  const k = cats.length;
  const idx = new Map(cats.map((c, i) => [c, i]));
  // Design: [1, log10(tvl), one-hot cats...]; y = log10(mcap)
  const X = train.map((p) => {
    const row = new Array(2 + k).fill(0);
    row[0] = 1; row[1] = Math.log10(p.tvl_usd);
    const ci = idx.get(p.category);
    if (ci !== undefined) row[2 + ci] = 1;
    return row;
  });
  const y = train.map((p) => Math.log10(p.mcap_usd));
  const d = 2 + k;
  // A = X'X + lambda * diag(0,0,1,1,...); bvec = X'y
  const A = Array.from({ length: d }, () => new Array(d).fill(0));
  const bvec = new Array(d).fill(0);
  for (let i = 0; i < train.length; i++) {
    for (let r = 0; r < d; r++) {
      bvec[r] += X[i][r] * y[i];
      for (let c = 0; c < d; c++) A[r][c] += X[i][r] * X[i][c];
    }
  }
  for (let j = 2; j < d; j++) A[j][j] += lambda;
  // Gaussian elimination with partial pivoting
  const M = A.map((row, i) => [...row, bvec[i]]);
  for (let col = 0; col < d; col++) {
    let piv = col;
    for (let r = col + 1; r < d; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const pv = M[col][col];
    if (Math.abs(pv) < 1e-12) continue;
    for (let r = 0; r < d; r++) {
      if (r === col) continue;
      const fac = M[r][col] / pv;
      for (let c = col; c <= d; c++) M[r][c] -= fac * M[col][c];
    }
  }
  const beta = M.map((row, i) => row[d] / (Math.abs(M[i][i]) < 1e-12 ? 1 : M[i][i]));
  return { beta, idx, a: beta[0], b: beta[1] };
}
function ridgePredict(p, rf) {
  const ci = rf.idx.get(p.category);
  const off = ci === undefined ? 0 : rf.beta[2 + ci];
  return Math.pow(10, rf.a + rf.b * Math.log10(p.tvl_usd) + off);
}
for (const lambda of [1, 4, 16, 64]) {
  for (const [label, train, test] of [
    ['A: cutoff 2025-01-01', trainA, testA],
    ['B: older-half / newer-half', peers.slice(0, half), peers.slice(half)],
  ]) {
    const rf = ridgeFit(train, lambda);
    const m = looMetrics(test.map((p) => ridgePredict(p, rf)), test.map((p) => p.mcap_usd));
    console.log(`RIDGE lambda=${lambda} ${label}: medianMax=${m.medianMax.toFixed(2)} median1p=${m.median1p.toFixed(2)} within3=${m.within3.toFixed(1)}% spearman=${m.spearman.toFixed(3)} (slope=${rf.b.toFixed(3)})`);
  }
}
// Ridge LOO (for reference): leave-one-out over all 95 with ridge lambda=16
for (const lambda of [4, 16, 64]) {
  const preds = peers.map((p, i) => {
    const train = peers.filter((_, j) => j !== i);
    return ridgePredict(p, ridgeFit(train, lambda));
  });
  const m = looMetrics(preds, peers.map((p) => p.mcap_usd));
  console.log(`RIDGE lambda=${lambda} LOO n=95: medianMax=${m.medianMax.toFixed(2)} median1p=${m.median1p.toFixed(2)} within3=${m.within3.toFixed(1)}% spearman=${m.spearman.toFixed(3)}`);
}
