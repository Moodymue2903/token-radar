// Round 8 verification (pre-build): the winsorized ridge through the lib
// code path, the value-model two-test term table, and Huber-vs-OLS on the
// winsorized fit (all four splits, validateModel's exact blind splits).
// Run: node benchmark/value-terms-r8.ts from the token-radar dir.
import { readFileSync } from 'node:fs';
import {
  parseSnapshot, fitPeersOf, fitModel, impliedValue, looMetrics,
  median, mulberry32, MODEL, valueTermTable,
} from '../lib/model.ts';

const snap = parseSnapshot(readFileSync(
  '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json', 'utf8'));
const peersSnap = fitPeersOf(snap);
const peers = peersSnap.slice().sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
console.log(`fit peers n=${peers.length}`);

// --- Shipped fit through fitModel (Huber, winsor 5/95) ---
const fit = fitModel(peers, MODEL);
console.log(`shipped fit: sizeA=${fit.sizeA.toFixed(4)} sizeB=${fit.sizeB.toFixed(4)} R2=${fit.sizeR2.toFixed(4)} residSd=${fit.residualSd.toFixed(4)} ridgeHuber=${fit.ridgeHuber} winsorY=[${fit.ridgeWinsorLo.toFixed(3)}, ${fit.ridgeWinsorHi.toFixed(3)}]`);
console.log(`  MODEL: ridgeHuber=${MODEL.ridgeHuber} growthWeight=${MODEL.growthWeight} maturityFloor=${MODEL.maturityFloor} maturityRange=${MODEL.maturityRange}`);

// --- Value term table (computed in lib) ---
console.log('\n=== value term table (lib) ===');
const table = valueTermTable(snap, MODEL);
for (const r of table) {
  console.log(`  ${r.terms.padEnd(42)} LOO x${r.missLoo!.toFixed(2)}/${r.within3Loo!.toFixed(1)}%  WF x${r.missWf!.toFixed(2)}/${r.within3Wf!.toFixed(1)}%  ${r.status}`);
}
const kept = table.filter((r) => r.status === 'kept');
if (kept.length !== 1 || kept[0]!.terms !== 'size curve + category ridge') {
  console.log('  !!! WARNING: kept rows are not exactly the adopted model:', kept.map((r) => r.terms).join(', '));
}

// --- Huber vs OLS on the winsorized fit, all four splits ---
const half = Math.floor(peers.length / 2);
function blindExact(model) {
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
    const f = fitModel(train, model);
    const m = looMetrics(test.map((p) => impliedValue(p, f, snap.as_of, model, false).raw), test.map((p) => p.mcap_usd));
    meds.push(m.medianMax); w3.push(m.within3); sp.push(m.spearman);
  }
  const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return { medianMax: avg(meds), within3: avg(w3), spearman: avg(sp) };
}
function splitsFor(model) {
  const noGm = (p, f) => impliedValue(p, f, snap.as_of, model, false).raw;
  const looPreds = peers.map((p, i) => noGm(p, fitModel(peers.filter((_, j) => j !== i), model)));
  const loo = looMetrics(looPreds, peers.map((p) => p.mcap_usd));
  const trainA = peers.filter((p) => p.listed_at < '2025-01-01');
  const testA = peers.filter((p) => p.listed_at >= '2025-01-01');
  const wfA = looMetrics(testA.map((p) => noGm(p, fitModel(trainA, model))), testA.map((p) => p.mcap_usd));
  const wfB = looMetrics(peers.slice(half).map((p) => noGm(p, fitModel(peers.slice(0, half), model))), peers.slice(half).map((p) => p.mcap_usd));
  const blind = blindExact(model);
  return { loo, wfA, wfB, blind };
}
console.log('\n=== Huber vs OLS, winsorized fit (lib code path) ===');
for (const [label, model] of [['Huber (shipped)', MODEL], ['OLS', { ...MODEL, ridgeHuber: false }]]) {
  const s = splitsFor(model);
  console.log(`  ${label}: LOO x${s.loo.medianMax.toFixed(2)}/${s.loo.within3.toFixed(1)}%/rho${s.loo.spearman.toFixed(3)} | WF-cut x${s.wfA.medianMax.toFixed(2)}/${s.wfA.within3.toFixed(1)}% | WF-half x${s.wfB.medianMax.toFixed(2)}/${s.wfB.within3.toFixed(1)}% | blind x${s.blind.medianMax.toFixed(2)}/${s.blind.within3.toFixed(1)}%/rho${s.blind.spearman.toFixed(3)}`);
}
console.log('\nExpected (research, benchmark/path-to-number-one.md §1.3/§4):');
console.log('  Huber+winsor: LOO x2.74/50.5% | WF-cut x2.19/51.6% | WF-half x2.59/54.2% | blind x3.73/45.3%');
console.log('  OLS+winsor:   LOO x2.76/51.6% | WF-cut x2.28/51.6% | WF-half x2.61/54.2% | blind (unmeasured)');
