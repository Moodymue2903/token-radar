// Round 7: Huber-weighted ridge vs OLS ridge — the two-test check.
// Tests whether Huber-weighting the ridge fit (log mcap on log TVL +
// ridge-shrunk category offsets) wins BOTH leave-one-out and walk-forward,
// or whether plain OLS ridge wins. Kiencx's two-test rule: a term (here a
// weighting scheme) is kept only if it lowers the held-out miss in both
// tests. Run: node ridge-test.mjs (node v22.23.5, type stripping) from the
// token-radar dir.
import { readFileSync } from 'node:fs';
import {
  parseSnapshot, fitPeersOf, looMetrics, median,
} from '../lib/model.ts';

const snap = parseSnapshot(readFileSync(
  '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json', 'utf8'));
const peers = fitPeersOf(snap).slice().sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
console.log(`fit peers n=${peers.length}, listed range ${peers[0].listed_at} .. ${peers[peers.length - 1].listed_at}`);

// Ridge fit: log10(mcap) = a + b*log10(tvl) + per-category offsets.
// Ridge penalty lambda on the category offsets only (intercept and slope
// unpenalised). Categories with <3 peers get offset 0. Solved by normal
// equations with Gaussian elimination and partial pivoting.
// huber=true: IRLS weights min(1, delta/|r|), delta=1.0 in log10 units,
// refitting the weighted ridge 20 times from the OLS start.
function ridgeFit(train, lambda, huber) {
  const cats = [...new Set(train.map((p) => p.category))].filter((c) => {
    return train.filter((p) => p.category === c).length >= 3;
  });
  const k = cats.length;
  const idx = new Map(cats.map((c, i) => [c, i]));
  const X = train.map((p) => {
    const row = new Array(2 + k).fill(0);
    row[0] = 1; row[1] = Math.log10(p.tvl_usd);
    const ci = idx.get(p.category);
    if (ci !== undefined) row[2 + ci] = 1;
    return row;
  });
  const y = train.map((p) => Math.log10(p.mcap_usd));
  const d = 2 + k;
  function solve(weights) {
    const A = Array.from({ length: d }, () => new Array(d).fill(0));
    const bvec = new Array(d).fill(0);
    for (let i = 0; i < train.length; i++) {
      const w = weights[i];
      for (let r = 0; r < d; r++) {
        bvec[r] += w * X[i][r] * y[i];
        for (let c = 0; c < d; c++) A[r][c] += w * X[i][r] * X[i][c];
      }
    }
    for (let j = 2; j < d; j++) A[j][j] += lambda;
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
    return M.map((row, i) => row[d] / (Math.abs(M[i][i]) < 1e-12 ? 1 : M[i][i]));
  }
  let beta = solve(new Array(train.length).fill(1));
  if (huber) {
    for (let it = 0; it < 20; it++) {
      const ws = train.map((p, i) => {
        let pred = beta[0] + beta[1] * Math.log10(p.tvl_usd);
        const ci = idx.get(p.category);
        if (ci !== undefined) pred += beta[2 + ci];
        const r = Math.abs(y[i] - pred);
        return r <= 1.0 ? 1 : 1.0 / r;
      });
      const next = solve(ws);
      const delta = Math.max(...next.map((v, i) => Math.abs(v - beta[i])));
      beta = next;
      if (delta < 1e-12) break;
    }
  }
  return { beta, idx, a: beta[0], b: beta[1], lambda, huber };
}
function ridgePredict(p, rf) {
  const ci = rf.idx.get(p.category);
  const off = ci === undefined ? 0 : rf.beta[2 + ci];
  return Math.pow(10, rf.a + rf.b * Math.log10(p.tvl_usd) + off);
}

const half = Math.floor(peers.length / 2);
const splits = [
  ['LOO n=95', null, null],
  ['WF cutoff 2025-01-01', peers.filter((p) => p.listed_at < '2025-01-01'), peers.filter((p) => p.listed_at >= '2025-01-01')],
  ['WF half/half', peers.slice(0, half), peers.slice(half)],
];
for (const lambda of [1, 4, 16, 64]) {
  for (const huber of [false, true]) {
    console.log(`--- ridge lambda=${lambda} huber=${huber} ---`);
    for (const [label, train, test] of splits) {
      if (label.startsWith('LOO')) {
        const preds = peers.map((p, i) => {
          const tr = peers.filter((_, j) => j !== i);
          return ridgePredict(p, ridgeFit(tr, lambda, huber));
        });
        const m = looMetrics(preds, peers.map((p) => p.mcap_usd));
        console.log(`  ${label}: medianMax=${m.medianMax.toFixed(2)} within3=${m.within3.toFixed(1)}% spearman=${m.spearman.toFixed(3)}`);
      } else {
        const rf = ridgeFit(train, lambda, huber);
        const m = looMetrics(test.map((p) => ridgePredict(p, rf)), test.map((p) => p.mcap_usd));
        console.log(`  ${label} (train=${train.length} test=${test.length}): medianMax=${m.medianMax.toFixed(2)} within3=${m.within3.toFixed(1)}% spearman=${m.spearman.toFixed(3)} slope=${rf.b.toFixed(3)}`);
      }
    }
  }
}
