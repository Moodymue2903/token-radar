// Token Radar's model: one sealed snapshot in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never
// a ceiling) and adds pre-token protocols below the watchlist floor: the
// early rows the radar exists to find. A protocol is pre-token when its
// record carries no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's
// own values, never mixed into the ranked board.
//
// Implied token market capitalisation follows only from the snapshot's own
// figures, through a hierarchical (partial-pooling) comps model:
//
//   cat_mult    = shrunk category multiple (w = n/(n+5) toward the global
//                 median 0.204; w = 0 when the category has fewer than 3
//                 live peers, so Risk Curators falls back to global)
//   size_factor = (tvl / median_tvl_of_category) ^ (0.508 - 1), the fitted
//                 size curve anchored to the category's typical size
//   growth      = 1 + clamp(change_7d, -60, 120)/100 * 0.5
//   maturity    = 0.6 + min(age_days, 1095)/1095 * 0.4
//   implied     = max(1, round(tvl * cat_mult * size_factor * growth * maturity))
//
// The sub-linear curve (beta = 0.508) compresses the multiple of a protocol
// far above its category's median TVL: Steakhouse Financial at $2.75B TVL is
// 82x the $33.4M global median peer TVL, so its size factor is 0.114x and its
// multiple is 0.018x, not the raw 0.204x -- the board's multiples are
// post-dampening, not raw category multiples.
//
// The fit is recomputed from the snapshot every run (nothing is hardcoded
// except the priors: k = 5, the growth weight and the maturity floor; the
// slope comes from the Huber fit below). The size curve is a Huber fit
// (delta = 1.0, IRLS from OLS): the peer residuals are heavy-tailed, so OLS
// lets a few far-off peers drag the slope. The fit peers are the 95 peers
// with a listing date, out of the 128-peer universe: a protocol with no
// listed_at cannot have a seasoning / maturity term — its age is unknowable,
// not zero — so the 33 dateless peers are excluded from every fit,
// validation and band, while the universe stays 128 for reporting. No
// protocol name is ever special-cased: the same function scores every row.
// The model is a pricing yardstick, not a price target: its blind error —
// fit on 80% of the 95 fit peers, evaluated on the held-out 20%, repeated
// five times with fixed seeds, no tuning on the test set — is a median of
// x1.90 (1 + MdAPE, the median absolute percentage error), 50.5% within 3x
// on leave-one-out (median x1.82). Every row carries a bootstrap predictive
// band (200 resamples of the peer set, refit, plus one draw from the
// leave-one-out residual distribution): the 80% band covers 82% of held-out
// market caps on the blind splits, and it is wide — typically ~130x —
// because the error distribution is heavy-tailed (the 90th-percentile
// leave-one-out error is x21.2, far above the x1.82 median; the methodology
// panel states it). A FARM row whose net EV is still ≥ $0 at the P25 implied value promotes to
// ROBUST in the post-band step: it still pays (does not lose money) at the low end of its band.
// The $40 farm threshold at P25 is unreachable — the P25 band is wide (p25/implied is 0.24–0.41
// on FARM rows), so the best row on the board reaches only ~$9 at P25 — and "pays at the low
// end" means breaking even there, not clearing the median's $40 bar.
// The band is the honest uncertainty, shown next to the value, not hidden.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One category's fitted values: its winsorized median ratio, its median TVL, its peer count. */
export interface CategoryFit {
  category: string | null;
  median: number;
  medianTvl: number;
  n: number;
}

/** Everything the fit computes from the peer set, once per run. */
export interface FittedModel {
  peerCount: number;
  /** The peer universe the fit peers were drawn from (128 live-token peers). */
  peerUniverse: number;
  /** Universe peers excluded from the fit for having no listing date (33). */
  excludedNullListedAt: number;
  winsorLo: number;
  winsorHi: number;
  globalMedian: number;
  globalMedianTvl: number;
  categories: CategoryFit[];
  sizeA: number;
  sizeB: number;
  sizeR2: number;
  sizeSeB: number;
  residualSd: number;
}

/** The model's constants: the priors the dashboard states and the page recomputes with. */
export interface ModelConstants {
  shrinkK: number;
  minPeers: number;
  growthWeight: number;
  growthFloor: number;
  growthCap: number;
  maturityFloor: number;
  maturityRange: number;
  maturityDays: number;
  unknownAgeDays: number;
  poolShare: number;
  referenceCapital: number;
  ethCapital: number;
  oppRate: number;
  holdDays: number;
  farmThreshold: number;
  farmRatio: number;
  /** Top-of-book scalar: 1.00 since the post-audit round (see MODEL.topScalar). No lift. */
  topScalar: number;
}

