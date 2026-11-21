// Path to #1 — Q3 (odds variants + Steakhouse gap) and ridge follow-ups
// (shift+winsor corrected, blind-exact for OLS/winsor, winsor quantile sweep).
// Run: node benchmark/path1c.ts from the token-radar dir (node v22.23.5).
import { readFileSync } from 'node:fs';
import {
  parseSnapshot, fitPeersOf, peersOf, looMetrics, median, mulberry32,
  isPreToken, solveLinear, clamp, MODEL,
} from '../lib/model.ts';

const snap = parseSnapshot(readFileSync(
  '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json', 'utf8'));
const AS_OF = snap.as_of;
const peers = fitPeersOf(snap).slice().sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
const dateless = peersOf(snap).filter((p) => p.listed_at === null);

// ============ ridge follow-ups (fix the shift+winsor bug) ============
function ridgeFitShift(train, lambda, huber, shift, winsor) {
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
  return { beta, idx, a: beta[0], b: beta[1], shift };
}
function ridgePredictShift(p, rf) {
  const ci = rf.idx.get(p.category);
  const off = ci === undefined ? 0 : rf.beta[2 + ci];
  return Math.pow(10, rf.a + rf.b * Math.log10(p.tvl_usd + rf.shift) + off);
}
const half = Math.floor(peers.length / 2);
const splits = [
  ['WF-cut', peers.filter((p) => p.listed_at < '2025-01-01'), peers.filter((p) => p.listed_at >= '2025-01-01')],
  ['WF-half', peers.slice(0, half), peers.slice(half)],
];
function ridgeReport(label, fitFn) {
  const looPreds = peers.map((p, i) => ridgePredictShift(p, fitFn(peers.filter((_, j) => j !== i))));
  const loo = looMetrics(looPreds, peers.map((p) => p.mcap_usd));
  const wfA = looMetrics(splits[0][2].map((p) => ridgePredictShift(p, fitFn(splits[0][1]))), splits[0][2].map((p) => p.mcap_usd));
  const wfB = looMetrics(splits[1][2].map((p) => ridgePredictShift(p, fitFn(splits[1][1]))), splits[1][2].map((p) => p.mcap_usd));
  console.log(`  ${label}: LOO ${loo.medianMax.toFixed(2)}/${loo.within3.toFixed(1)}%/rho${loo.spearman.toFixed(3)} | WF-cut ${wfA.medianMax.toFixed(2)}/${wfA.within3.toFixed(1)}%/rho${wfA.spearman.toFixed(3)} | WF-half ${wfB.medianMax.toFixed(2)}/${wfB.within3.toFixed(1)}%/rho${wfB.spearman.toFixed(3)}`);
  return { loo, wfA, wfB };
}
console.log('=== Ridge follow-ups (corrected) ===');
ridgeReport('ridge Huber l=4 shift=$100M + winsor 5/95', (tr) => ridgeFitShift(tr, 4, true, 1e8, [0.05, 0.95]));
ridgeReport('ridge OLS l=4 shift=$100M + winsor 5/95', (tr) => ridgeFitShift(tr, 4, false, 1e8, [0.05, 0.95]));
ridgeReport('ridge Huber l=4 winsor 1/99', (tr) => ridgeFitShift(tr, 4, true, 0, [0.01, 0.99]));
ridgeReport('ridge Huber l=4 winsor 2.5/97.5', (tr) => ridgeFitShift(tr, 4, true, 0, [0.025, 0.975]));
ridgeReport('ridge Huber l=4 winsor 10/90', (tr) => ridgeFitShift(tr, 4, true, 0, [0.10, 0.90]));
ridgeReport('ridge Huber l=4 shift=$100M + winsor 2.5/97.5', (tr) => ridgeFitShift(tr, 4, true, 1e8, [0.025, 0.975]));
// dateless in train + winsor
{
  const trainA128 = [...dateless, ...splits[0][1]];
  const rf = ridgeFitShift(trainA128, 4, true, 0, [0.05, 0.95]);
  const m = looMetrics(splits[0][2].map((p) => ridgePredictShift(p, rf)), splits[0][2].map((p) => p.mcap_usd));
  console.log(`  ridge Huber l=4 winsor 5/95 + dateless-train: WF-cut ${m.medianMax.toFixed(2)}/${m.within3.toFixed(1)}%/rho${m.spearman.toFixed(3)}`);
  const rf2 = ridgeFitShift(trainA128, 4, true, 1e8, [0.05, 0.95]);
  const m2 = looMetrics(splits[0][2].map((p) => ridgePredictShift(p, rf2)), splits[0][2].map((p) => p.mcap_usd));
  console.log(`  ridge Huber l=4 shift=$100M + winsor 5/95 + dateless-train: WF-cut ${m2.medianMax.toFixed(2)}/${m2.within3.toFixed(1)}%/rho${m2.spearman.toFixed(3)}`);
}
// Blind exact (snapshot order) for OLS ridge l=4 and winsorized Huber ridge l=4.
function blindExact(fitFn) {
  const peersSnap = fitPeersOf(snap);
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
    const m = looMetrics(test.map((p) => ridgePredictShift(p, f)), test.map((p) => p.mcap_usd));
    meds.push(m.medianMax); w3.push(m.within3); sp.push(m.spearman);
  }
  const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return { medianMax: avg(meds), within3: avg(w3), spearman: avg(sp) };
}
{
  const bOls = blindExact((tr) => ridgeFitShift(tr, 4, false, 0, null));
  console.log(`  blind exact OLS ridge l=4: ${bOls.medianMax.toFixed(2)}/${bOls.within3.toFixed(1)}%/rho${bOls.spearman.toFixed(3)} (Huber l=4 lib: 3.78/45.3%)`);
  const bWin = blindExact((tr) => ridgeFitShift(tr, 4, true, 0, [0.05, 0.95]));
  console.log(`  blind exact Huber ridge l=4 winsor 5/95: ${bWin.medianMax.toFixed(2)}/${bWin.within3.toFixed(1)}%/rho${bWin.spearman.toFixed(3)}`);
  const bShift = blindExact((tr) => ridgeFitShift(tr, 4, true, 1e8, null));
  console.log(`  blind exact Huber ridge l=4 shift=$100M: ${bShift.medianMax.toFixed(2)}/${bShift.within3.toFixed(1)}%/rho${bShift.spearman.toFixed(3)}`);
}

