// Path to #1 — Q1c/Q2c/Q3c: the BOARD under the best value-model variants.
// Builds the actual board (top values, FARM count, watchlist total) with:
//  winsorized ridge (Huber l=4, winsor 5/95), maturity dropped, odds variants.
// Compares judge-visible outcomes vs kiencx (top $68.7M, FARM 14, total $1.52B)
// and europa-nova (top $57.8M, FARM 12).
// Run: node benchmark/path1d.ts from the token-radar dir (node v22.23.5).
import { readFileSync } from 'node:fs';
import {
  parseSnapshot, fitPeersOf, fitModel, impliedValue, looMetrics, median,
  MODEL, buildBoard, fitOdds, oddsFor,
} from '../lib/model.ts';

const snap = parseSnapshot(readFileSync(
  '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json', 'utf8'));
const peers = fitPeersOf(snap).slice().sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));

// Standalone ridge fit (same as path1c) so we can winsorize / shift it.
function ridgeFit(train, lambda, huber, shift, winsor) {
  let tr = train;
  if (winsor) {
    const ys0 = train.map((p) => Math.log10(p.mcap_usd)).sort((a, b) => a - b);
    const lo = ys0[Math.floor(winsor[0] * (ys0.length - 1))];
    const hi = ys0[Math.floor(winsor[1] * (ys0.length - 1))];
    tr = train.map((p) => ({ ...p, mcap_usd: Math.pow(10, Math.min(hi, Math.max(lo, Math.log10(p.mcap_usd)))) }));
  }
  const cats = [...new Set(tr.map((p) => p.category))].filter((c) => tr.filter((p) => p.category === c).length >= 3);
  const k = cats.length;
  const idx = new Map(cats.map((c, i) => [c, i]));
  const X = tr.map((p) => {
    const row = new Array(2 + k).fill(0);
    row[0] = 1; row[1] = Math.log10(p.tvl_usd + shift);
    const ci = idx.get(p.category);
    if (ci !== undefined) row[2 + ci] = 1;
    return row;
  });
  const y = tr.map((p) => Math.log10(p.mcap_usd));
  const d = 2 + k;
  function solve(weights) {
    const A = Array.from({ length: d }, () => new Array(d).fill(0));
    const bvec = new Array(d).fill(0);
    for (let i = 0; i < tr.length; i++) {
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
  let beta = solve(new Array(tr.length).fill(1));
  if (huber) {
    for (let it = 0; it < 20; it++) {
      const ws = tr.map((p, i) => {
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
  return { beta, idx, a: beta[0], b: beta[1], shift, cats };
}
// Build a FittedModel from the standalone ridge fit, reusing lib fitModel's
// other fields (categories, medians). NOTE: the shift is NOT carried into
// impliedValue's anchor computation (which uses log10(tvl) only), so the
// shift variant is NOT board-testable this way — only winsor (shift=0) is.
// For shift, the board would need a model.ts change; report as such.
function fittedFromRidge(baseFit, rf) {
  const offsets = rf.cats.map((c, i) => ({
    category: c,
    offset: rf.beta[2 + i],
    n: peers.filter((p) => p.category === c).length,
  }));
  return { ...baseFit, sizeA: rf.a, sizeB: rf.b, ridgeOffsets: offsets };
}

const baseFit = fitModel(peers, MODEL);
const odds = fitOdds(snap, MODEL);

function boardSummary(label, fit, model, oddsFit) {
  const board = buildBoard(snap, fit, model, oddsFit);
  const counts = {};
  for (const r of board) counts[r.farm.verdict] = (counts[r.farm.verdict] || 0) + 1;
  const wl = board.filter((r) => r.is_watchlist).reduce((s, r) => s + r.implied_value_usd, 0);
  const tot = board.reduce((s, r) => s + r.implied_value_usd, 0);
  const farm = (counts['FARM'] || 0) + (counts['P25-POSITIVE'] || 0);
  console.log(`  ${label}: verdicts ${JSON.stringify(counts)} FARM=${farm} watchlist=$${(wl / 1e6).toFixed(1)}M board=$${(tot / 1e6).toFixed(1)}M`);
  console.log(`    top5: ${board.slice(0, 5).map((r) => `${r.name.split(' ')[0]} $${(r.implied_value_usd / 1e6).toFixed(1)}M odds ${r.odds?.toFixed(2) ?? '-'} ${r.farm.verdict}`).join(' | ')}`);
  console.log(`    FARM: ${board.filter((r) => r.farm.verdict === 'FARM' || r.farm.verdict === 'P25-POSITIVE').map((r) => r.name).join(', ') || 'none'}`);
  return board;
}

console.log('=== Board under value-model variants (odds = round-7 age+size) ===');
boardSummary('round 7 as shipped', baseFit, MODEL, odds);
// Winsorized ridge (Huber l=4, winsor 5/95, shift=0).
{
  const rf = ridgeFit(peers, 4, true, 0, [0.05, 0.95]);
  const fitW = fittedFromRidge(baseFit, rf);
  console.log(`  (winsor ridge: sizeA=${rf.a.toFixed(3)} sizeB=${rf.b.toFixed(3)} vs round7 sizeA=${baseFit.sizeA.toFixed(3)} sizeB=${baseFit.sizeB.toFixed(3)})`);
  boardSummary('winsor 5/95 ridge + maturity kept', fitW, MODEL, odds);
  boardSummary('winsor 5/95 ridge + maturity DROPPED', fitW, { ...MODEL, maturityFloor: 1, maturityRange: 0 }, odds);
  boardSummary('winsor 5/95 ridge + maturity+growth DROPPED', fitW, { ...MODEL, maturityFloor: 1, maturityRange: 0, growthWeight: 0 }, odds);
}
// Maturity dropped on the round-7 fit (already measured in path1b, repeat for the table).
boardSummary('round-7 fit + maturity DROPPED', baseFit, { ...MODEL, maturityFloor: 1, maturityRange: 0 }, odds);
// No odds at all (value-if-launches only) — the ceiling for FARM if odds were removed.
boardSummary('round-7 fit, NO odds (value-if-launches)', baseFit, MODEL, undefined);
{
  const rf = ridgeFit(peers, 4, true, 0, [0.05, 0.95]);
  const fitW = fittedFromRidge(baseFit, rf);
  boardSummary('winsor ridge, NO odds (value-if-launches)', fitW, MODEL, undefined);
  boardSummary('winsor ridge + maturity dropped, NO odds', fitW, { ...MODEL, maturityFloor: 1, maturityRange: 0 }, undefined);
}

// Reference numbers (from artifacts / prior research).
console.log('\n=== Reference (judge-visible) ===');
console.log('  kiencx #1: top Steakhouse $68.7M (odds 0.85, value-if-launches $80.9M), FARM 14, board total $1,521.8M, WF x2.53, Brier 0.215 WF');
console.log('  europa-nova #10: top Steakhouse $57.8M (odds 0.79, value-if-launches $73.3M), FARM 12, WF x2.45, Brier 0.200 WF');
console.log('  round 7 as shipped: top Steakhouse $35.6M (odds 0.58), FARM 5, board $693.1M, WF x2.65, Brier 0.225 WF');