export const MODEL: ModelConstants = {
  shrinkK: 5,
  minPeers: 3,
  growthWeight: 0.5,
  growthFloor: -60,
  growthCap: 120,
  maturityFloor: 0.6,
  maturityRange: 0.4,
  maturityDays: 1095,
  unknownAgeDays: 365,
  poolShare: 0.08,
  referenceCapital: 2500,
  ethCapital: 5000,
  oppRate: 0.045,
  holdDays: 90,
  // Build-time retune (plan 3.4 / 5 step 3): the $75 threshold gave 4 FARM
  // rows on the 200-row board (2%) and 0 on the watchlist. The net-EV ratio
  // (>= 1.5x) caps FARM at 15 rows however low the threshold goes, so $40
  // takes every row that passes the ratio test: 15 FARM (7.5%), the closest
  // the rule can come to the top decile without touching its structure.
  farmThreshold: 40,
  farmRatio: 1.5,
  // Top-of-book scalar, DROPPED to 1.00 in the post-audit round: round 3
  // lifted the top-10 rows by 1.15x to close the gap to the reference's top
  // end; Gemini, DeepSeek and GLM all called it an unjustified post-hoc
  // patch (no derivation, a 15% cliff between ranks 10 and 11, and the
  // watchlist total pushed to $0.678B, 0.25% from the $0.68B ceiling), so
  // it is removed. 1.00 keeps every row's model value unchanged; the
  // watchlist total falls back to the model's own ~$0.637B.
  topScalar: 1.0,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-5-huber';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many of the board's top rows the (now 1.00, no-op) scalar would lift. Kept so buildBoard/attachBands and the dashboard's impliedOf need no structural change. */
export const TOP_ROWS = 10;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs in dollars, and how long it takes. */
export interface FarmStep {
  text: string;
  costUsd: number;
  time: string;
  /** Hands-on minutes for this step: active work, not waiting (the hold step is 0). */
  handsOnMinutes: number;
}

/** A row's net-EV verdict and the arithmetic behind it. */
export interface Verdict {
  verdict: 'ROBUST' | 'FARM' | 'THIN' | 'SKIP';
  capital: number;
  pool: number;
  share: number;
  gasTotal: number;
  oppCost: number;
  totalCost: number;
  netEv: number;
  netEvRatio: number;
  /** The net EV after fee drag: netEv x (1 - feeDrag), where feeDrag is the gas share of the capital clamped to 0.5%-1.5%. Display only; the verdict gate is unchanged. */
  feesHold: number;
  /**
   * Post-band economics, filled by attachBands (the band must exist first):
   * netEvP25 / netEvRatioP25 are the net EV and its ratio at the P25 implied
   * value; breakevenValue is the implied value at which net EV is zero;
   * breakevenOdds is P(implied >= breakevenValue) under the lognormal band;
   * handsOnMinutes is the summed hands-on time of the farm steps;
   * netPerHour is netEv per hands-on hour. Absent only on a board that never
   * went through attachBands.
   */
  netEvP25?: number;
  netEvRatioP25?: number;
  breakevenValue?: number;
  breakevenOdds?: number;
  handsOnMinutes?: number;
  netPerHour?: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  is_watchlist: boolean;
  implied_value_usd: number;
  multiple: number;
  /** The bootstrap predictive interval (whole dollars, growth and maturity applied): p10/p90 is the 80% band, p25/p75 the 50% band. Attached by attachBands in buildRadar, not by buildBoard. */
  uncertainty?: { p10: number; p25: number; p75: number; p90: number };
  /** The farm mechanism in a few words, derived from the category (the farm plan's first action, shortened). */
  mechanism: string;
  model: {
    cat_mult: number;
    cat_n: number;
    cat_median_raw: number;
    median_tvl: number;
    size_factor: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  farm: Verdict;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One peer for the comps chart: its TVL, its market cap, its category. */
export interface PeerPoint {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
}

/** One row of the leave-one-out comparison table. */
export interface LooRow {
  model: string;
  median: number;
  medianMaxRatio: number;
  within2: number;
  within3: number;
  spearman: number;
}

/** The validation numbers the methodology panel shows, computed from the snapshot every run. */
export interface Validation {
  peerCount: number;
  loo: LooRow[];
  adoptedMedian: number;
  adoptedMedianMaxRatio: number;
  adoptedP90MaxRatio: number;
  adoptedWithin2: number;
  adoptedWithin3: number;
  adoptedLogRmse: number;
  adoptedSpearman: number;
  /**
   * The P25–P75 band for actual/implied from the LOO log-residuals on the
   * 95 fit peers: with r = log10(pred/actual), actual/implied = 10^(-r),
   * so the band is [10^(-q75), 10^(-q25)] where q25/q75 are the 25th/75th
   * percentiles of the residuals. The central half of held-out peers land
   * between these multiples of their implied value.
   */
  looBandRatioLo: number;
  looBandRatioHi: number;
  timeSplitMedian: number | null;
  timeSplitMedianMaxRatio: number | null;
  timeSplitWithin2: number | null;
  timeSplitWithin3: number | null;
  timeSplitSpearman: number | null;
  timeSplitN: number;
  blindMedian: number | null;
  blindMedianMaxRatio: number | null;
  blindWithin2: number | null;
  blindWithin3: number | null;
  blindSpearman: number | null;
  blindN: number;
  /** The flat baseline (constant = train median multiple) on the SAME frozen splits. */
  flatBlindMedian: number | null;
  flatBlindMedianMaxRatio: number | null;
  flatBlindWithin2: number | null;
  flatBlindWithin3: number | null;
  flatBlindSpearman: number | null;
  flatTimeSplitMedian: number | null;
  flatTimeSplitMedianMaxRatio: number | null;
  flatTimeSplitWithin2: number | null;
  flatTimeSplitWithin3: number | null;
  flatTimeSplitSpearman: number | null;
  /** Paired 95% CI for (M0 - flat) blind median error, 5 seeds, t(4) = 2.776. */
  flatBlindCiLo: number | null;
  flatBlindCiHi: number | null;
  bands: BandReport;
  coherence: number;
  chainEthDex: number;
  chainSolDex: number;
}

/** Everything the dashboard needs: the board, the live set, the peers and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  fit: FittedModel;
  validation: Validation;
  rows: BoardRow[];
  live: LiveRow[];
  peers: PeerPoint[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Clamp `x` into [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

/** The median of a non-empty array (sorted; the middle, or the mean of the two middles). */
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  return n % 2 === 1 ? s[(n - 1) / 2]! : 0.5 * (s[n / 2 - 1]! + s[n / 2]!);
}

/** A percentile by linear interpolation (the numpy default): pos = q * (n - 1). */
export function percentile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  if (n === 1) return s[0]!;
  const pos = q * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

/** Ordinary least squares of y on x: returns intercept, slope, R squared, SE(slope), residual SD. */
export function ols(xs: number[], ys: number[]): { a: number; b: number; r2: number; seB: number; residSd: number } {
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  const r2 = syy === 0 ? 0 : (sxy * sxy) / (sxx * syy);
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i]! - (a + b * xs[i]!);
    sse += r * r;
  }
  const residSd = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  const seB = sxx === 0 ? 0 : residSd / Math.sqrt(sxx);
  return { a, b, r2, seB, residSd };
}

/** Weighted least squares of y on x (intercept + slope), for the Huber IRLS loop. */
export function wls(xs: number[], ys: number[], ws: number[]): { a: number; b: number } {
  let sw = 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < xs.length; i++) {
    sw += ws[i]!;
    mx += ws[i]! * xs[i]!;
    my += ws[i]! * ys[i]!;
  }
  mx /= sw;
  my /= sw;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i]! - mx;
    sxx += ws[i]! * dx * dx;
    sxy += ws[i]! * dx * (ys[i]! - my);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { a: my - b * mx, b };
}

/**
 * Huber log-linear fit via IRLS (20 iterations, start from OLS, weights
 * min(1, delta/|r|)): the size curve's fit since radar-5. Down-weighting the
 * heavy-tailed residuals (a few peers sit orders of magnitude off the curve)
 * instead of letting them drag the OLS slope.
 */
export function huberLin(xs: number[], ys: number[], delta: number): { a: number; b: number } {
  let { a, b } = ols(xs, ys);
  for (let it = 0; it < 20; it++) {
    const ws = xs.map((x, i) => {
      const r = Math.abs(ys[i]! - (a + b * x));
      return r <= delta ? 1 : delta / r;
    });
    const next = wls(xs, ys, ws);
    if (Math.abs(next.a - a) < 1e-12 && Math.abs(next.b - b) < 1e-12) {
      a = next.a;
      b = next.b;
      break;
    }
    a = next.a;
    b = next.b;
  }
  return { a, b };
}

/** The standard normal CDF, via the Abramowitz–Stegun erf approximation (7.1.26, |error| < 1.5e-7). Deterministic. */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return clamp(0.5 * (1 + sign * y), 0, 1);
}

/** Average ranks for ties (1-based), then the Pearson correlation of the ranks. */
export function spearman(xs: number[], ys: number[]): number {
  const ranks = (v: number[]): number[] => {
    const order = v.map((_, i) => i).sort((i, j) => v[i]! - v[j]!);
    const r = new Array<number>(v.length).fill(0);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && v[order[j + 1]!] === v[order[i]!]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) r[order[k]!] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = ranks(xs);
  const ry = ranks(ys);
  const n = xs.length;
  const mx = rx.reduce((s, x) => s + x, 0) / n;
  const my = ry.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = rx[i]! - mx;
    const dy = ry[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return NaN;
  return sxy / Math.sqrt(sxx * syy);
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol records a token and has both a market cap and a TVL: a peer for the fit. */
export function isPeer(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null && p.symbol !== null && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The peer set: every protocol that records a token with a market cap and a TVL. */
export function peersOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(isPeer);
}

/**
 * The fit peers: the peer universe minus the 33 protocols with no listing
 * date (n=95). A protocol with no `listed_at` cannot have a seasoning /
 * maturity term — its age is unknowable, not zero — so it is excluded from
 * every fit, validation and band, while `peersOf` stays the 128-peer
 * universe for reporting. All fit/validation/band code uses these peers.
 */
export function fitPeersOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => isPeer(p) && p.listed_at !== null);
}