// ============ Q3: odds variants ============
console.log('\n=== Q3: odds variants (Steakhouse gap: ours 0.58 vs kiencx 0.85) ===');
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
function rankableType(p) { return p.category !== 'CEX' && !VERSIONED.test(p.name); }
function recordsToken(p) { return !isPreToken(p); }
function ageYears(p) { return Math.max(0, (Date.parse(`${AS_OF}T00:00:00Z`) - Date.parse(`${p.listed_at}T00:00:00Z`)) / 86400000 / 365.25); }
function stem(p) { const w = p.name.trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); return w.length > 0 ? w[0] : p.slug; }
function growthPct(p) { return clamp(p.change_7d === null ? 0 : p.change_7d, -60, 120) / 100; }
function familyStems(fitSet) {
  const counts = new Map();
  for (const p of fitSet) counts.set(stem(p), (counts.get(stem(p)) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n >= 3).map(([s]) => s).sort();
}
function features(p, stems, terms) {
  const cols = [];
  if (terms.includes('age')) cols.push(ageYears(p));
  if (terms.includes('size')) cols.push(Math.log(p.tvl_usd) - Math.log(1e8));
  if (terms.includes('growth')) cols.push(growthPct(p));
  if (terms.includes('chain')) cols.push(Math.log(Math.max(1, p.chains.length)) - Math.log(2));
  if (terms.includes('control')) cols.push(p._controlGrowth ?? 0);
  if (terms.includes('family')) { const s = stem(p); for (const fam of stems) cols.push(s === fam ? 1 : 0); }
  return cols;
}
const FAMILY_LAMBDA = 16;
function logitFit(fitSet, fitY, terms) {
  const stems = terms.includes('family') ? familyStems(fitSet) : [];
  const nFam = stems.length;
  const nMain = features(fitSet[0], stems, terms).length - nFam;
  const d = 1 + nMain + nFam;
  const X = fitSet.map((p) => [1, ...features(p, stems, terms)]);
  let beta = new Array(d).fill(0);
  const base = fitY.reduce((s, v) => s + v, 0) / fitY.length;
  beta[0] = Math.log(base / (1 - base));
  for (let it = 0; it < 50; it++) {
    const pr = X.map((row) => { const z = row.reduce((s, v, j) => s + v * beta[j], 0); return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z)))); });
    const A = Array.from({ length: d }, () => new Array(d).fill(0));
    const g = new Array(d).fill(0);
    for (let i = 0; i < fitSet.length; i++) {
      const w = Math.max(1e-6, pr[i] * (1 - pr[i]));
      const r = fitY[i] - pr[i];
      for (let a = 0; a < d; a++) { g[a] += X[i][a] * r; for (let b = 0; b < d; b++) A[a][b] += w * X[i][a] * X[i][b]; }
    }
    for (let j = 1; j < 1 + nMain; j++) A[j][j] += 1e-6;
    for (let j = 1 + nMain; j < d; j++) A[j][j] += FAMILY_LAMBDA;
    const step = solveLinear(A, g);
    let maxStep = 0;
    for (let j = 0; j < d; j++) { beta[j] += step[j]; maxStep = Math.max(maxStep, Math.abs(step[j])); }
    if (maxStep < 1e-9) break;
  }
  return { beta, stems, terms };
}
function logitPredict(fit, p) {
  const cols = [1, ...features(p, fit.stems, fit.terms)];
  const z = cols.reduce((s, v, j) => s + v * fit.beta[j], 0);
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}
function brier(preds, ys) { return preds.reduce((s, p, i) => s + (p - ys[i]) ** 2, 0) / ys.length; }
function calledRight(preds, ys) { return preds.filter((p, i) => (p > 0.5 ? 1 : 0) === ys[i]).length / ys.length; }

