// Path to #1 — Q1 (size-only variants) + Q4 (OLS vs Huber, full picture).
// Tests why europa-nova's size-only gets WF x2.45 while ours gets x2.65
// (round-7 ridge size component) / x2.94 (round-6 size curve), and whether
// OLS or Huber is better overall for the ridge.
// Run: node benchmark/path1a.ts from the token-radar dir (node v22.23.5).
import { readFileSync } from 'node:fs';
import {
  parseSnapshot, fitPeersOf, peersOf, looMetrics, median, mulberry32,
  huberLin, MODEL,
} from '../lib/model.ts';

const snap = parseSnapshot(readFileSync(
  '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json', 'utf8'));
const peers = fitPeersOf(snap).slice().sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
const all128 = peersOf(snap);
const dateless = all128.filter((p) => p.listed_at === null);
console.log(`fit peers n=${peers.length} (dated), all traded n=${all128.length}, dateless n=${dateless.length}`);
console.log(`listed range ${peers[0].listed_at} .. ${peers[peers.length - 1].listed_at}`);

// --- size-curve fitters -------------------------------------------------
// Each returns { a, b, predict(p) } for log10(mcap) = a + b * g(tvl).
function olsFit(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  const b = sxx > 0 ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}
function sizeFit(train, opts) {
  // opts: { shift (default 0), method: 'ols' | 'huber', winsor: null | [lo,hi] quantile, trim: null | dex }
  const shift = opts.shift ?? 0;
  let xs = train.map((p) => Math.log10(p.tvl_usd + shift));
  let ys = train.map((p) => Math.log10(p.mcap_usd));
  if (opts.winsor) {
    const srt = [...ys].sort((a, b) => a - b);
    const lo = srt[Math.floor(opts.winsor[0] * (srt.length - 1))];
    const hi = srt[Math.floor(opts.winsor[1] * (srt.length - 1))];
    ys = ys.map((y) => Math.min(hi, Math.max(lo, y)));
  }
  let fit = opts.method === 'huber' ? huberLin(xs, ys, 1.0) : olsFit(xs, ys);
  if (opts.trim) {
    // Drop peers with |log residual| > trim dex, refit once (same method).
    const keep = train.map((p, i) => {
      const pred = fit.a + fit.b * xs[i];
      return Math.abs(ys[i] - pred) <= opts.trim;
    });
    const xs2 = xs.filter((_, i) => keep[i]);
    const ys2 = ys.filter((_, i) => keep[i]);
    fit = opts.method === 'huber' ? huberLin(xs2, ys2, 1.0) : olsFit(xs2, ys2);
    return { a: fit.a, b: fit.b, shift, n: xs2.length, dropped: train.length - xs2.length };
  }
  return { a: fit.a, b: fit.b, shift, n: xs.length, dropped: 0 };
}
function sizePredict(p, f) {
  return Math.pow(10, f.a + f.b * Math.log10(p.tvl_usd + f.shift));
}

// --- splits ---------------------------------------------------------------
const half = Math.floor(peers.length / 2);
const splits = [
  ['WF cutoff 2025-01-01', peers.filter((p) => p.listed_at < '2025-01-01'), peers.filter((p) => p.listed_at >= '2025-01-01')],
  ['WF cutoff 2025-01-23', peers.filter((p) => p.listed_at < '2025-01-23'), peers.filter((p) => p.listed_at >= '2025-01-23')],
  ['WF half/half', peers.slice(0, half), peers.slice(half)],
];
// WF with dateless peers added to TRAIN (europa-nova may train on all traded tokens).
const trainA128 = [...dateless, ...peers.filter((p) => p.listed_at < '2025-01-01')];
const testA = peers.filter((p) => p.listed_at >= '2025-01-01');

function evalSplit(label, train, test, fitFn) {
  const f = fitFn(train);
  const m = looMetrics(test.map((p) => sizePredict(p, f)), test.map((p) => p.mcap_usd));
  const cFlat = median(train.map((p) => p.mcap_usd / p.tvl_usd));
  const mf = looMetrics(test.map((p) => Math.max(1, cFlat * p.tvl_usd)), test.map((p) => p.mcap_usd));
  console.log(`  ${label} (train=${train.length} test=${test.length}): medianMax=${m.medianMax.toFixed(2)} within3=${m.within3.toFixed(1)}% spearman=${m.spearman.toFixed(3)} slope=${f.b.toFixed(3)} intercept=${f.a.toFixed(3)} [flat ${mf.medianMax.toFixed(2)}]`);
  return m;
}
function evalLoo(label, fitFn) {
  const preds = peers.map((p, i) => {
    const tr = peers.filter((_, j) => j !== i);
    return sizePredict(p, fitFn(tr));
  });
  const m = looMetrics(preds, peers.map((p) => p.mcap_usd));
  console.log(`  ${label}: medianMax=${m.medianMax.toFixed(2)} within3=${m.within3.toFixed(1)}% spearman=${m.spearman.toFixed(3)}`);
  return m;
}
function evalBlind(label, fitFn) {
  // Blind 80/20 x5, same seeds as validateModel (11, 23, 37, 41, 53).
  const seeds = [11, 23, 37, 41, 53];
  const holdN = Math.round(peers.length * 0.2);
  const meds = []; const w3 = []; const sp = [];
  for (const seed of seeds) {
    const rng = mulberry32(seed);
    const idx = peers.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }
    const hold = new Set(idx.slice(0, holdN));
    const train = peers.filter((_, i) => !hold.has(i));
    const test = peers.filter((_, i) => hold.has(i));
    const f = fitFn(train);
    const m = looMetrics(test.map((p) => sizePredict(p, f)), test.map((p) => p.mcap_usd));
    meds.push(m.medianMax); w3.push(m.within3); sp.push(m.spearman);
  }
  const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  console.log(`  ${label}: medianMax=${avg(meds).toFixed(2)} within3=${avg(w3).toFixed(1)}% spearman=${avg(sp).toFixed(3)}`);
}

