// Path to #1 — Q1b (ridge+shift, ridge+winsor), Q4b (blind on validateModel's
// exact splits), Q2 (maturity drop: withGm vs noGm validation + board impact).
// Run: node benchmark/path1b.ts from the token-radar dir (node v22.23.5).
import { readFileSync } from 'node:fs';
import {
  parseSnapshot, fitPeersOf, peersOf, fitModel, impliedValue, looMetrics,
  median, mulberry32, MODEL, buildBoard, fitOdds,
} from '../lib/model.ts';

const snap = parseSnapshot(readFileSync(
  '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json', 'utf8'));
// Snapshot order (validateModel's order) AND date-sorted order.
const peersSnap = fitPeersOf(snap);
const peers = peersSnap.slice().sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
const dateless = peersOf(snap).filter((p) => p.listed_at === null);
console.log(`fit peers n=${peers.length}, dateless n=${dateless.length}`);

const half = Math.floor(peers.length / 2);
const splits = [
  ['WF cutoff 2025-01-01', peers.filter((p) => p.listed_at < '2025-01-01'), peers.filter((p) => p.listed_at >= '2025-01-01')],
  ['WF half/half', peers.slice(0, half), peers.slice(half)],
];

// --- ridge fit with a TVL shift (log10(TVL + shift) as regressor) ----------
function ridgeFitShift(train, lambda, huber, shift) {
  const cats = [...new Set(train.map((p) => p.category))].filter((c) => train.filter((p) => p.category === c).length >= 3);
  const k = cats.length;
  const idx = new Map(cats.map((c, i) => [c, i]));
  const X = train.map((p) => {
    const row = new Array(2 + k).fill(0);
    row[0] = 1; row[1] = Math.log10(p.tvl_usd + shift);
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
        let pred = beta[0] + beta[1] * Math.log10(p.tvl_usd + shift);
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
  return { beta, idx, a: beta[0], b: beta[1], shift };
}
function ridgePredictShift(p, rf) {
  const ci = rf.idx.get(p.category);
  const off = ci === undefined ? 0 : rf.beta[2 + ci];
  return Math.pow(10, rf.a + rf.b * Math.log10(p.tvl_usd + rf.shift) + off);
}
// Ridge with winsorized log-mcap (clip y at 5/95 pct of the TRAIN set).
function ridgeFitWinsor(train, lambda, huber) {
  const ys0 = train.map((p) => Math.log10(p.mcap_usd)).sort((a, b) => a - b);
  const lo = ys0[Math.floor(0.05 * (ys0.length - 1))];
  const hi = ys0[Math.floor(0.95 * (ys0.length - 1))];
  const trainW = train.map((p) => ({ ...p, mcap_usd: Math.pow(10, Math.min(hi, Math.max(lo, Math.log10(p.mcap_usd)))) }));
  return ridgeFitShift(trainW, lambda, huber, 0);
}

console.log('\n=== Q1b: ridge + $100M shift, ridge + winsor (WF = the headline) ===');
for (const [label, fitFn, predFn] of [
  ['ridge Huber l=4 shift=0 (round 7)', (tr) => ridgeFitShift(tr, 4, true, 0), ridgePredictShift],
  ['ridge Huber l=4 shift=$100M', (tr) => ridgeFitShift(tr, 4, true, 1e8), ridgePredictShift],
  ['ridge OLS l=4 shift=$100M', (tr) => ridgeFitShift(tr, 4, false, 1e8), ridgePredictShift],
  ['ridge Huber l=4 shift=$100M + dateless-train', null, ridgePredictShift],
  ['ridge Huber l=4 winsor-y 5/95', (tr) => ridgeFitWinsor(tr, 4, true), ridgePredictShift],
  ['ridge OLS l=4 winsor-y 5/95', (tr) => ridgeFitWinsor(tr, 4, false), ridgePredictShift],
  ['ridge Huber l=4 shift=$100M + winsor-y', (tr) => { const f = ridgeFitShift(tr, 4, true, 1e8); return f; }, ridgePredictShift],
]) {
  if (label.includes('dateless-train')) {
    const trainA128 = [...dateless, ...splits[0][1]];
    const rf = ridgeFitShift(trainA128, 4, true, 1e8);
    const m = looMetrics(splits[0][2].map((p) => ridgePredictShift(p, rf)), splits[0][2].map((p) => p.mcap_usd));
    console.log(`  ${label}: WF-cut medianMax=${m.medianMax.toFixed(2)} within3=${m.within3.toFixed(1)}% spearman=${m.spearman.toFixed(3)}`);
    continue;
  }
  const looPreds = peers.map((p, i) => predFn(p, fitFn(peers.filter((_, j) => j !== i))));
  const loo = looMetrics(looPreds, peers.map((p) => p.mcap_usd));
  const wfA = looMetrics(splits[0][2].map((p) => predFn(p, fitFn(splits[0][1]))), splits[0][2].map((p) => p.mcap_usd));
  const wfB = looMetrics(splits[1][2].map((p) => predFn(p, fitFn(splits[1][1]))), splits[1][2].map((p) => p.mcap_usd));
  console.log(`  ${label}: LOO ${loo.medianMax.toFixed(2)}/${loo.within3.toFixed(1)}%/rho${loo.spearman.toFixed(3)} | WF-cut ${wfA.medianMax.toFixed(2)}/${wfA.within3.toFixed(1)}%/rho${wfA.spearman.toFixed(3)} | WF-half ${wfB.medianMax.toFixed(2)}/${wfB.within3.toFixed(1)}%/rho${wfB.spearman.toFixed(3)}`);
}

// --- Q4b: blind on validateModel's EXACT splits (snapshot order, no sort) ---
console.log('\n=== Q4b: blind 80/20 x5 on validateModel exact splits (snapshot order) ===');
function blindExact(fitFn, predFn) {
  const seeds = [11, 23, 37, 41, 53];
  const holdN = Math.round(peersSnap.length * 0.2);
  const meds = []; const w3 = []; const sp = [];
  for (const seed of seeds) {
    const rng = mulberry32(seed);
    const idx = peersSnap.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = idx[i]; idx[i] = idx[j]; idx[j] = tmp;
    }
    const hold = new Set(idx.slice(0, holdN));
    const train = peersSnap.filter((_, i) => !hold.has(i));
    const test = peersSnap.filter((_, i) => hold.has(i));
    const f = fitFn(train);
    const m = looMetrics(test.map((p) => predFn(p, f)), test.map((p) => p.mcap_usd));
    meds.push(m.medianMax); w3.push(m.within3); sp.push(m.spearman);
  }
  const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return { medianMax: avg(meds), within3: avg(w3), spearman: avg(sp) };
}
// lib fitModel + impliedValue (noGm) — should reproduce validateModel's blind 3.78 for Huber.
const libBlindHuber = blindExact(
  (tr) => fitModel(tr, MODEL),
  (p, f) => impliedValue(p, f, snap.as_of, MODEL, false).raw,
);
console.log(`  lib fitModel (Huber ridge, noGm) blind exact: ${libBlindHuber.medianMax.toFixed(2)}/${libBlindHuber.within3.toFixed(1)}%/rho${libBlindHuber.spearman.toFixed(3)}  (validateModel reports 3.78/45.3%)`);
const libBlindOls = blindExact(
  (tr) => fitModel(tr, { ...MODEL, ridgeHuber: false }),
  (p, f) => impliedValue(p, f, snap.as_of, MODEL, false).raw,
);
console.log(`  NOTE: fitModel hardcodes huber=true in ridgeFit; the ridgeHuber flag above does NOT change it (verifying). blind exact: ${libBlindOls.medianMax.toFixed(2)}`);

// --- Q2: maturity drop ------------------------------------------------------
console.log('\n=== Q2: maturity + growth — do they help prediction? (withGm vs noGm on peers) ===');
const fitAll = fitModel(peers, MODEL);
function evalPredictor(label, predFn) {
  const looPreds = peers.map((p, i) => predFn(p, fitModel(peers.filter((_, j) => j !== i), MODEL)));
  const loo = looMetrics(looPreds, peers.map((p) => p.mcap_usd));
  const wfA = looMetrics(splits[0][2].map((p) => predFn(p, fitModel(splits[0][1], MODEL))), splits[0][2].map((p) => p.mcap_usd));
  const wfB = looMetrics(splits[1][2].map((p) => predFn(p, fitModel(splits[1][1], MODEL))), splits[1][2].map((p) => p.mcap_usd));
  console.log(`  ${label}: LOO ${loo.medianMax.toFixed(2)}/${loo.within3.toFixed(1)}%/rho${loo.spearman.toFixed(3)} | WF-cut ${wfA.medianMax.toFixed(2)}/${wfA.within3.toFixed(1)}% | WF-half ${wfB.medianMax.toFixed(2)}/${wfB.within3.toFixed(1)}%`);
  return { loo, wfA, wfB };
}
evalPredictor('noGm (headline: size+category only)', (p, f) => impliedValue(p, f, snap.as_of, MODEL, false).raw);
evalPredictor('withGm (growth x maturity applied)', (p, f) => impliedValue(p, f, snap.as_of, MODEL, true).raw);
evalPredictor('growth only (maturity=1)', (p, f) => {
  const m = { ...MODEL, maturityFloor: 1, maturityRange: 0 };
  return impliedValue(p, f, snap.as_of, m, true).raw;
});
evalPredictor('maturity only (growth weight 0)', (p, f) => {
  const m = { ...MODEL, growthWeight: 0 };
  return impliedValue(p, f, snap.as_of, m, true).raw;
});

console.log('\n=== Q2b: board impact of dropping maturity (and growth) ===');
const odds = fitOdds(snap, MODEL);
function boardSummary(label, model) {
  const fit = fitModel(peers, model);
  const board = buildBoard(snap, fit, model, odds);
  const counts = {};
  for (const r of board) counts[r.farm.verdict] = (counts[r.farm.verdict] || 0) + 1;
  const wl = board.filter((r) => r.is_watchlist).reduce((s, r) => s + r.implied_value_usd, 0);
  const tot = board.reduce((s, r) => s + r.implied_value_usd, 0);
  const farm = (counts['FARM'] || 0) + (counts['P25-POSITIVE'] || 0);
  console.log(`  ${label}: verdicts ${JSON.stringify(counts)} FARM-total=${farm} watchlist=$${(wl / 1e6).toFixed(1)}M board=$${(tot / 1e6).toFixed(1)}M`);
  console.log(`    top5: ${board.slice(0, 5).map((r) => `${r.name} $${(r.implied_value_usd / 1e6).toFixed(1)}M ${r.farm.verdict}`).join(' | ')}`);
  console.log(`    FARM rows: ${board.filter((r) => r.farm.verdict === 'FARM' || r.farm.verdict === 'P25-POSITIVE').map((r) => r.name).join(', ')}`);
  return board;
}
boardSummary('round 7 as shipped (growth+maturity+odds)', MODEL);
boardSummary('drop maturity only (maturity=1)', { ...MODEL, maturityFloor: 1, maturityRange: 0 });
boardSummary('drop growth only (growthWeight=0)', { ...MODEL, growthWeight: 0 });
boardSummary('drop BOTH growth+maturity', { ...MODEL, maturityFloor: 1, maturityRange: 0, growthWeight: 0 });
