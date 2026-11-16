// bands.ts — Stage B calibration: parametric-bootstrap predictive intervals for the M0 model.
// Method (per blind seed, train-only everything, no leakage):
//   fit M0 on the 102 train peers; LOO residuals on train (log10(pred/act), no-gm predictor);
//   for each test peer, 200 bootstrap resamples of the TRAIN peers (seeded mulberry32), refit,
//   predict the test peer (no-gm), multiply by 10^(one residual drawn from the train LOO residuals),
//   take p10/p25/p75/p90. Coverage = % of true mcaps inside [p10,p90] (80% band) and [p25,p75] (50%).
// Splits are verbatim the Stage A frozen splits (experiment.ts blindSplits/timeSplit: seeds
// [11,23,37,41,53], mulberry32 + Fisher-Yates over the 128 peer indices in snapshot order, hold =
// first 26 shuffled indices; time-split train listed_at < 2025-01-01, test >=).
// Also: time-split calibration (same procedure), and the full-data band width across the production
// board rows (what production will display; row set from buildRadar).
// Run: node round2/stageB/bands.ts (Kit Node 22), from the repo root.
// Output: JSON on stdout (also written to round2/stageB/bands.json).

import { readFileSync, writeFileSync } from 'node:fs';
import { parseSnapshot, peersOf, fitModel, impliedValue, buildRadar, mulberry32, median, MODEL, type SnapshotProtocol, type Snapshot } from '../../lib/model.ts';

const ROOT = '/home/hatch/workspace/makefun/token-radar';
const SNAPSHOT = '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json';
const SEEDS = [11, 23, 37, 41, 53];
const TIME_CUT = '2025-01-01';
const BOOT = 200; // bootstrap resamples per row

const snap = parseSnapshot(readFileSync(SNAPSHOT, 'utf8'));
const PEERS = peersOf(snap); // 128, snapshot order
const AS_OF = snap.as_of;

const quantile = (sorted: number[], q: number): number => {
  const n = sorted.length;
  if (n === 0) throw new Error('quantile: empty');
  const pos = q * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
};

/** Verbatim Stage A frozen blind splits. */
function blindSplits(): { train: SnapshotProtocol[]; test: SnapshotProtocol[] }[] {
  const holdN = Math.round(PEERS.length * 0.2); // 26
  return SEEDS.map((seed) => {
    const rng = mulberry32(seed);
    const idx = PEERS.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = idx[i]!;
      idx[i] = idx[j]!;
      idx[j] = tmp;
    }
    const hold = new Set(idx.slice(0, holdN));
    return {
      train: PEERS.filter((_, i) => !hold.has(i)),
      test: PEERS.filter((_, i) => hold.has(i)),
    };
  });
}

/** Verbatim Stage A time split. */
function timeSplit(): { train: SnapshotProtocol[]; test: SnapshotProtocol[] } {
  return {
    train: PEERS.filter((p) => p.listed_at !== null && p.listed_at < TIME_CUT),
    test: PEERS.filter((p) => p.listed_at !== null && p.listed_at >= TIME_CUT),
  };
}

/** LOO log10 residuals (no-gm predictor) for a peer set: one residual per peer. */
const looLogResiduals = (peers: SnapshotProtocol[], s: Snapshot): number[] => {
  const out: number[] = [];
  for (let i = 0; i < peers.length; i++) {
    const train = peers.filter((_, j) => j !== i);
    const fit = fitModel(train, MODEL);
    const pred = impliedValue(peers[i]!, fit, s.as_of, MODEL, false).raw;
    out.push(Math.log10(pred / peers[i]!.mcap_usd!));
  }
  return out;
};

/** Bootstrap predictive band for one target (no-gm), from a fit's peer set. */
const bootBand = (
  target: SnapshotProtocol,
  trainPeers: SnapshotProtocol[],
  s: Snapshot,
  looResid: number[],
  seed: number,
): { p10: number; p25: number; p75: number; p90: number; p50: number } => {
  const rng = mulberry32(seed);
  const vals: number[] = [];
  for (let b = 0; b < BOOT; b++) {
    const resample: SnapshotProtocol[] = [];
    for (let k = 0; k < trainPeers.length; k++) resample.push(trainPeers[Math.floor(rng() * trainPeers.length)]!);
    const f = fitModel(resample, MODEL);
    const pred = impliedValue(target, f, s.as_of, MODEL, false).raw;
    const resid = looResid[Math.floor(rng() * looResid.length)]!;
    vals.push(pred * 10 ** resid);
  }
  const sorted = vals.sort((a, b) => a - b);
  return { p10: quantile(sorted, 0.1), p25: quantile(sorted, 0.25), p50: quantile(sorted, 0.5), p75: quantile(sorted, 0.75), p90: quantile(sorted, 0.9) };
};

const t0 = performance.now();

