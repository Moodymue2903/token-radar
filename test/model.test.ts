// The model's boundary checks: the snapshot's shape, the board's own
// consistency rules, and the three cases the board must refuse to rank —
// a live token on the watchlist, a centralised exchange, and a versioned
// pool of another protocol.
//
// Run with: node --test test/*.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MODEL,
  SnapshotError,
  boardIssue,
  buildBoard,
  fitModel,
  fitOdds,
  parseSnapshot,
  type BoardRow,
  type Snapshot,
  type SnapshotProtocol,
} from '../lib/model.ts';

// A snapshot with the given protocols and watchlist.
function snapshotOf(protocols: SnapshotProtocol[], watchlist: string[] = []): Snapshot {
  return {
    as_of: '2026-11-27',
    source: 'test',
    floor_usd: 50_000_000,
    protocols,
    watchlist,
  };
}

// One live-token peer (a fit peer: it records a token, has a market cap
// and a listing date).
function peer(i: number, overrides: Partial<SnapshotProtocol> = {}): SnapshotProtocol {
  return {
    slug: `peer-${i}`,
    name: `Peer ${i}`,
    category: 'Lending',
    chains: ['Ethereum'],
    tvl_usd: 100_000_000 + i * 10_000_000,
    change_7d: 1.5,
    mcap_usd: 200_000_000 + i * 20_000_000,
    listed_at: '2024-01-01',
    gecko_id: `gecko-${i}`,
    symbol: `P${i}`,
    ...overrides,
  };
}

// One pre-token protocol: no market cap, no token id, no symbol.
function preToken(i: number, overrides: Partial<SnapshotProtocol> = {}): SnapshotProtocol {
  return {
    slug: `proto-${i}`,
    name: `Protocol ${i}`,
    category: 'Lending',
    chains: ['Ethereum'],
    tvl_usd: 60_000_000 + i * 1_000_000,
    change_7d: 0.5,
    mcap_usd: null,
    listed_at: null,
    gecko_id: null,
    symbol: null,
    ...overrides,
  };
}

function rawSnapshot(protocols: unknown[], watchlist: unknown = []): string {
  return JSON.stringify({
    as_of: '2026-11-27',
    source: 'test',
    floor_usd: 50_000_000,
    protocols,
    watchlist,
  });
}

test('parseSnapshot accepts a well-formed snapshot', () => {
  const snap = parseSnapshot(rawSnapshot([
    { slug: 'a', name: 'A', tvl_usd: 1_000_000, mcap_usd: null, listed_at: null },
  ], ['a']));
  assert.equal(snap.protocols.length, 1);
  assert.equal(snap.protocols[0]!.slug, 'a');
  assert.deepEqual(snap.watchlist, ['a']);
});

test('parseSnapshot refuses text that is not JSON', () => {
  assert.throws(() => parseSnapshot('not json'), SnapshotError);
});

test('parseSnapshot refuses a document without an as_of date', () => {
  const text = JSON.stringify({ source: 'x', floor_usd: 1, protocols: [], watchlist: [] });
  assert.throws(() => parseSnapshot(text), SnapshotError);
});

test('parseSnapshot refuses an empty slug', () => {
  assert.throws(() => parseSnapshot(rawSnapshot([{ slug: '  ', name: 'A', tvl_usd: 1_000_000 }])), SnapshotError);
});

test('parseSnapshot refuses two protocols with the same slug', () => {
  assert.throws(() => parseSnapshot(rawSnapshot([
    { slug: 'a', name: 'A', tvl_usd: 1_000_000 },
    { slug: 'a', name: 'A again', tvl_usd: 2_000_000 },
  ])), SnapshotError);
});

test('parseSnapshot refuses a zero or negative TVL', () => {
  assert.throws(() => parseSnapshot(rawSnapshot([{ slug: 'a', name: 'A', tvl_usd: 0 }])), SnapshotError);
  assert.throws(() => parseSnapshot(rawSnapshot([{ slug: 'a', name: 'A', tvl_usd: -1 }])), SnapshotError);
});