const steak = snap.protocols.find((p) => p.slug === 'steakhouse-financial');
const topNames = ['steakhouse-financial', 'veda', 'gauntlet', 'upshift', 'usdd'];
console.log(`Steakhouse: TVL $${(steak.tvl_usd / 1e9).toFixed(2)}B, listed ${steak.listed_at}, age ${ageYears(steak).toFixed(2)}yr, 7d ${steak.change_7d}%, chains ${steak.chains.length}, category ${steak.category}`);

function oddsReport(label, trainSet, terms) {
  const y = trainSet.map((p) => (recordsToken(p) ? 1 : 0));
  const base = y.reduce((s, v) => s + v, 0) / y.length;
  // LOO
  const predsLoo = trainSet.map((p, i) => logitPredict(logitFit(trainSet.filter((_, j) => j !== i), y.filter((_, j) => j !== i), terms), p));
  const looB = brier(predsLoo, y); const looC = calledRight(predsLoo, y);
  // WF: fit <2025-01-01, test >=2025-01-01 (within this trainSet)
  const trWf = trainSet.filter((p) => p.listed_at < '2025-01-01');
  const teWf = trainSet.filter((p) => p.listed_at >= '2025-01-01');
  const fitWf = logitFit(trWf, trWf.map((p) => (recordsToken(p) ? 1 : 0)), terms);
  const wfB = brier(teWf.map((p) => logitPredict(fitWf, p)), teWf.map((p) => (recordsToken(p) ? 1 : 0)));
  const wfC = calledRight(teWf.map((p) => logitPredict(fitWf, p)), teWf.map((p) => (recordsToken(p) ? 1 : 0)));
  // Full fit + Steakhouse odds
  const full = logitFit(trainSet, y, terms);
  const skOdds = logitPredict(full, steak);
  const topOdds = topNames.map((s) => { const p = snap.protocols.find((x) => x.slug === s); return `${p.name.split(' ')[0]}:${logitPredict(full, p).toFixed(2)}`; }).join(' ');
  console.log(`  ${label} (n=${trainSet.length} base=${base.toFixed(3)}): LOO Brier=${looB.toFixed(3)} (${(looC * 100).toFixed(0)}%) WF Brier=${wfB.toFixed(3)} (${(wfC * 100).toFixed(0)}%, nTest=${teWf.length}) Steakhouse=${skOdds.toFixed(2)} | ${topOdds}`);
  return { looB, wfB, skOdds, full };
}

