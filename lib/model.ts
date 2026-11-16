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
//                 median 0.214; w = 0 when the category has fewer than 3
//                 live peers, so Risk Curators falls back to global)
//   size_factor = (tvl / median_tvl_of_category) ^ (0.522 - 1), the fitted
//                 size curve anchored to the category's typical size
//   growth      = 1 + clamp(change_7d, -60, 120)/100 * 0.5
//   maturity    = 0.6 + min(age_days, 1095)/1095 * 0.4
//   implied     = max(1, round(tvl * cat_mult * size_factor * growth * maturity))
//
// The fit is recomputed from the snapshot every run (nothing is hardcoded
// except the priors: k = 5, the slope, the growth weight and the maturity
// floor). No protocol name is ever special-cased: the same function scores
// every row. The model is a pricing yardstick, not a price target: its
// leave-one-out error on the 128 live-token peers is a median of x1.89
// (1 + median absolute percentage error), 43.8% within 3x.

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
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2-shrunk';

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs in dollars, and how long it takes. */
export interface FarmStep {
  text: string;
  costUsd: number;
  time: string;
}

/** A row's net-EV verdict and the arithmetic behind it. */
export interface Verdict {
  verdict: 'FARM' | 'THIN' | 'SKIP';
  capital: number;
  pool: number;
  share: number;
  gasTotal: number;
  oppCost: number;
  totalCost: number;
  netEv: number;
  netEvRatio: number;
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
}