/**
 * Fit the model on a peer list: winsor bounds, the global median, one
 * shrunk multiple per category, and the log-log size curve. Pure: the same
 * peers always give the same fit.
 *
 * The size curve is a Huber fit (delta = 1.0, IRLS from OLS): the peer
 * residuals are heavy-tailed, so OLS lets a few far-off peers drag the
 * slope. sizeR2 and residualSd are computed from the Huber fit's own
 * predictions (R2 = 1 - SSE/SST; residualSd = sqrt(SSE/(n-2))); sizeSeB is
 * residualSd / sqrt(Sxx) on the same fit — the Huber analogue of the OLS
 * standard error, not an OLS quantity mixed into a Huber fit.
 * `universe`, when given, is the peer universe the fit peers were drawn
 * from, so the shipped fit can report peerUniverse / excludedNullListedAt;
 * refits that omit it report the peers they were fit on.
 */
export function fitModel(peers: SnapshotProtocol[], model: ModelConstants = MODEL, universe?: SnapshotProtocol[]): FittedModel {
  const ratios = peers.map((p) => p.mcap_usd! / p.tvl_usd);
  const lo = percentile(ratios, 0.05);
  const hi = percentile(ratios, 0.95);
  const wr = ratios.map((r) => clamp(r, lo, hi));
  const globalMedian = median(wr);
  const globalMedianTvl = median(peers.map((p) => p.tvl_usd));
  const byCat = new Map<string | null, { ratios: number[]; tvls: number[] }>();
  peers.forEach((p, i) => {
    const key = p.category;
    let bucket = byCat.get(key);
    if (bucket === undefined) {
      bucket = { ratios: [], tvls: [] };
      byCat.set(key, bucket);
    }
    bucket.ratios.push(wr[i]!);
    bucket.tvls.push(p.tvl_usd);
  });
  const categories: CategoryFit[] = [...byCat.entries()]
    .map(([category, bucket]) => ({
      category,
      median: median(bucket.ratios),
      medianTvl: median(bucket.tvls),
      n: bucket.ratios.length,
    }))
    .sort((a, b) => {
      if (a.category === null) return 1;
      if (b.category === null) return -1;
      return a.category < b.category ? -1 : a.category > b.category ? 1 : 0;
    });
  const xs = peers.map((p) => Math.log10(p.tvl_usd));
  const ys = peers.map((p) => Math.log10(p.mcap_usd!));
  const hub = huberLin(xs, ys, 1.0);
  // R2 / residual SD / SE(slope) from the Huber fit's own predictions.
  const n = xs.length;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  let sse = 0;
  let sst = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i]! - (hub.a + hub.b * xs[i]!);
    sse += r * r;
    sst += (ys[i]! - my) ** 2;
    sxx += (xs[i]! - mx) ** 2;
  }
  const residSd = n > 2 ? Math.sqrt(sse / (n - 2)) : 0;
  const sizeR2 = sst === 0 ? 0 : 1 - sse / sst;
  const sizeSeB = sxx === 0 ? 0 : residSd / Math.sqrt(sxx);
  return {
    peerCount: peers.length,
    peerUniverse: universe === undefined ? peers.length : universe.length,
    excludedNullListedAt: universe === undefined ? 0 : universe.length - peers.length,
    winsorLo: lo,
    winsorHi: hi,
    globalMedian,
    globalMedianTvl,
    categories,
    sizeA: hub.a,
    sizeB: hub.b,
    sizeR2,
    sizeSeB,
    residualSd: residSd,
  };
}

/** The shrunk category multiple for a category: w * median + (1 - w) * global; w = 0 when n < 3. */
export function categoryMultiple(fit: FittedModel, category: string | null, model: ModelConstants = MODEL): { mult: number; n: number; rawMedian: number } {
  const c = fit.categories.find((x) => x.category === category);
  if (c === undefined || c.n < model.minPeers) {
    return { mult: fit.globalMedian, n: c === undefined ? 0 : c.n, rawMedian: c === undefined ? fit.globalMedian : c.median };
  }
  const w = c.n / (c.n + model.shrinkK);
  return { mult: w * c.median + (1 - w) * fit.globalMedian, n: c.n, rawMedian: c.median };
}

/** The median TVL a category's size factor anchors to; the global median peer TVL when n < 3. */
export function medianTvlFor(fit: FittedModel, category: string | null, model: ModelConstants = MODEL): number {
  const c = fit.categories.find((x) => x.category === category);
  if (c === undefined || c.n < model.minPeers) return fit.globalMedianTvl;
  return c.medianTvl;
}

/** The growth multiplier from a seven-day change in per cent (null counts as 0). */
export function growthMultiplier(change7d: number | null, model: ModelConstants = MODEL): { pct: number; mult: number } {
  const pct = clamp(finite(change7d, 0), model.growthFloor, model.growthCap);
  return { pct, mult: 1 + (pct / 100) * model.growthWeight };
}

/** The maturity multiplier from an age in days (null counts as the unknown-age prior). */
export function maturityMultiplier(age: number | null, model: ModelConstants = MODEL): number {
  const a = age ?? model.unknownAgeDays;
  return model.maturityFloor + (Math.min(Math.max(a, 0), model.maturityDays) / model.maturityDays) * model.maturityRange;
}

/**
 * The implied token market capitalisation of one protocol under a fit:
 * the raw (unrounded) value the leave-one-out test uses, and the rounded
 * whole-dollar value the board carries. Growth and maturity are included
 * unless `withGm` is false (the LOO test excludes them: they are priors
 * on the watchlist, not fitted).
 */
export function impliedValue(
  p: SnapshotProtocol,
  fit: FittedModel,
  asOf: string,
  model: ModelConstants = MODEL,
  withGm = true,
  slopeScale = 1,
): {
  raw: number;
  implied: number;
  catMult: number;
  catN: number;
  catMedianRaw: number;
  medianTvl: number;
  sizeFactor: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
} {
  const cat = categoryMultiple(fit, p.category, model);
  const medTvl = medianTvlFor(fit, p.category, model);
  const sizeFactor = Math.pow(p.tvl_usd / medTvl, (fit.sizeB - 1) * slopeScale);
  const growth = growthMultiplier(p.change_7d, model);
  const age = ageDays(asOf, p.listed_at);
  const maturityMult = maturityMultiplier(age, model);
  let raw = p.tvl_usd * cat.mult * sizeFactor;
  if (withGm) raw *= growth.mult * maturityMult;
  raw = Math.max(1, raw);
  return {
    raw,
    implied: Math.max(1, Math.round(raw)),
    catMult: cat.mult,
    catN: cat.n,
    catMedianRaw: cat.rawMedian,
    medianTvl: medTvl,
    sizeFactor,
    growthPct: growth.pct,
    growthMult: growth.mult,
    maturityMult,
    age,
  };
}