const variants = [
  ['OLS plain', (tr) => sizeFit(tr, { method: 'ols' })],
  ['Huber plain', (tr) => sizeFit(tr, { method: 'huber' })],
  ['OLS +$100M shift', (tr) => sizeFit(tr, { method: 'ols', shift: 1e8 })],
  ['Huber +$100M shift', (tr) => sizeFit(tr, { method: 'huber', shift: 1e8 })],
  ['OLS +$10M shift', (tr) => sizeFit(tr, { method: 'ols', shift: 1e7 })],
  ['OLS +$1B shift', (tr) => sizeFit(tr, { method: 'ols', shift: 1e9 })],
  ['OLS winsor 5/95', (tr) => sizeFit(tr, { method: 'ols', winsor: [0.05, 0.95] })],
  ['Huber winsor 5/95', (tr) => sizeFit(tr, { method: 'huber', winsor: [0.05, 0.95] })],
  ['OLS trim 1.0 dex', (tr) => sizeFit(tr, { method: 'ols', trim: 1.0 })],
  ['Huber trim 1.0 dex', (tr) => sizeFit(tr, { method: 'huber', trim: 1.0 })],
];

console.log('\n=== Q1: size-only variants (europa-nova gets WF x2.45; ours was x2.94 round-6, x2.65 round-7 ridge-size) ===');
for (const [name, fn] of variants) {
  console.log(`-- ${name} --`);
  evalLoo('LOO n=95', fn);
  evalSplit('WF cutoff 2025-01-01', splits[0][1], splits[0][2], fn);
  evalSplit('WF half/half', splits[2][1], splits[2][2], fn);
}
console.log('\n-- size-only with dateless peers in TRAIN (train=97 incl. 33 dateless, test=31 newest) --');
for (const [name, fn] of [['OLS plain', variants[0][1]], ['Huber plain', variants[1][1]], ['OLS +$100M shift', variants[2][1]], ['Huber +$100M shift', variants[3][1]]]) {
  console.log(`-- ${name} --`);
  evalSplit('WF cutoff 2025-01-01 +dateless-train', trainA128, testA, fn);
}

// --- Q4: OLS vs Huber ridge, full picture incl. blind, lambda sweep --------
console.log('\n=== Q4: OLS vs Huber ridge, lambda sweep, incl. blind ===');
// Re-implement ridge fit here (same as ridge-test.ts) to add blind.
function ridgeFit(train, lambda, huber) {
  const cats = [...new Set(train.map((p) => p.category))].filter((c) => train.filter((p) => p.category === c).length >= 3);
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
  return { beta, idx, a: beta[0], b: beta[1] };
}
function ridgePredict(p, rf) {
  const ci = rf.idx.get(p.category);
  const off = ci === undefined ? 0 : rf.beta[2 + ci];
  return Math.pow(10, rf.a + rf.b * Math.log10(p.tvl_usd) + off);
}
function ridgeBlind(lambda, huber) {
  const seeds = [11, 23, 37, 41, 53];
  const holdN = Math.round(peers.length * 0.2);
  const meds = []; const w3 = []; const sp = [];
  for (const seed of seeds) {
    const rng = mulberry32(seed);
    const idx = peers.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }
    const hold = new Set(idx.slice(0, holdN));
    const train = peers.filter((_, i) => !hold.has(i));
    const test = peers.filter((_, i) => hold.has(i));
    const rf = ridgeFit(train, lambda, huber);
    const m = looMetrics(test.map((p) => ridgePredict(p, rf)), test.map((p) => p.mcap_usd));
    meds.push(m.medianMax); w3.push(m.within3); sp.push(m.spearman);
  }
  const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return { medianMax: avg(meds), within3: avg(w3), spearman: avg(sp) };
}
for (const lambda of [1, 4, 16, 64]) {
  for (const huber of [false, true]) {
    const looPreds = peers.map((p, i) => ridgePredict(p, ridgeFit(peers.filter((_, j) => j !== i), lambda, huber)));
    const loo = looMetrics(looPreds, peers.map((p) => p.mcap_usd));
    const wfA = looMetrics(splits[0][2].map((p) => ridgePredict(p, ridgeFit(splits[0][1], lambda, huber))), splits[0][2].map((p) => p.mcap_usd));
    const wfB = looMetrics(splits[2][2].map((p) => ridgePredict(p, ridgeFit(splits[2][1], lambda, huber))), splits[2][2].map((p) => p.mcap_usd));
    const bl = ridgeBlind(lambda, huber);
    console.log(`ridge lambda=${lambda} huber=${huber}: LOO ${loo.medianMax.toFixed(2)}/${loo.within3.toFixed(1)}%/rho${loo.spearman.toFixed(3)} | blind ${bl.medianMax.toFixed(2)}/${bl.within3.toFixed(1)}%/rho${bl.spearman.toFixed(3)} | WF-cut ${wfA.medianMax.toFixed(2)}/${wfA.within3.toFixed(1)}%/rho${wfA.spearman.toFixed(3)} | WF-half ${wfB.medianMax.toFixed(2)}/${wfB.within3.toFixed(1)}%/rho${wfB.spearman.toFixed(3)}`);
  }
}
