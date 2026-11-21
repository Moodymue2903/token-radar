// Round 7: token-odds model — build and validate before wiring it in.
// Logistic regression for P(protocol ever records a token), fitted on the
// snapshot's own record. Terms tested in kiencx's order: age/years listed,
// family effect (ridge 16), size curve (ln TVL), 7-day TVL growth; chain
// count tested; a control term ("growth of another row") must not help.
// A term is kept only if it lowers the Brier score in BOTH tests
// (leave-one-out and walk-forward). If the odds model does not beat the
// base rate in both tests, it is NOT shipped.
// Run: node odds-test.mjs (node v22.23.5, type stripping) from the token-radar dir.
import { readFileSync } from 'node:fs';
import {
  parseSnapshot, isPreToken, solveLinear, median, clamp,
} from '../lib/model.ts';

const snap = parseSnapshot(readFileSync(
  '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json', 'utf8'));
const AS_OF = snap.as_of;

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
function rankableType(p) {
  return p.category !== 'CEX' && !VERSIONED.test(p.name);
}
function recordsToken(p) {
  return !isPreToken(p);
}
// Training set: the rankable-type population with a listing date (age is
// the key feature and needs listed_at). CEX and versioned-name protocols
// are never board candidates, so they are not training examples.
const train = snap.protocols.filter((p) => p.listed_at !== null && rankableType(p));
const y = train.map((p) => (recordsToken(p) ? 1 : 0));
console.log(`odds train n=${train.length}, base rate=${(y.reduce((s, v) => s + v, 0) / y.length).toFixed(3)}`);
console.log(`  (all 758: pre-token ${snap.protocols.filter(isPreToken).length}, records ${snap.protocols.filter(recordsToken).length}; listed_at ${snap.protocols.filter((p) => p.listed_at).length})`);

function ageYears(p) {
  return Math.max(0, (Date.parse(`${AS_OF}T00:00:00Z`) - Date.parse(`${p.listed_at}T00:00:00Z`)) / 86400000 / 365.25);
}
function stem(p) {
  const w = p.name.trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return w.length > 0 ? w[0] : p.slug;
}
function growthPct(p) {
  return clamp(p.change_7d === null ? 0 : p.change_7d, -60, 120) / 100;
}

// Feature extractors. Each returns the design columns for one protocol
// (excluding the intercept, which is always column 0). Family columns are
// one-hot dummies for stems with >= 3 members in the FIT set, ridge-shrunk.
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
  if (terms.includes('family')) {
    const s = stem(p);
    for (const fam of stems) cols.push(s === fam ? 1 : 0);
  }
  return cols;
}
const FAMILY_LAMBDA = 16;

// Logistic regression by IRLS (Newton-Raphson) with ridge penalties:
// family offsets penalised at FAMILY_LAMBDA, main coefficients at 1e-6
// (stability only), intercept unpenalised. Returns the coefficient vector
// and the stem list (for prediction).
function logitFit(fitSet, fitY, terms) {
  const stems = terms.includes('family') ? familyStems(fitSet) : [];
  const nFam = stems.length;
  const nMain = features(fitSet[0], stems, terms).length - nFam;
  const d = 1 + nMain + nFam;
  const X = fitSet.map((p) => [1, ...features(p, stems, terms)]);
  let beta = new Array(d).fill(0);
  beta[0] = Math.log((fitY.reduce((s, v) => s + v, 0) / fitY.length) / (1 - fitY.reduce((s, v) => s + v, 0) / fitY.length));
  for (let it = 0; it < 50; it++) {
    const p = X.map((row) => {
      const z = row.reduce((s, v, j) => s + v * beta[j], 0);
      return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
    });
    const A = Array.from({ length: d }, () => new Array(d).fill(0));
    const g = new Array(d).fill(0);
    for (let i = 0; i < fitSet.length; i++) {
      const w = Math.max(1e-6, p[i] * (1 - p[i]));
      const r = fitY[i] - p[i];
      for (let a = 0; a < d; a++) {
        g[a] += X[i][a] * r;
        for (let b = 0; b < d; b++) A[a][b] += w * X[i][a] * X[i][b];
      }
    }
    for (let j = 1; j < 1 + nMain; j++) A[j][j] += 1e-6;
    for (let j = 1 + nMain; j < d; j++) A[j][j] += FAMILY_LAMBDA;
    const step = solveLinear(A, g);
    let maxStep = 0;
    for (let j = 0; j < d; j++) {
      beta[j] += step[j];
      maxStep = Math.max(maxStep, Math.abs(step[j]));
    }
    if (maxStep < 1e-9) break;
  }
  return { beta, stems, terms };
}
function logitPredict(fit, p) {
  const cols = [1, ...features(p, fit.stems, fit.terms)];
  const z = cols.reduce((s, v, j) => s + v * fit.beta[j], 0);
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
}
function brier(preds, ys) {
  return preds.reduce((s, p, i) => s + (p - ys[i]) ** 2, 0) / ys.length;
}
function calledRight(preds, ys) {
  return preds.filter((p, i) => (p > 0.5 ? 1 : 0) === ys[i]).length / ys.length;
}