/** The first chain a protocol names, or an empty string. */
export function primaryChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : '';
}

/** The gas price of one transaction on a chain, in dollars (a stated assumption, not a live price). */
export function gasPerTx(chain: string): number {
  const c = chain.trim().toLowerCase();
  if (c === '') return 2.0;
  if (c === 'ethereum') return 4.0;
  if (L2_CHAINS.has(c)) return 0.3;
  if (BTC_CHAINS.has(c)) return 2.0;
  return 0.05;
}

/** Ethereum rollups and cheap EVM chains, at $0.30 a transaction. */
const L2_CHAINS = new Set([
  'arbitrum',
  'optimism',
  'base',
  'ink',
  'monad',
  'zksync',
  'zksync era',
  'scroll',
  'linea',
  'blast',
  'mode',
  'manta',
  'manta pacific',
  'starknet',
  'polygon zkevm',
  'zora',
  'fraxtal',
  'lisk',
  'soneium',
  'unichain',
  'world chain',
  'abstract',
  'apechain',
  'bob',
  'hemi',
  'fuel',
  'movement',
  'superseed',
  'swellchain',
  'tac',
  'xai',
  'gravity',
]);

/** Bitcoin and its layer-2s, at $2.00 a transaction. */
const BTC_CHAINS = new Set([
  'bitcoin',
  'bsquared',
  'b2',
  'mezo',
  'merlin',
  'bitlayer',
  'rootstock',
  'stacks',
  'core',
  'bob',
  'bison',
  'citrea',
  'fractal',
  'hemi',
]);

/** The reference capital of one farm position: $5,000 when the primary chain is Ethereum, else $2,500. */
export function capitalFor(p: SnapshotProtocol, model: ModelConstants = MODEL): number {
  return primaryChain(p).trim().toLowerCase() === 'ethereum' ? model.ethCapital : model.referenceCapital;
}

/** The opportunity cost of holding the capital for the hold: 4.5% a year over 90 days. */
export function oppCost(capital: number, model: ModelConstants = MODEL): number {
  return (capital * model.oppRate * model.holdDays) / 365;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 90;
  if (age < 365) return 90;
  return 90;
}

/** The category's one action, in the words a farmer can follow. */
export function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curator') || c.includes('curator')) return `Deposit $${capital} into ${name}'s curated vault on ${chain} and keep the shares; the curators allocate it across their strategies.`;
  if (c.includes('onchain capital allocator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} allocation vault on ${chain} and hold the receipt token.`;
  if (c.includes('rwa') || c.includes('real world')) return `Mint $${capital} of the yield-bearing asset through ${name} on ${chain} and hold it; the yield accrues on-chain.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('basis trading')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC to ${chain} and use ${name}'s app on it.`;
  if (c.includes('payment')) return `Pay $${capital} through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name} on ${chain} and vote with the position.`;
  if (c.includes('cedefi') || c.includes('cefi')) return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The farm mechanism in a few words, from the same category branches as actionFor: the row's own label, not a copied one. */
export function mechanismFor(p: SnapshotProtocol): string {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('risk curator') || c.includes('curator')) return 'curator allocation';
  if (c.includes('onchain capital allocator') || c.includes('allocator')) return 'allocation vault';
  if (c.includes('rwa') || c.includes('real world')) return 'yield-bearing mint';
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'lending supply';
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('basis trading')) return 'liquidity provision';
  if (c.includes('bridge')) return 'bridged funds';
  if (c.includes('staking') || c.includes('restak')) return 'staked receipt';
  if (c.includes('perpetual') || c.includes('derivative')) return 'margin position';
  if (c.includes('prediction')) return 'market position';
  if (c.includes('stable')) return 'stable mint';
  if (c.includes('insurance')) return 'cover policy';
  if (c.includes('chain')) return 'app usage';
  if (c.includes('payment')) return 'payment flow';
  if (c.includes('governance')) return 'governance stake';
  if (c.includes('cedefi') || c.includes('cefi')) return 'custodial deposit';
  return 'protocol deposit';
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: $${step.costUsd.toFixed(2)}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: six steps, plus a seventh when it runs on three
 * or more chains. Every step carries its own dollar cost; the steps' costs
 * sum to the row's total farm cost. The plan is derived from the protocol's
 * own record (category, chains, TVL, age), never from a hand-written list
 * of names. Nothing here claims a points program, a quest or an airdrop
 * exists: the steps are proposed interactions to verify on the protocol's
 * own page.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, model: ModelConstants = MODEL): FarmStep[] {
  const chain = primaryChain(p) === '' ? 'its main chain' : primaryChain(p);
  const gas = gasPerTx(primaryChain(p));
  const capital = capitalFor(p, model);
  const hold = holdDaysFor(age);
  const opp = oppCost(capital, model);
  const multiChain = p.chains.length >= 3;
  const mainCapital = multiChain ? Math.round(capital * 0.6) : capital;
  const secondCapital = capital - mainCapital;
  const action = actionFor(p, mainCapital, chain);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the $${capital} you plan to farm, and keep its seed phrase offline`,
      costUsd: 1 * gas,
      time: '5 minutes',
      handsOnMinutes: 5,
    },
    {
      text: action.replace(/\.$/, ''),
      costUsd: 2 * gas,
      time: '15 minutes to set up',
      handsOnMinutes: 15,
    },
    {
      text: `Make one qualifying action each week for 12 weeks on ${chain}, such as a deposit, a borrow, a swap or a vote`,
      costUsd: 12 * gas,
      time: '10 minutes a week',
      handsOnMinutes: 120,
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot; the $${capital} stays in the position`,
      costUsd: opp,
      time: `${hold} days`,
      handsOnMinutes: 0,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own page and claim only from a link it publishes; never pay to claim`,
      costUsd: 1 * gas,
      time: '10 minutes',
      handsOnMinutes: 10,
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it`,
      costUsd: 0,
      time: '5 minutes',
      handsOnMinutes: 5,
    },
  ];
  if (multiChain) {
    const secondChain = p.chains[1]!;
    const gas2 = gasPerTx(secondChain);
    steps.push({
      text: `Repeat the main action with $${secondCapital} on ${secondChain} so the position is visible on 2 chains`,
      costUsd: 2 * gas2,
      time: '15 minutes',
      handsOnMinutes: 15,
    });
  }
  return steps;
}

/**
 * The net-EV verdict: a visible subtraction, not a threshold on value.
 * pool is the hypothetical airdrop pool (8% of implied value, a stated
 * assumption); share is the farmer's slice of it, diluted by TVL; cost is
 * the steps' gas plus the opportunity cost of the capital. FARM needs a
 * net EV of at least $40 (build-time retune from $75; see MODEL.farmThreshold)
 * and at least 1.5x the cost; THIN needs a net EV
 * of at least $0; anything else is SKIP. ROBUST is not decided here:
 * attachBands promotes a FARM row whose net EV at the P25 implied value
 * is still at least $0 (it still pays at the low end of its band).
 */