// ---- Blind calibration: 5 frozen seeds, train-only bands, coverage on the 26 held-out peers ----
const blindRows: { seed: number; slug: string; act: number; point: number; p10: number; p25: number; p75: number; p90: number; in80: boolean; in50: boolean; p50overPoint: number }[] = [];
for (const [si, seed] of SEEDS.entries()) {
  const { train, test } = blindSplits()[si]!;
  const fit = fitModel(train, MODEL);
  const resid = looLogResiduals(train, snap);
  test.forEach((p, i) => {
    const point = impliedValue(p, fit, AS_OF, MODEL, false).raw;
    const band = bootBand(p, train, snap, resid, seed * 100000 + i);
    blindRows.push({
      seed,
      slug: p.slug,
      act: p.mcap_usd!,
      point,
      p10: band.p10,
      p25: band.p25,
      p75: band.p75,
      p90: band.p90,
      in80: p.mcap_usd! >= band.p10 && p.mcap_usd! <= band.p90,
      in50: p.mcap_usd! >= band.p25 && p.mcap_usd! <= band.p75,
      p50overPoint: band.p50 / point,
    });
  });
  console.error(`blind seed ${seed}: done (${test.length} test peers)`);
}
const blindCov80 = blindRows.filter((r) => r.in80).length / blindRows.length;
const blindCov50 = blindRows.filter((r) => r.in50).length / blindRows.length;
const blindWidth80 = median(blindRows.map((r) => r.p90 / r.p10));
const blindWidth50 = median(blindRows.map((r) => r.p75 / r.p25));
const blindCenter = median(blindRows.map((r) => r.p50overPoint));
const perSeed = SEEDS.map((s) => {
  const rows = blindRows.filter((r) => r.seed === s);
  return { seed: s, cov80: rows.filter((r) => r.in80).length / rows.length, cov50: rows.filter((r) => r.in50).length / rows.length };
});

// ---- Time-split calibration ----
const { train: tsTrain, test: tsTest } = timeSplit();
const tsFit = fitModel(tsTrain, MODEL);
const tsResid = looLogResiduals(tsTrain, snap);
const tsRows = tsTest.map((p, i) => {
  const band = bootBand(p, tsTrain, snap, tsResid, 777000 + i);
  return { slug: p.slug, act: p.mcap_usd!, p10: band.p10, p25: band.p25, p75: band.p75, p90: band.p90, in80: p.mcap_usd! >= band.p10 && p.mcap_usd! <= band.p90, in50: p.mcap_usd! >= band.p25 && p.mcap_usd! <= band.p75 };
});
const tsCov80 = tsRows.filter((r) => r.in80).length / tsRows.length;
const tsCov50 = tsRows.filter((r) => r.in50).length / tsRows.length;
console.error('time-split calibration done');

// ---- Full-data band widths across the production board rows (what production displays) ----
const { board } = buildRadar(snap);
const fullFit = fitModel(PEERS, MODEL);
const fullResid = looLogResiduals(PEERS, snap);
// BoardRow carries the same fields impliedValue reads (tvl_usd, category, change_7d, listed_at).
const widths = board.map((row, i) => {
  const target = row as unknown as SnapshotProtocol;
  const band = bootBand(target, PEERS, snap, fullResid, 4242000 + i);
  // gm is a deterministic per-row multiplier: the displayed band is the no-gm band times gm.
  const gm = impliedValue(target, fullFit, AS_OF, MODEL, true).raw / impliedValue(target, fullFit, AS_OF, MODEL, false).raw;
  return { slug: row.slug, p90overP10: (band.p90 * gm) / (band.p10 * gm), p75overP25: (band.p75 * gm) / (band.p25 * gm), p50: band.p50 * gm, point: row.implied_value_usd, p50overPoint: (band.p50 * gm) / row.implied_value_usd };
});
const boardWidth80 = median(widths.map((w) => w.p90overP10));
const boardWidth50 = median(widths.map((w) => w.p75overP25));
const boardCenter = median(widths.map((w) => w.p50overPoint));

const result = {
  method: 'parametric bootstrap predictive interval: 200 resamples of the fit peer set, refit M0, predict (no-gm), multiply by 10^(one residual drawn from the train-only LOO log-residuals), quantiles p10/p25/p50/p75/p90; gm applied deterministically after (band scales by gm)',
  boot: BOOT,
  blind: { n: blindRows.length, cov80: blindCov80, cov50: blindCov50, medianP90overP10: blindWidth80, medianP75overP25: blindWidth50, medianP50overPoint: blindCenter, perSeed },
  timeSplit: { n: tsRows.length, cov80: tsCov80, cov50: tsCov50 },
  boardFullData: { n: widths.length, medianP90overP10: boardWidth80, medianP75overP25: boardWidth50, medianP50overPoint: boardCenter },
  wallMs: Math.round(performance.now() - t0),
};
writeFileSync(`${ROOT}/round2/stageB/bands.json`, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