test('parseSnapshot refuses a TVL outside the safe-integer range', () => {
  assert.throws(() => parseSnapshot(rawSnapshot([{ slug: 'a', name: 'A', tvl_usd: 1e18 }])), SnapshotError);
});

test('parseSnapshot refuses a negative or infinite market cap', () => {
  assert.throws(() => parseSnapshot(rawSnapshot([{ slug: 'a', name: 'A', tvl_usd: 1_000_000, mcap_usd: -1 }])), SnapshotError);
  // 1e999 is written into the text by hand: JSON.stringify turns Infinity
  // into null, which is a different case (a pre-token protocol).
  const infinite = '{"as_of":"2026-11-27","source":"test","floor_usd":50000000,"protocols":[' +
    '{"slug":"a","name":"A","tvl_usd":1000000,"mcap_usd":1e999}],"watchlist":[]}';
  assert.throws(() => parseSnapshot(infinite), SnapshotError);
});

test('parseSnapshot refuses a listing date that does not parse', () => {
  assert.throws(() => parseSnapshot(rawSnapshot([
    { slug: 'a', name: 'A', tvl_usd: 1_000_000, listed_at: 'yesterday' },
  ])), SnapshotError);
});

test('parseSnapshot refuses a watchlist that is not a list of slugs', () => {
  assert.throws(() => parseSnapshot(rawSnapshot([], [42])), SnapshotError);
});

test('parseSnapshot refuses the same watchlist slug twice', () => {
  assert.throws(() => parseSnapshot(rawSnapshot([], ['a', 'a'])), SnapshotError);
});

// A board row that passes every rule boardIssue checks.
function goodRow(slug: string, rank: number, implied: number, isWatchlist: boolean): BoardRow {
  return {
    rank,
    slug,
    name: slug,
    category: 'Lending',
    chains: ['Ethereum'],
    tvl_usd: 100_000_000,
    change_7d: 1,
    mcap_usd: null,
    listed_at: null,
    gecko_id: null,
    symbol: null,
    token_status: 'pre-token',
    age_days: null,
    is_watchlist: isWatchlist,
    implied_value_usd: implied,
    odds: 0.5,
    multiple: 1,
    uncertainty: { p10: implied / 4, p25: implied / 2, p75: implied * 2, p90: implied * 4 },
    mechanism: 'deposit and farm',
    model: {
      cat_mult: 1,
      cat_n: 4,
      cat_median_raw: 100_000_000,
      median_tvl: 100_000_000,
      size_factor: 1,
      growth_pct: 1,
      growth_multiplier: 1,
      maturity_multiplier: 1,
      age_days: null,
      odds: 0.5,
      value_if_launches: implied * 2,
    },
    farm: {
      verdict: 'SKIP',
      pool: 0,
      share: 0,
      gasTotal: 0,
      swapTotal: 0,
      tbillReturn: 11.1,
      tbillPerHour: 0,
      totalCost: 0,
      netEv: 0,
      netEvRatio: 0,
      feesHold: 0,
      capital: 1_000,
      holdDays: 90,
      breakevenOdds: undefined,
      breakevenValue: undefined,
      handsOnMinutes: undefined,
      netPerHour: 0,
    },
    farm_steps: [
      'Deposit $1,000 into the lending pool on Ethereum.',
      'Hold the position and collect the yield every day.',
      'Withdraw the position and the yield at the end.',
    ],
  };
}

test('boardIssue accepts a board that follows every rule', () => {
  const snapshot = snapshotOf([preToken(1)], ['proto-1']);
  const board = [goodRow('proto-1', 1, 1_000_000, true)];
  assert.equal(boardIssue(board, snapshot), null);
});

test('boardIssue names a watchlist slug the snapshot does not carry', () => {
  const snapshot = snapshotOf([preToken(1)], ['proto-1', 'ghost']);
  const board = [goodRow('proto-1', 1, 1_000_000, true)];
  const issue = boardIssue(board, snapshot);
  assert.ok(issue !== null && issue.includes('ghost'), `expected the issue to name ghost, got: ${issue}`);
});