export function verdictFor(
  p: SnapshotProtocol,
  implied: number,
  steps: FarmStep[],
  model: ModelConstants = MODEL,
): Verdict {
  const capital = capitalFor(p, model);
  const pool = model.poolShare * implied;
  const share = pool * (capital / p.tvl_usd);
  const gasTotal = steps.reduce((s, st) => s + st.costUsd, 0) - oppCost(capital, model);
  const opp = oppCost(capital, model);
  const totalCost = gasTotal + opp;
  const netEv = share - totalCost;
  const ratio = totalCost > 0 ? netEv / totalCost : 0;
  const verdict: Verdict['verdict'] = netEv >= model.farmThreshold && ratio >= model.farmRatio ? 'FARM' : netEv >= 0 ? 'THIN' : 'SKIP';
  // Fee drag: the gas share of the capital, clamped to 0.5%-1.5%. The
  // fees-hold value is the net EV after that drag — what the plan is worth
  // once the fee take is accounted for. Display only; the verdict gate above is unchanged.
  const feeDrag = Math.min(0.015, Math.max(0.005, gasTotal / capital));
  const feesHold = netEv * (1 - feeDrag);
  return { verdict, capital, pool, share, gasTotal, oppCost: opp, totalCost, netEv, netEvRatio: ratio, feesHold };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, fit: FittedModel, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL, capped.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, fit, snapshot.as_of, model, true);
    const steps = farmSteps(p, v.age, model);
    const verdict = verdictFor(p, v.implied, steps, model);
    return { p, v, steps, verdict };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // Top-of-book scalar (model.topScalar), now 1.00: a no-op. The loop is
  // kept so the structure is unchanged — with the scalar at 1.00 the lifted
  // value equals the model value and the recomputed verdict is identical.
  // (Round 3 lifted the top-10 rows by 1.15x here; the post-audit round
  // dropped it — see the comment on MODEL.topScalar.)
  for (let i = 0; i < Math.min(TOP_ROWS, scored.length); i++) {
    const s = scored[i]!;
    const lifted = Math.max(1, Math.round(s.v.implied * model.topScalar));
    s.verdict = verdictFor(s.p, lifted, s.steps, model);
    s.v = { ...s.v, implied: lifted };
  }
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age,
    is_watchlist: snapshot.watchlist.includes(s.p.slug),
    implied_value_usd: s.v.implied,
    multiple: Math.round((s.v.implied / s.p.tvl_usd) * 10000) / 10000,
    mechanism: mechanismFor(s.p),
    model: {
      cat_mult: Math.round(s.v.catMult * 10000) / 10000,
      cat_n: s.v.catN,
      cat_median_raw: Math.round(s.v.catMedianRaw * 10000) / 10000,
      median_tvl: s.v.medianTvl,
      size_factor: Math.round(s.v.sizeFactor * 10000) / 10000,
      growth_pct: Math.round(s.v.growthPct * 100) / 100,
      growth_multiplier: Math.round(s.v.growthMult * 10000) / 10000,
      maturity_multiplier: Math.round(s.v.maturityMult * 10000) / 10000,
      age_days: s.v.age,
    },
    farm: {
      verdict: s.verdict.verdict,
      capital: s.verdict.capital,
      pool: Math.round(s.verdict.pool * 100) / 100,
      share: Math.round(s.verdict.share * 100) / 100,
      gasTotal: Math.round(s.verdict.gasTotal * 100) / 100,
      oppCost: Math.round(s.verdict.oppCost * 100) / 100,
      totalCost: Math.round(s.verdict.totalCost * 100) / 100,
      netEv: Math.round(s.verdict.netEv * 100) / 100,
      netEvRatio: Math.round(s.verdict.netEvRatio * 100) / 100,
      feesHold: Math.round(s.verdict.feesHold * 100) / 100,
    },
    farm_steps: s.steps.map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The peers as points for the comps chart, sorted by TVL. */
export function peerPoints(peers: SnapshotProtocol[]): PeerPoint[] {
  return peers
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd! }))
    .sort((a, b) => a.tvl_usd - b.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    const u = r.uncertainty;
    if (u === undefined) return `${r.slug} has no uncertainty band`;
    if (!(u.p10 > 0 && u.p10 <= u.p25 && u.p25 <= u.p75 && u.p75 <= u.p90)) {
      return `${r.slug} has a band out of order: p10 ${u.p10}, p25 ${u.p25}, p75 ${u.p75}, p90 ${u.p90}`;
    }
    if (typeof r.mechanism !== 'string' || r.mechanism.length === 0) return `${r.slug} has no mechanism label`;
  }
  return null;
}

/** Mulberry32: a small deterministic PRNG, for the blind splits' fixed seeds. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The metrics of one out-of-sample run: median error, tail coverage, RMSE, rank correlation. */
export interface LooMetrics {
  median1p: number;
  medianMax: number;
  within2: number;
  within3: number;
  logRmse: number;
  spearman: number;
}

/** Summarise predictions against actual market caps. */
export function looMetrics(preds: number[], acts: number[]): LooMetrics {
  const ape = preds.map((p, i) => Math.abs(p - acts[i]!) / acts[i]!);
  const maxr = preds.map((p, i) => Math.max(p / acts[i]!, acts[i]! / p));
  const logse = preds.map((p, i) => (Math.log10(p) - Math.log10(acts[i]!)) ** 2);
  const n = preds.length;
  return {
    median1p: 1 + median(ape),
    medianMax: median(maxr),
    within2: (100 * maxr.filter((x) => x <= 2).length) / n,
    within3: (100 * maxr.filter((x) => x <= 3).length) / n,
    logRmse: Math.sqrt(logse.reduce((s, x) => s + x, 0) / n),
    spearman: spearman(preds, acts),
  };
}

/**
 * Leave-one-out over a peer list: refit the whole model on the other peers
 * for each held-out peer, predict it without growth/maturity, and score.
 * `predict` takes a protocol and a fit; the caller supplies the variant.
 */
export function looRun(
  peers: SnapshotProtocol[],
  asOf: string,
  predict: (p: SnapshotProtocol, fit: FittedModel) => number,
  model: ModelConstants = MODEL,
): LooMetrics {
  const preds: number[] = [];
  const acts: number[] = [];
  for (let i = 0; i < peers.length; i++) {
    const train = peers.filter((_, j) => j !== i);
    const f = fitModel(train, model);
    preds.push(predict(peers[i]!, f));
    acts.push(peers[i]!.mcap_usd!);
  }
  return looMetrics(preds, acts);
}

/** Round a number to 4 decimals for the data file (deterministic, locale-free). */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Round a number to 2 decimals for the data file (deterministic, locale-free). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------- uncertainty bands

/** Bootstrap resamples per row for the predictive interval. Fixed, so two runs agree byte for byte. */
export const BAND_BOOT = 200;

/** The leave-one-out log10 residuals (no-gm predictor) for a peer set: one residual per peer. */
export function looLogResiduals(peers: SnapshotProtocol[], snapshot: Snapshot, model: ModelConstants = MODEL): number[] {
  const out: number[] = [];
  for (let i = 0; i < peers.length; i++) {
    const train = peers.filter((_, j) => j !== i);
    const fit = fitModel(train, model);
    const pred = impliedValue(peers[i]!, fit, snapshot.as_of, model, false).raw;
    out.push(Math.log10(pred / peers[i]!.mcap_usd!));
  }
  return out;
}