/** The validation numbers the methodology panel shows, computed from the snapshot every run. */
export interface Validation {
  peerCount: number;
  loo: LooRow[];
  adoptedMedian: number;
  adoptedMedianMaxRatio: number;
  adoptedWithin2: number;
  adoptedWithin3: number;
  adoptedLogRmse: number;
  adoptedSpearman: number;
  timeSplitMedian: number | null;
  timeSplitN: number;
  blindMedian: number | null;
  blindWithin2: number | null;
  blindN: number;
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
 * Fit the model on a peer list: winsor bounds, the global median, one
 * shrunk multiple per category, and the log-log size curve. Pure: the same
 * peers always give the same fit.
 */
export function fitModel(peers: SnapshotProtocol[], model: ModelConstants = MODEL): FittedModel {
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
  const fit = ols(xs, ys);
  return {
    peerCount: peers.length,
    winsorLo: lo,
    winsorHi: hi,
    globalMedian,
    globalMedianTvl,
    categories,
    sizeA: fit.a,
    sizeB: fit.b,
    sizeR2: fit.r2,
    sizeSeB: fit.seB,
    residualSd: fit.residSd,
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
    },
    {
      text: action.replace(/\.$/, ''),
      costUsd: 2 * gas,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week for 12 weeks on ${chain}, such as a deposit, a borrow, a swap or a vote`,
      costUsd: 12 * gas,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot; the $${capital} stays in the position`,
      costUsd: opp,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open ${p.name}'s own page and claim only from a link it publishes; never pay to claim`,
      costUsd: 1 * gas,
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it`,
      costUsd: 0,
      time: '5 minutes',
    },
  ];
  if (multiChain) {
    const secondChain = p.chains[1]!;
    const gas2 = gasPerTx(secondChain);
    steps.push({
      text: `Repeat the main action with $${secondCapital} on ${secondChain} so the position is visible on 2 chains`,
      costUsd: 2 * gas2,
      time: '15 minutes',
    });
  }
  return steps;
}

/**
 * The net-EV verdict: a visible subtraction, not a threshold on value.
 * pool is the hypothetical airdrop pool (8% of implied value, a stated
 * assumption); share is the farmer's slice of it, diluted by TVL; cost is
 * the steps' gas plus the opportunity cost of the capital. FARM needs a
 * net EV of at least $75 and at least 1.5x the cost; THIN needs a net EV
 * of at least $0; anything else is SKIP.
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
  return { verdict, capital, pool, share, gasTotal, oppCost: opp, totalCost, netEv, netEvRatio: ratio };
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

/**
 * The full validation suite, computed from the snapshot every run so the
 * dashboard's methodology panel shows measured numbers, never hardcoded
 * ones: the LOO comparison table, the time-split, the blind 80/20 x5, the
 * watchlist coherence audit and the chain-residual finding.
 */
export function validateModel(snapshot: Snapshot, fit: FittedModel, model: ModelConstants = MODEL): Validation {
  const peers = peersOf(snapshot);
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
  const loo: LooRow[] = [
    { model: 'flat 0.25x (starter)', median: round4(mFlat.median1p), medianMaxRatio: round4(mFlat.medianMax), within2: round4(mFlat.within2), within3: round4(mFlat.within3) },
    { model: 'global median 0.214x', median: round4(mGlobal.median1p), medianMaxRatio: round4(mGlobal.medianMax), within2: round4(mGlobal.within2), within3: round4(mGlobal.within3) },
    { model: 'size curve only', median: round4(mSize.median1p), medianMaxRatio: round4(mSize.medianMax), within2: round4(mSize.within2), within3: round4(mSize.within3) },
    { model: 'shrunk s=0.5 (damped)', median: round4(mDamped.median1p), medianMaxRatio: round4(mDamped.medianMax), within2: round4(mDamped.within2), within3: round4(mDamped.within3) },
    { model: 'shrunk s=1.0 (adopted)', median: round4(mAdopted.median1p), medianMaxRatio: round4(mAdopted.medianMax), within2: round4(mAdopted.within2), within3: round4(mAdopted.within3) },
  ];
  // Time-split: fit on listed before 2025-01-01, test on listed after.
  const trainTs = peers.filter((p) => p.listed_at !== null && p.listed_at < '2025-01-01');
  const testTs = peers.filter((p) => p.listed_at !== null && p.listed_at >= '2025-01-01');
  let timeSplitMedian: number | null = null;
  if (trainTs.length > 0 && testTs.length > 0) {
    const fTs = fitModel(trainTs, model);
    const mTs = looMetrics(
      testTs.map((p) => noGm(p, fTs)),
      testTs.map((p) => p.mcap_usd!),
    );
    timeSplitMedian = round4(mTs.median1p);
  }
  // Blind 80/20 x5, fixed seeds.
  const seeds = [11, 23, 37, 41, 53];
  const blindMedians: number[] = [];
  const blindWithin2: number[] = [];
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
    blindWithin2.push(m.within2);
  }
  const blindMedian = blindMedians.length > 0 ? round4(blindMedians.reduce((s, x) => s + x, 0) / blindMedians.length) : null;
  const blindWithin2Avg = blindWithin2.length > 0 ? round4(blindWithin2.reduce((s, x) => s + x, 0) / blindWithin2.length) : null;
  // Watchlist coherence: Spearman between TVL and implied value over the 40 watchlist rows.
  const board = buildBoard(snapshot, fit, model);
  const watchRows = board.filter((r) => r.is_watchlist);
  const coherence = round4(spearman(watchRows.map((r) => r.tvl_usd), watchRows.map((r) => r.implied_value_usd)));
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
    adoptedWithin2: round4(mAdopted.within2),
    adoptedWithin3: round4(mAdopted.within3),
    adoptedLogRmse: round4(mAdopted.logRmse),
    adoptedSpearman: round4(mAdopted.spearman),
    timeSplitMedian,
    timeSplitN: testTs.length,
    blindMedian,
    blindWithin2: blindWithin2Avg,
    blindN: holdN,
    coherence,
    chainEthDex: chainResid('ethereum'),
    chainSolDex: chainResid('solana'),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const fit = fitModel(peersOf(snapshot), model);
  const board = buildBoard(snapshot, fit, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.is_watchlist).length;
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
    validation: validateModel(snapshot, fit, model),
    rows: board,
    live,
    peers: peerPoints(peersOf(snapshot)),
  };
  return { board, radar };
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