// Walk-forward split for odds: fit on listed before 2025-01-01, test after.
const trainWf = train.filter((p) => p.listed_at < '2025-01-01');
const testWf = train.filter((p) => p.listed_at >= '2025-01-01');
const yWfTrain = trainWf.map((p) => (recordsToken(p) ? 1 : 0));
const yWfTest = testWf.map((p) => (recordsToken(p) ? 1 : 0));
// Half/half split by listing date.
const sorted = [...train].sort((a, b) => (a.listed_at < b.listed_at ? -1 : 1));
const halfN = Math.floor(sorted.length / 2);
const trainHalf = sorted.slice(0, halfN);
const testHalf = sorted.slice(halfN);
const yHalfTrain = trainHalf.map((p) => (recordsToken(p) ? 1 : 0));
const yHalfTest = testHalf.map((p) => (recordsToken(p) ? 1 : 0));
// Control term: the growth of another row (the next protocol in listing
// order) — a placebo that must not help.
const byListed = [...train].sort((a, b) => (a.listed_at < b.listed_at ? -1 : 1));
byListed.forEach((p, i) => {
  p._controlGrowth = growthPct(byListed[(i + 1) % byListed.length]);
});

function baseBrier(ys, base) {
  return ys.reduce((s, v) => s + (base - v) ** 2, 0) / ys.length;
}
const baseFull = y.reduce((s, v) => s + v, 0) / y.length;
const baseWf = yWfTrain.reduce((s, v) => s + v, 0) / yWfTrain.length;
const baseHalf = yHalfTrain.reduce((s, v) => s + v, 0) / yHalfTrain.length;
console.log(`base-rate Brier: full=${baseBrier(y, baseFull).toFixed(3)} WF-test=${baseBrier(yWfTest, baseWf).toFixed(3)} half-test=${baseBrier(yHalfTest, baseHalf).toFixed(3)}`);

const termSets = [
  ['base'],
  ['age'],
  ['age', 'size'],
  ['age', 'size', 'growth'],
  ['age', 'size', 'family'],
  ['age', 'size', 'growth', 'family'],
  ['age', 'size', 'chain'],
  ['age', 'size', 'control'],
];
for (const terms of termSets) {
  const label = terms.join('+') || 'base rate';
  // LOO (skip for base rate — it is the base rate itself).
  let looB = null;
  let looC = null;
  if (terms[0] !== 'base') {
    const preds = train.map((p, i) => {
      const tr = train.filter((_, j) => j !== i);
      const trY = y.filter((_, j) => j !== i);
      return logitPredict(logitFit(tr, trY, terms), p);
    });
    looB = brier(preds, y);
    looC = calledRight(preds, y);
  }
  // Walk-forward (2025 cutoff).
  let wfB = null;
  let wfC = null;
  let halfB = null;
  let halfC = null;
  if (terms[0] !== 'base') {
    const fitWf = logitFit(trainWf, yWfTrain, terms);
    const predsWf = testWf.map((p) => logitPredict(fitWf, p));
    wfB = brier(predsWf, yWfTest);
    wfC = calledRight(predsWf, yWfTest);
    const fitHalf = logitFit(trainHalf, yHalfTrain, terms);
    const predsHalf = testHalf.map((p) => logitPredict(fitHalf, p));
    halfB = brier(predsHalf, yHalfTest);
    halfC = calledRight(predsHalf, yHalfTest);
  }
  const fmt = (v) => (v === null ? '  -  ' : v.toFixed(3));
  console.log(`${label.padEnd(28)} LOO Brier=${fmt(looB)} (${looC === null ? '-' : (looC * 100).toFixed(0) + '%'})  WF Brier=${fmt(wfB)} (${wfC === null ? '-' : (wfC * 100).toFixed(0) + '%'})  half Brier=${fmt(halfB)} (${halfC === null ? '-' : (halfC * 100).toFixed(0) + '%'})`);
}
// Full-fit coefficients for the kept set (decided by the two-test rule above).
// Kept: age + size. Family improves LOO only (WF ties) so it is NOT kept;
// growth does not lower WF Brier; chain count and the control do not help.
const kept = ['age', 'size'];
const full = logitFit(train, y, kept);
console.log(`\nkept set (${kept.join('+')}) full-fit coefficients:`);
console.log(`  intercept=${full.beta[0].toFixed(3)} age=${full.beta[1].toFixed(3)} size=${full.beta[2].toFixed(3)}`);
console.log(`  (family stems with >=3 members in train: ${familyStems(train).length}; family NOT kept — LOO 0.208->0.200 but WF 0.225->0.225, no improvement)`);
// Full-fit Brier and called-right for the kept set (in-sample, for reference).
const fullPreds = train.map((p) => logitPredict(full, p));
console.log(`  kept-set in-sample Brier=${brier(fullPreds, y).toFixed(3)} called-right=${(calledRight(fullPreds, y) * 100).toFixed(0)}% (base rate ${(baseFull * 100).toFixed(1)}%)`);