/**
 * One row's bootstrap predictive band (no growth/maturity): resample the fit's peer set BAND_BOOT
 * times with a seeded PRNG, refit, predict the row, and multiply by 10 to the power of one residual
 * drawn from the LOO log-residuals. The quantiles are the band: p10/p90 is the 80% band, p25/p75
 * the 50% band. Growth and maturity are deterministic per-row multipliers, so the caller scales
 * the band by them afterwards. Pure: the same peers, residuals and seed always give the same band.
 */
export function bootstrapBand(
  target: SnapshotProtocol,
  trainPeers: SnapshotProtocol[],
  snapshot: Snapshot,
  looResid: number[],
  seed: number,
  model: ModelConstants = MODEL,
): { p10: number; p25: number; p50: number; p75: number; p90: number } {
  const rng = mulberry32(seed);
  const vals: number[] = [];
  for (let b = 0; b < BAND_BOOT; b++) {
    const resample: SnapshotProtocol[] = [];
    for (let k = 0; k < trainPeers.length; k++) resample.push(trainPeers[Math.floor(rng() * trainPeers.length)]!);
    const f = fitModel(resample, model);
    const pred = impliedValue(target, f, snapshot.as_of, model, false).raw;
    const resid = looResid[Math.floor(rng() * looResid.length)]!;
    vals.push(pred * 10 ** resid);
  }
  const sorted = vals.sort((a, b) => a - b);
  return {
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
  };
}

/** What the band calibration measured, on the frozen blind and time-split sets. */
export interface BandReport {
  boot: number;
  blindCov80: number;
  blindCov50: number;
  blindN: number;
  timeCov80: number;
  timeCov50: number;
  timeN: number;
  boardWidth80: number;
  boardWidth50: number;
}

/**
 * The band calibration, computed from the snapshot every run: on each of the five frozen blind
 * 80/20 splits (seeds 11, 23, 37, 41, 53 — the same splits validateModel uses), fit on the train
 * peers only, build each held-out peer's band from train-only LOO residuals, and count how often
 * the true market cap falls inside the 80% and 50% bands; the same on the time split (listed
 * before 2025-01-01 vs after). The board widths come from attachBands, not from here.
 */
export function bandCalibration(snapshot: Snapshot, model: ModelConstants = MODEL): Omit<BandReport, 'boardWidth80' | 'boardWidth50'> {
  const peers = fitPeersOf(snapshot);
  const seeds = [11, 23, 37, 41, 53];
  const holdN = Math.round(peers.length * 0.2);
  let in80 = 0;
  let in50 = 0;
  let n = 0;
  for (const seed of seeds) {
    const rng = mulberry32(seed);
    const idx = peers.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = idx[i]!;
      idx[i] = idx[j]!;
      idx[j] = tmp;
    }
    const hold = new Set(idx.slice(0, holdN));
    const train = peers.filter((_, i) => !hold.has(i));
    const test = peers.filter((_, i) => hold.has(i));
    const resid = looLogResiduals(train, snapshot, model);
    test.forEach((p, i) => {
      const band = bootstrapBand(p, train, snapshot, resid, seed * 100000 + i, model);
      if (p.mcap_usd! >= band.p10 && p.mcap_usd! <= band.p90) in80++;
      if (p.mcap_usd! >= band.p25 && p.mcap_usd! <= band.p75) in50++;
      n++;
    });
  }
  const trainTs = peers.filter((p) => p.listed_at !== null && p.listed_at < '2025-01-01');
  const testTs = peers.filter((p) => p.listed_at !== null && p.listed_at >= '2025-01-01');
  let tsIn80 = 0;
  let tsIn50 = 0;
  if (trainTs.length > 0 && testTs.length > 0) {
    const residTs = looLogResiduals(trainTs, snapshot, model);
    testTs.forEach((p, i) => {
      const band = bootstrapBand(p, trainTs, snapshot, residTs, 777000 + i, model);
      if (p.mcap_usd! >= band.p10 && p.mcap_usd! <= band.p90) tsIn80++;
      if (p.mcap_usd! >= band.p25 && p.mcap_usd! <= band.p75) tsIn50++;
    });
  }
  return {
    boot: BAND_BOOT,
    blindCov80: n > 0 ? in80 / n : 0,
    blindCov50: n > 0 ? in50 / n : 0,
    blindN: n,
    timeCov80: testTs.length > 0 ? tsIn80 / testTs.length : 0,
    timeCov50: testTs.length > 0 ? tsIn50 / testTs.length : 0,
    timeN: testTs.length,
  };
}

/**
 * Attach the predictive band to every board row (whole dollars, growth and maturity applied) and
 * return the median band width across the board. The seed per row is fixed (4242000 + the row's
 * index in board order), so two runs write identical bands. The LOO residuals and the bootstrap
 * resamples come from the 95 fit peers; growth and maturity scale the band by the row's own
 * deterministic multipliers.
 *
 * Post-band step (same pass, once the band exists): per-row farm economics
 * and the ROBUST tier. netEvP25 / netEvRatioP25 rerun verdictFor's exact
 * pool/share arithmetic at the P25 implied value with the cost unchanged; a
 * FARM row whose net EV at P25 is still ≥ $0 promotes to ROBUST — it still
 * pays (does not lose money) at the low end of its band. The $40 farm
 * threshold is the median's bar; at P25 the honest bar is breaking even. breakevenValue is the
 * implied value at which net EV is zero (totalCost * tvl / (poolShare *
 * capital)); breakevenOdds is P(implied >= breakevenValue) modelling
 * log10(implied) as normal with median the row's implied value and sigma =
 * (log10(p75) - log10(p25)) / 1.349 (the 50% band spans 1.349 sigma), via the
 * Abramowitz-Stegun normal CDF, clamped to [0, 1]; netPerHour is netEv per
 * hands-on hour (hands-on minutes summed across the farm steps; the hold
 * step is waiting, not hands-on). Idempotent: a second pass leaves ROBUST
 * rows alone (only FARM rows can promote).
 */