test('boardIssue refuses a board whose ranks are not 1..n', () => {
  const snapshot = snapshotOf([preToken(1), preToken(2)], []);
  const board = [goodRow('proto-1', 2, 2_000_000, false), goodRow('proto-2', 3, 1_000_000, false)];
  assert.ok(boardIssue(board, snapshot) !== null);
});

test('boardIssue refuses a row whose implied value is not finite', () => {
  const snapshot = snapshotOf([preToken(1)], []);
  const row = goodRow('proto-1', 1, 1_000_000, false);
  row.implied_value_usd = Number.NaN;
  assert.ok(boardIssue([row], snapshot) !== null);
});

test('boardIssue refuses a row whose band is out of order', () => {
  const snapshot = snapshotOf([preToken(1)], []);
  const row = goodRow('proto-1', 1, 1_000_000, false);
  row.uncertainty = { p10: 10, p25: 20, p75: 5, p90: 40 };
  assert.ok(boardIssue([row], snapshot) !== null);
});

test('boardIssue refuses a watchlist row that is not pre-token', () => {
  const snapshot = snapshotOf([preToken(1)], []);
  const row = goodRow('proto-1', 1, 1_000_000, false);
  row.mcap_usd = 5_000_000;
  assert.ok(boardIssue([row], snapshot) !== null);
});

test('the board does not rank a live protocol that is on the watchlist', () => {
  const protocols = [peer(1), peer(2), peer(3), peer(4), preToken(1), peer(9)];
  const snapshot = snapshotOf(protocols, ['peer-9', 'proto-1']);
  const fit = fitModel(snapshot.protocols.filter((p) => p.gecko_id !== null && p.listed_at !== null), MODEL);
  const board = buildBoard(snapshot, fit, MODEL, fitOdds(snapshot, MODEL));
  const slugs = board.map((r) => r.slug);
  assert.ok(!slugs.includes('peer-9'), 'a live protocol must not be ranked as a pre-token row');
  assert.ok(slugs.includes('proto-1'), 'a pre-token watchlist protocol must be ranked');
  assert.equal(board.filter((r) => r.is_watchlist).length, 1);
});

test('the board does not rank a centralised exchange', () => {
  const protocols = [peer(1), peer(2), peer(3), peer(4), preToken(1, { category: 'CEX', name: 'Big Exchange' })];
  const snapshot = snapshotOf(protocols, []);
  const fit = fitModel(snapshot.protocols.filter((p) => p.gecko_id !== null && p.listed_at !== null), MODEL);
  const board = buildBoard(snapshot, fit, MODEL, fitOdds(snapshot, MODEL));
  assert.ok(!board.map((r) => r.slug).includes('proto-1'));
});

test('the board does not rank a versioned pool of another protocol', () => {
  const protocols = [peer(1), peer(2), peer(3), peer(4), preToken(1, { name: 'Some Protocol V2' })];
  const snapshot = snapshotOf(protocols, []);
  const fit = fitModel(snapshot.protocols.filter((p) => p.gecko_id !== null && p.listed_at !== null), MODEL);
  const board = buildBoard(snapshot, fit, MODEL, fitOdds(snapshot, MODEL));
  assert.ok(!board.map((r) => r.slug).includes('proto-1'));
});

test('the board ranks the watchlist protocol and marks it', () => {
  const protocols = [peer(1), peer(2), peer(3), peer(4), preToken(1), preToken(2, { tvl_usd: 80_000_000 })];
  const snapshot = snapshotOf(protocols, ['proto-2']);
  const fit = fitModel(snapshot.protocols.filter((p) => p.gecko_id !== null && p.listed_at !== null), MODEL);
  const board = buildBoard(snapshot, fit, MODEL, fitOdds(snapshot, MODEL));
  const row = board.find((r) => r.slug === 'proto-2');
  assert.ok(row !== undefined, 'the watchlist protocol must be on the board');
  assert.equal(row.is_watchlist, true);
  assert.equal(row.token_status, 'pre-token');
});