const trainAll = snap.protocols.filter((p) => p.listed_at !== null && rankableType(p));
console.log(`\n-- baseline population (rankable + listed_at): n=${trainAll.length} --`);
oddsReport('age+size (round 7 kept)', trainAll, ['age', 'size']);
oddsReport('age+size+family', trainAll, ['age', 'size', 'family']);
oddsReport('age+size+growth+family (kiencx full set)', trainAll, ['age', 'size', 'growth', 'family']);
oddsReport('age only', trainAll, ['age']);
oddsReport('age+size+growth', trainAll, ['age', 'size', 'growth']);

// Population variants.
const trainFloor = trainAll.filter((p) => p.tvl_usd >= 5e7);
console.log(`\n-- TVL >= $50M floor population: n=${trainFloor.length} --`);
oddsReport('age+size (floor pop)', trainFloor, ['age', 'size']);
oddsReport('age+size+family (floor pop)', trainFloor, ['age', 'size', 'family']);
oddsReport('age+size+growth+family (floor pop)', trainFloor, ['age', 'size', 'growth', 'family']);

const trainPre24 = trainAll.filter((p) => p.listed_at < '2024-01-01');
console.log(`\n-- listed before 2024-01-01 (less censored): n=${trainPre24.length} --`);
oddsReport('age+size (pre-2024 fit)', trainPre24, ['age', 'size']);
oddsReport('age+size+family (pre-2024 fit)', trainPre24, ['age', 'size', 'family']);

// Kiencx-comparable population: what base rate would we need for Steakhouse 0.85?
// Sensitivity: refit age+size on trainAll but report the odds if the intercept
// were shifted so the base rate matched kiencx's 0.552.
{
  const y = trainAll.map((p) => (recordsToken(p) ? 1 : 0));
  const full = logitFit(trainAll, y, ['age', 'size']);
  const zSk = full.beta[0] + full.beta[1] * ageYears(steak) + full.beta[2] * (Math.log(steak.tvl_usd) - Math.log(1e8));
  const base = y.reduce((s, v) => s + v, 0) / y.length;
  const shiftNeeded = Math.log(0.552 / (1 - 0.552)) - Math.log(base / (1 - base));
  console.log(`\n  intercept analysis: ours base=${base.toFixed(3)} (kiencx 0.552). Steakhouse z=${zSk.toFixed(2)} -> odds ${(1 / (1 + Math.exp(-zSk))).toFixed(2)}.`);
  console.log(`  If intercept shifted by +${shiftNeeded.toFixed(2)} (matching kiencx base rate), Steakhouse odds -> ${(1 / (1 + Math.exp(-(zSk + shiftNeeded)))).toFixed(2)}.`);
  console.log(`  Size-coef check: kiencx TVL coef 0.25 vs ours ${full.beta[2].toFixed(3)} (ln TVL/1e8 units). If ours were 0.25, Steakhouse z -> ${(zSk + (0.25 - full.beta[2]) * (Math.log(steak.tvl_usd) - Math.log(1e8))).toFixed(2)} -> odds ${(1 / (1 + Math.exp(-(zSk + (0.25 - full.beta[2]) * (Math.log(steak.tvl_usd) - Math.log(1e8)))))).toFixed(2)}.`);
}