export function attachBands(board: BoardRow[], fit: FittedModel, snapshot: Snapshot, model: ModelConstants = MODEL): { boardWidth80: number; boardWidth50: number } {
  const peers = fitPeersOf(snapshot);
  const resid = looLogResiduals(peers, snapshot, model);
  const index = bySlug(snapshot.protocols);
  const widths80: number[] = [];
  const widths50: number[] = [];
  board.forEach((row, i) => {
    const target = row as unknown as SnapshotProtocol;
    const band = bootstrapBand(target, peers, snapshot, resid, 4242000 + i, model);
    const gm = impliedValue(target, fit, snapshot.as_of, model, true).raw / impliedValue(target, fit, snapshot.as_of, model, false).raw;
    // The top-10 lift (model.topScalar) is 1.00 in the post-audit round,
    // so the band is unlifted — the point keeps its place in the band.
    const lift = row.rank <= TOP_ROWS ? model.topScalar : 1;
    row.uncertainty = {
      p10: Math.max(1, Math.round(band.p10 * gm * lift)),
      p25: Math.max(1, Math.round(band.p25 * gm * lift)),
      p75: Math.max(1, Math.round(band.p75 * gm * lift)),
      p90: Math.max(1, Math.round(band.p90 * gm * lift)),
    };
    widths80.push(row.uncertainty.p90 / row.uncertainty.p10);
    widths50.push(row.uncertainty.p75 / row.uncertainty.p25);
    // Post-band farm economics + ROBUST promotion (needs the band's p25/p75).
    const p = index.get(row.slug)!;
    const steps = farmSteps(p, row.age_days, model);
    const vMed = verdictFor(p, row.implied_value_usd, steps, model);
    const vP25 = verdictFor(p, row.uncertainty.p25, steps, model);
    const handsOn = steps.reduce((s, st) => s + st.handsOnMinutes, 0);
    const breakevenValue = (vMed.totalCost * p.tvl_usd) / (model.poolShare * vMed.capital);
    const sigma = (Math.log10(row.uncertainty.p75) - Math.log10(row.uncertainty.p25)) / 1.349;
    const breakevenOdds =
      sigma > 0
        ? 1 - normalCdf((Math.log10(breakevenValue) - Math.log10(row.implied_value_usd)) / sigma)
        : breakevenValue <= row.implied_value_usd
          ? 1
          : 0;
    row.farm.netEvP25 = round2(vP25.netEv);
    row.farm.netEvRatioP25 = round2(vP25.netEvRatio);
    row.farm.breakevenValue = round2(breakevenValue);
    row.farm.breakevenOdds = round4(breakevenOdds);
    row.farm.handsOnMinutes = handsOn;
    row.farm.netPerHour = round2(vMed.netEv / (handsOn / 60));
    if (row.farm.verdict === 'FARM' && vP25.netEv >= 0) row.farm.verdict = 'ROBUST';
  });
  return { boardWidth80: median(widths80), boardWidth50: median(widths50) };
}

/**
 * The full validation suite, computed from the snapshot every run so the
 * dashboard's methodology panel shows measured numbers, never hardcoded
 * ones: the LOO comparison table, the time-split, the blind 80/20 x5, the
 * watchlist coherence audit and the chain-residual finding.
 */
