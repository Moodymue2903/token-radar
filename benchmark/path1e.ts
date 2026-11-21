// Path to #1 — Q3b: is a less-censored odds fit validatable?
// Fit the odds logistic on protocols listed before 2024-01-01 (they have had
// >=1.8yr to record a token, so the outcome is far less censored), then test
// it on the 2024 cohort (listed 2024-01-01..2025-01-01, >=10 months) and on
// the 2025+ cohort. If it validates, it is a legitimate way to raise the
// big-name odds (Steakhouse 0.58 -> ~0.72). If it does not, the censoring
// fix is not shippable.
// Run: node benchmark/path1e.ts from the token-radar dir (node v22.23.5).
import { readFileSync } from 'node:fs';
import {
  parseSnapshot, isPreToken, solveLinear, clamp,
} from '../lib/model.ts';

const snap = parseSnapshot(readFileSync(
  '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json', 'utf8'));
const AS_OF = snap.as_of;
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

const trainAll = snap.protocols.filter((p) => p.listed_at !== null && rankableType(p));
const steak = snap.protocols.find((p) => p.slug === 'steakhouse-financial');
const pre24 = trainAll.filter((p) => p.listed_at < '2024-01-01');
const cohort24 = trainAll.filter((p) => p.listed_at >= '2024-01-01' && p.listed_at < '2025-01-01');
const cohort25 = trainAll.filter((p) => p.listed_at >= '2025-01-01');
console.log(`populations: all n=${trainAll.length} base=${(trainAll.filter(recordsToken).length / trainAll.length).toFixed(3)} | pre-2024 n=${pre24.length} base=${(pre24.filter(recordsToken).length / pre24.length).toFixed(3)} | 2024 cohort n=${cohort24.length} base=${(cohort24.filter(recordsToken).length / cohort24.length).toFixed(3)} | 2025+ cohort n=${cohort25.length} base=${(cohort25.filter(recordsToken).length / cohort25.length).toFixed(3)}`);

for (const terms of [['age', 'size'], ['age', 'size', 'family']]) {
  const label = terms.join('+');
  // A: fit on ALL (round 7) — reference.
  const fitAll = logitFit(trainAll, trainAll.map((p) => (recordsToken(p) ? 1 : 0)), terms);
  // B: fit on pre-2024 only.
  const fitPre = logitFit(pre24, pre24.map((p) => (recordsToken(p) ? 1 : 0)), terms);
  // C: fit on pre-2025 (all except the 2025+ cohort) — the "10 months minimum" fit.
  const pre25 = trainAll.filter((p) => p.listed_at < '2025-01-01');
  const fitPre25 = logitFit(pre25, pre25.map((p) => (recordsToken(p) ? 1 : 0)), terms);
  function ev(fit, set, name) {
    const ys = set.map((p) => (recordsToken(p) ? 1 : 0));
    const base = ys.reduce((s, v) => s + v, 0) / ys.length;
    const preds = set.map((p) => logitPredict(fit, p));
    const b = brier(preds, ys);
    const bb = ys.reduce((s, v) => s + (base - v) ** 2, 0) / ys.length;
    return `${name} Brier=${b.toFixed(3)} (base ${bb.toFixed(3)}, n=${set.length}, ${(calledRight(preds, ys) * 100).toFixed(0)}%)`;
  }
  console.log(`\n-- ${label} --`);
  console.log(`  A fit-on-ALL: Steakhouse=${logitPredict(fitAll, steak).toFixed(2)} | ${ev(fitAll, cohort24, '2024 cohort')} | ${ev(fitAll, cohort25, '2025+ cohort')}`);
  console.log(`  B fit-on-pre2024: Steakhouse=${logitPredict(fitPre, steak).toFixed(2)} | ${ev(fitPre, cohort24, '2024 cohort')} | ${ev(fitPre, cohort25, '2025+ cohort')} | coefs int=${fitPre.beta[0].toFixed(2)} age=${fitPre.beta[1].toFixed(2)} size=${fitPre.beta[2].toFixed(2)}`);
  console.log(`  C fit-on-pre2025: Steakhouse=${logitPredict(fitPre25, steak).toFixed(2)} | ${ev(fitPre25, cohort25, '2025+ cohort')} | coefs int=${fitPre25.beta[0].toFixed(2)} age=${fitPre25.beta[1].toFixed(2)} size=${fitPre25.beta[2].toFixed(2)}`);
  console.log(`  (A coefs int=${fitAll.beta[0].toFixed(2)} age=${fitAll.beta[1].toFixed(2)} size=${fitAll.beta[2].toFixed(2)})`);
}