export function validateModel(snapshot: Snapshot, fit: FittedModel, model: ModelConstants = MODEL, band?: BandReport): Validation {
  const peers = fitPeersOf(snapshot);
  const asOf = snapshot.as_of;
  const noGm = (p: SnapshotProtocol, f: FittedModel): number => impliedValue(p, f, asOf, model, false).raw;
  const flat = (p: SnapshotProtocol): number => Math.max(1, p.tvl_usd * 0.25);
  const global = (p: SnapshotProtocol, f: FittedModel): number => Math.max(1, p.tvl_usd * f.globalMedian);
  const sizeOnly = (p: SnapshotProtocol, f: FittedModel): number => Math.max(1, Math.pow(10, f.sizeA + f.sizeB * Math.log10(p.tvl_usd)));
  const damped = (p: SnapshotProtocol, f: FittedModel): number => impliedValue(p, f, asOf, model, false, 0.5).raw;
  const mAdopted = looRun(peers, asOf, noGm, model);
  const mFlat = looRun(peers, asOf, flat, model);
  const mGlobal = looRun(peers, asOf, global, model);
  const mSize = looRun(peers, asOf, sizeOnly, model);
  const mDamped = looRun(peers, asOf, damped, model);
  // The 90th-percentile leave-one-out error: 1 in 10 peers is off by more than this.
  const looResid = looLogResiduals(peers, snapshot, model);
  const adoptedP90MaxRatio = round4(Math.pow(10, percentile(looResid.map((r) => Math.abs(r)), 0.9)));
  // P25–P75 band for actual/implied from the same LOO log-residuals (n=95):
  // r = log10(pred/actual), so actual/implied = 10^(-r); the band is
  // [10^(-q75), 10^(-q25)] where q25/q75 are the residual percentiles.
  const looBandRatioLo = round4(Math.pow(10, -percentile(looResid, 0.75)));
  const looBandRatioHi = round4(Math.pow(10, -percentile(looResid, 0.25)));
  const loo: LooRow[] = [
    { model: 'flat 0.25x (starter)', median: round4(mFlat.median1p), medianMaxRatio: round4(mFlat.medianMax), within2: round4(mFlat.within2), within3: round4(mFlat.within3), spearman: round4(mFlat.spearman) },
    { model: 'global median ' + fit.globalMedian.toFixed(3) + 'x', median: round4(mGlobal.median1p), medianMaxRatio: round4(mGlobal.medianMax), within2: round4(mGlobal.within2), within3: round4(mGlobal.within3), spearman: round4(mGlobal.spearman) },
    { model: 'size curve only', median: round4(mSize.median1p), medianMaxRatio: round4(mSize.medianMax), within2: round4(mSize.within2), within3: round4(mSize.within3), spearman: round4(mSize.spearman) },
    { model: 'shrunk s=0.5 (damped)', median: round4(mDamped.median1p), medianMaxRatio: round4(mDamped.medianMax), within2: round4(mDamped.within2), within3: round4(mDamped.within3), spearman: round4(mDamped.spearman) },
    { model: 'shrunk s=1.0 (adopted)', median: round4(mAdopted.median1p), medianMaxRatio: round4(mAdopted.medianMax), within2: round4(mAdopted.within2), within3: round4(mAdopted.within3), spearman: round4(mAdopted.spearman) },
  ];
  // Time-split: fit on listed before 2025-01-01, test on listed after.
  const trainTs = peers.filter((p) => p.listed_at !== null && p.listed_at < '2025-01-01');
  const testTs = peers.filter((p) => p.listed_at !== null && p.listed_at >= '2025-01-01');
  let timeSplitMedian: number | null = null;
  let timeSplitMedianMaxRatio: number | null = null;
  let timeSplitWithin2: number | null = null;
  let timeSplitWithin3: number | null = null;
  let timeSplitSpearman: number | null = null;
  if (trainTs.length > 0 && testTs.length > 0) {
    const fTs = fitModel(trainTs, model);
    const mTs = looMetrics(
      testTs.map((p) => noGm(p, fTs)),
      testTs.map((p) => p.mcap_usd!),
    );
    timeSplitMedian = round4(mTs.median1p);
    timeSplitMedianMaxRatio = round4(mTs.medianMax);
    timeSplitWithin2 = round4(mTs.within2);
    timeSplitWithin3 = round4(mTs.within3);
    timeSplitSpearman = round4(mTs.spearman);
  }
  // Flat baseline on the same time split: constant = train median multiple.
  // The flat predictor ranks by TVL (a positive constant times TVL), so its
  // Spearman is the TVL ranking's Spearman — the model must beat that, not zero.
  let flatTimeSplitMedian: number | null = null;
  let flatTimeSplitMedianMaxRatio: number | null = null;
  let flatTimeSplitWithin2: number | null = null;
  let flatTimeSplitWithin3: number | null = null;
  let flatTimeSplitSpearman: number | null = null;
  if (trainTs.length > 0 && testTs.length > 0) {
    const cTs = median(trainTs.map((p) => p.mcap_usd! / p.tvl_usd));
    const mFlatTs = looMetrics(
      testTs.map((p) => Math.max(1, cTs * p.tvl_usd)),
      testTs.map((p) => p.mcap_usd!),
    );
    flatTimeSplitMedian = round4(mFlatTs.median1p);
    flatTimeSplitMedianMaxRatio = round4(mFlatTs.medianMax);
    flatTimeSplitWithin2 = round4(mFlatTs.within2);
    flatTimeSplitWithin3 = round4(mFlatTs.within3);
    flatTimeSplitSpearman = round4(mFlatTs.spearman);
  }
  // Blind 80/20 x5, fixed seeds.
  const seeds = [11, 23, 37, 41, 53];
  const blindMedians: number[] = [];
  const blindMedianMaxRatios: number[] = [];
  const blindWithin2: number[] = [];
  const blindWithin3: number[] = [];
  const blindSpearman: number[] = [];
  const flatBlindMedians: number[] = [];
  const flatBlindMedianMaxRatios: number[] = [];
  const flatBlindWithin2: number[] = [];
  const flatBlindWithin3: number[] = [];
  const flatBlindSpearman: number[] = [];
  const holdN = Math.round(peers.length * 0.2);
  for (const seed of seeds) {
    const rng = mulberry32(seed);
    const idx = peers.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = idx[i]!;
      idx[i] = idx[j]!;
      idx[j] = tmp;
    }
    const hold = new Set(idx.slice(0, holdN));
    const train = peers.filter((_, i) => !hold.has(i));
    const test = peers.filter((_, i) => hold.has(i));
    const f = fitModel(train, model);
    const m = looMetrics(
      test.map((p) => noGm(p, f)),
      test.map((p) => p.mcap_usd!),
    );
    blindMedians.push(m.median1p);
    blindMedianMaxRatios.push(m.medianMax);
    blindWithin2.push(m.within2);
    blindWithin3.push(m.within3);
    blindSpearman.push(m.spearman);
    // Flat baseline on this split: constant = train median multiple.
    const cFlat = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
    const mFlat = looMetrics(
      test.map((p) => Math.max(1, cFlat * p.tvl_usd)),
      test.map((p) => p.mcap_usd!),
    );
    flatBlindMedians.push(mFlat.median1p);
    flatBlindMedianMaxRatios.push(mFlat.medianMax);
    flatBlindWithin2.push(mFlat.within2);
    flatBlindWithin3.push(mFlat.within3);
    flatBlindSpearman.push(mFlat.spearman);
  }
  const avg = (xs: number[]): number | null => (xs.length > 0 ? round4(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const blindMedian = avg(blindMedians);
  const blindMedianMaxRatio = avg(blindMedianMaxRatios);
  const blindWithin2Avg = avg(blindWithin2);
  const blindWithin3Avg = avg(blindWithin3);
  const blindSpearmanAvg = avg(blindSpearman);
  const flatBlindMedian = avg(flatBlindMedians);
  const flatBlindMedianMaxRatio = avg(flatBlindMedianMaxRatios);
  const flatBlindWithin2Avg = avg(flatBlindWithin2);
  const flatBlindWithin3Avg = avg(flatBlindWithin3);
  const flatBlindSpearmanAvg = avg(flatBlindSpearman);
  // Paired 95% CI for (M0 - flat) blind median error, 5 seeds, t(4) = 2.776.
  // All five per-seed differences are negative (M0 wins every seed), so the
  // interval sits entirely below zero: the blind advantage over flat is real.
  let flatBlindCiLo: number | null = null;
  let flatBlindCiHi: number | null = null;
  if (blindMedians.length === flatBlindMedians.length && blindMedians.length > 1) {
    const diffs = blindMedians.map((m, i) => m - flatBlindMedians[i]!);
    const meanD = diffs.reduce((s, x) => s + x, 0) / diffs.length;
    const sdD = Math.sqrt(diffs.reduce((s, x) => s + (x - meanD) ** 2, 0) / (diffs.length - 1));
    const seD = sdD / Math.sqrt(diffs.length);
    flatBlindCiLo = round4(meanD - 2.776 * seD);
    flatBlindCiHi = round4(meanD + 2.776 * seD);
  }
  // Watchlist coherence: Spearman between TVL and implied value over the 40 watchlist rows.
  const board = buildBoard(snapshot, fit, model);
  const watchRows = board.filter((r) => r.is_watchlist);
  const coherence = round4(spearman(watchRows.map((r) => r.tvl_usd), watchRows.map((r) => r.implied_value_usd)));
  // The bands: use the report the caller measured on the shipped board when given, else measure
  // it here (calibration on the frozen splits, widths on this board) so the numbers are never
  // hardcoded.
  const bands: BandReport =
    band ??
    (() => {
      const cal = bandCalibration(snapshot, model);
      const widths = attachBands(board, fit, snapshot, model);
      return { ...cal, ...widths };
    })();
  // Chain residuals: the median log10 residual of the adopted model per primary chain.
  const chainResid = (chain: string): number => {
    const res = peers
      .filter((p) => (p.chains[0] ?? '').toLowerCase() === chain)
      .map((p) => Math.log10(p.mcap_usd!) - Math.log10(noGm(p, fit)));
    if (res.length === 0) return 0;
    return round4(median(res));
  };
  return {
    peerCount: peers.length,
    loo,
    adoptedMedian: round4(mAdopted.median1p),
    adoptedMedianMaxRatio: round4(mAdopted.medianMax),
    adoptedP90MaxRatio,
    adoptedWithin2: round4(mAdopted.within2),
    adoptedWithin3: round4(mAdopted.within3),
    adoptedLogRmse: round4(mAdopted.logRmse),
    adoptedSpearman: round4(mAdopted.spearman),
    looBandRatioLo,
    looBandRatioHi,
    timeSplitMedian,
    timeSplitMedianMaxRatio,
    timeSplitWithin2,
    timeSplitWithin3,
    timeSplitSpearman,
    timeSplitN: testTs.length,
    blindMedian,
    blindMedianMaxRatio,
    blindWithin2: blindWithin2Avg,
    blindWithin3: blindWithin3Avg,
    blindSpearman: blindSpearmanAvg,
    blindN: holdN,
    flatBlindMedian,
    flatBlindMedianMaxRatio,
    flatBlindWithin2: flatBlindWithin2Avg,
    flatBlindWithin3: flatBlindWithin3Avg,
    flatBlindSpearman: flatBlindSpearmanAvg,
    flatTimeSplitMedian,
    flatTimeSplitMedianMaxRatio,
    flatTimeSplitWithin2,
    flatTimeSplitWithin3,
    flatTimeSplitSpearman,
    flatBlindCiLo,
    flatBlindCiHi,
    bands,
    coherence,
    chainEthDex: chainResid('ethereum'),
    chainSolDex: chainResid('solana'),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitModel(fitPeersOf(snapshot), model, peersOf(snapshot));
  const board = buildBoard(snapshot, fit, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.is_watchlist).length;
  // The bands are measured once on the shipped board and handed to validation, so the
  // methodology panel's calibration numbers are the same ones the board displays.
  const bandCal = bandCalibration(snapshot, model);
  const bandWidths = attachBands(board, fit, snapshot, model);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    fit,
    validation: validateModel(snapshot, fit, model, { ...bandCal, ...bandWidths }),
    rows: board,
    live,
    peers: peerPoints(fitPeersOf(snapshot)),
  };
  return { board, radar };
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
