// The model's boundary checks: the snapshot's shape, the board's own
// consistency rules, and the three cases the board must refuse to rank —
// a live token on the watchlist, a centralised exchange, and a versioned
// pool of another protocol.
//
// Run with: node --test test/*.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  MODEL,
  SnapshotError,
  boardChecksum,
  boardIssue,
  buildBoard,
  buildRadar,
  fitModel,
  fitOdds,
  parseSnapshot,
  type BoardRow,
  type Snapshot,
  type SnapshotProtocol,
} from '../lib/model.ts';
import { buildDashboard } from '../lib/render.js';

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

test('parseSnapshot reads a negative market cap as missing, and refuses an infinite one', () => {
  const snap = parseSnapshot(rawSnapshot([{ slug: 'a', name: 'A', tvl_usd: 1_000_000, mcap_usd: -1 }]));
  assert.equal(snap.protocols[0]!.mcap_usd, null);
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

// A small snapshot with enough live-token peers for the model to fit.
function radarOf() {
  const protocols = [peer(1), peer(2), peer(3), peer(4), peer(5), preToken(1), preToken(2), preToken(3)];
  return buildRadar(snapshotOf(protocols, ['proto-2'])).radar;
}

// A snapshot whose odds model has both outcomes and overlapping features:
// live-token peers and pre-token protocols, both with listing dates and the
// same size range, so the logistic fits instead of separating the data.
function oddsSnapshot(): Snapshot {
  const protocols: SnapshotProtocol[] = [];
  for (let i = 0; i < 12; i++) {
    protocols.push(peer(i, { listed_at: i % 2 === 0 ? '2022-05-01' : '2024-05-01' }));
    protocols.push(preToken(100 + i, { tvl_usd: 100_000_000 + i * 10_000_000, listed_at: i % 3 === 0 ? '2023-05-01' : null }));
  }
  for (let i = 0; i < 6; i++) {
    protocols.push(peer(50 + i, { listed_at: '2025-06-01' }));
    protocols.push(preToken(200 + i, { tvl_usd: 100_000_000 + i * 10_000_000, listed_at: '2025-06-01' }));
  }
  return snapshotOf(protocols, ['proto-100']);
}

test('an empty split prints n/a, never xNaN or NaN%', () => {
  const radar = radarOf();
  radar.validation.valueTermTable = [{
    terms: 'growth',
    missLoo: null,
    within3Loo: null,
    missWf: null,
    within3Wf: null,
    status: 'tested, not kept',
  }];
  const html = JSON.stringify(buildDashboard(radar));
  assert.ok(!html.includes('xNaN'), 'the rendered dashboard must never carry xNaN');
  // The value term table's own row: the empty split's four cells read n/a.
  const at = html.indexOf('<td>growth</td>');
  assert.ok(at > 0, 'the value term table must carry the emptied term');
  const row = html.slice(at, html.indexOf('</tr>', at));
  assert.ok(!row.includes('NaN'), `the emptied split must not print NaN, got: ${row}`);
  assert.equal((row.match(/n\/a/g) || []).length, 4, 'the emptied split prints n/a in all four cells');
});

test('the peer counts in the copy are read from the data, not written down', () => {
  const radar = radarOf();
  const html = JSON.stringify(buildDashboard(radar));
  assert.ok(!html.includes('the other 94 peers'), 'the leave-one-out peer count must not be a literal');
  assert.ok(!html.includes('Blind n=95'), 'the blind sample size must not be a literal');
  assert.ok(html.includes('the other ' + (radar.validation.peerCount - 1) + ' peers'), 'the copy must name the peer count it measured');
  assert.ok(html.includes('Blind n=' + radar.validation.bands.blindN), 'the copy must name the blind sample size it measured');
});

test('the board checksum is eight hex characters, stable, and changes with a row', () => {
  const radar = buildRadar(oddsSnapshot()).radar;
  assert.match(radar.board_checksum, /^[0-9a-f]{8}$/, 'the checksum must be eight hex characters');
  const again = boardChecksum(radar.rows);
  assert.equal(again, radar.board_checksum, 'the same board must give the same checksum');
  const moved = radar.rows.map((r) => ({ ...r }));
  moved[0] = { ...moved[0]!, implied_value_usd: moved[0]!.implied_value_usd + 1 };
  assert.notEqual(boardChecksum(moved), radar.board_checksum, 'a changed row must change the checksum');
  const html = JSON.stringify(buildDashboard(radar));
  assert.ok(html.includes(radar.board_checksum), 'the accounting strip must carry the checksum');
});

test('the page can rebuild the checksum from the rows it was given', () => {
  const radar = buildRadar(oddsSnapshot()).radar;
  // The page hashes the canonical rows itself; this is the same text.
  const canonical = radar.rows
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((r) => `${r.slug}|${r.rank}|${r.implied_value_usd}|${r.odds}`)
    .join('\n') + '\n';
  assert.equal(createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 8), radar.board_checksum);
});

test('the odds model keeps exactly one term set, and only shippable terms', () => {
  const radar = buildRadar(oddsSnapshot()).radar;
  const kept = radar.odds.termTable.filter((r) => r.status === 'kept');
  assert.equal(kept.length, 1, 'the term table must mark exactly one term set as kept');
  assert.equal(kept[0]!.terms, radar.odds.terms.join(' + '), 'the kept row must be the shipped model');
  assert.ok(!radar.odds.terms.includes('control'), 'the placebo must never ship');
  assert.ok(!radar.odds.terms.includes('family'), 'the benchmark family term must never ship');
  assert.equal(radar.odds.coefs.length, radar.odds.terms.length, 'every kept term needs a coefficient');
  for (const c of radar.odds.coefs) assert.ok(Number.isFinite(c), 'the coefficients must be finite');
  const placebo = radar.odds.termTable.find((r) => r.terms.includes('control'));
  assert.equal(placebo?.status, 'must not help', 'the placebo is marked as such');
});

test('the cover counts the farm rows the page filters on, and repaints them live', () => {
  const radar = buildRadar(oddsSnapshot()).radar;
  const board = buildDashboard(radar).board;
  const evidence = board.evidence;
  // The rows the page calls FARM at the model's settings: the strict FARM
  // rows plus the Board P25-positive (pre-fee) rows, which are a subset of
  // FARM and not a tier of their own.
  const farm = radar.rows.filter((r) => r.farm.verdict === 'FARM' || r.farm.verdict === 'P25-POSITIVE').length;
  assert.ok(evidence.includes('id="evb-farm-count"'), 'the cover tile must carry the farm count the page repaints');
  assert.ok(evidence.includes('id="evb-farm-best"'), 'the cover tile must carry the best farm row');
  assert.ok(evidence.includes('>' + farm + ' FARM<'), 'the cover tile must start at the same farm count the filter bar shows');
  const strict = radar.rows.filter((r) => r.farm.verdict === 'FARM').length;
  if (strict !== farm) {
    assert.ok(!evidence.includes('>' + strict + ' FARM<'), 'the cover must not count the strict FARM rows alone');
  }
});

test('the cover names the value terms short, and keeps the full name in the title', () => {
  const radar = buildRadar(oddsSnapshot()).radar;
  const dash = buildDashboard(radar);
  const evidence = dash.board.evidence;
  const table = radar.validation.valueTermTable;
  assert.ok(table.length > 0, 'the value model must report its term table');
  // The cover is trimmed: the shipped model and three key comparisons. Every
  // row it shows keeps the full term in the cell's title.
  const shown = table.filter((row) => evidence.includes('title="' + row.terms + ' '));
  assert.ok(shown.length > 0, 'the cover must show at least one value term');
  assert.ok(shown.length <= 4, 'the cover must show the shipped model and at most three comparisons');
  for (const row of shown) {
    assert.ok(evidence.includes('title="' + row.terms + ' '), 'the full term must stay in the cell title: ' + row.terms);
  }
  // The cover prints the short name, not the long one: the long strings must
  // not appear as cell text.
  assert.ok(!evidence.includes('>adopted + control: growth of another row<'), 'the long term must not be the cell text');
  assert.ok(evidence.includes('>TVL + cat + placebo<'), 'the short term must be the cell text');
  // The full list of candidates stays on the calibration tab.
  for (const row of table) {
    assert.ok(dash.calibration.includes('>' + row.terms + '<'), 'every candidate must stay on the calibration tab: ' + row.terms);
  }
});

test('the cover shows the shipped model and three key comparisons in each term card', () => {
  const radar = buildRadar(oddsSnapshot()).radar;
  const evidence = buildDashboard(radar).board.evidence;
  // The value card: the shipped model first, then the baseline, the best
  // runner-up and the placebo. The shipped row is the kept one.
  const vt = radar.validation.valueTermTable;
  const kept = vt.find((r) => r.status === 'kept');
  assert.ok(kept !== undefined, 'the value model must keep one term set');
  const shown = vt.filter((r) => evidence.includes('title="' + r.terms + ' '));
  assert.ok(shown.includes(kept!), 'the shipped value model must be on the cover');
  assert.ok(shown.some((r) => r.terms === 'size curve only'), 'the size-curve baseline must be on the cover');
  assert.ok(shown.some((r) => r.terms.indexOf('control') >= 0), 'the placebo must be on the cover');
  // The odds card: the shipped set, the baseline, the best runner-up and the
  // placebo - never the whole ten-candidate table.
  const ot = radar.odds.termTable;
  const keptOdds = ot.find((r) => r.status === 'kept');
  assert.ok(keptOdds !== undefined, 'the odds model must keep one term set');
  const oddsShown = ot.filter((r) => evidence.includes('title="' + (r.terms === 'base rate' ? 'no terms (the base rate)' : r.terms) + '"'));
  assert.ok(oddsShown.length > 0, 'the cover must show at least one odds term');
  assert.ok(oddsShown.length <= 4, 'the odds card must show the shipped set and at most three comparisons');
  assert.ok(oddsShown.includes(keptOdds!), 'the shipped odds model must be on the cover');
  assert.ok(oddsShown.some((r) => r.status === 'must not help'), 'the odds placebo must be on the cover');
  // The cards say how many candidates they leave out, and where the rest are.
  assert.ok(evidence.includes('candidates shown'), 'the card must say how many candidates it shows');
  assert.ok(evidence.includes('every candidate on the calibration tab'), 'the card must point at the calibration tab');
});

test('the ribbon above the table names the top farm calls and the rule', () => {
  const radar = buildRadar(oddsSnapshot()).radar;
  const ribbon = buildDashboard(radar).board.ribbon;
  assert.ok(ribbon.includes('class="tfr"'), 'the board must carry the ribbon');
  const calls = [...ribbon.matchAll(/<a class="tfr-call" data-slug="([^"]+)" href="#\/proto\/[^"]+"/g)];
  const farm = radar.rows.filter((r) => r.farm.verdict === 'FARM' || r.farm.verdict === 'P25-POSITIVE');
  assert.equal(calls.length, Math.min(3, farm.length), 'the ribbon must carry up to three calls');
  if (farm.length > 0) {
    const best = farm.slice().sort((a, b) => (b.farm.netPerHour ?? 0) - (a.farm.netPerHour ?? 0) || a.rank - b.rank)[0];
    assert.ok(best !== undefined, 'the fixture must carry a farm row');
    assert.equal(calls[0]![1], best.slug, 'the first call must be the best farm row by net per hour');
    for (const c of calls) {
      const row = radar.rows.find((r) => r.slug === c[1]);
      assert.ok(row !== undefined, 'a ribbon call must name a board row');
      assert.ok(ribbon.includes('#' + row.rank + ' '), 'the call must carry the row rank');
    }
  }
  // The rule states the model's own gates and the reader's own settings.
  assert.ok(ribbon.includes('Rule: $' + radar.model.referenceCapital.toLocaleString('en-US')), 'the rule must name the deposit');
  assert.ok(ribbon.includes('net ≥ $' + radar.model.farmThreshold), 'the rule must name the net gate');
  assert.ok(ribbon.includes(radar.model.farmRatio + '× cost'), 'the rule must name the cost-ratio gate');
  assert.ok(ribbon.includes('$/h ') && ribbon.includes('hurdle'), 'the rule must name the hourly hurdle');
});

test('the cover adds the protocols up, bucket by bucket', () => {
  const radar = buildRadar(oddsSnapshot()).radar;
  const evidence = buildDashboard(radar).board.evidence;
  const acc = radar.accounting;
  assert.ok(evidence.includes('All protocols:'), 'the cover must itemise the accounting');
  assert.ok(evidence.includes('= ' + acc.total), 'the accounting must add up to the snapshot total');
  const buckets = acc.groups.map((g) => g.count);
  const sum = buckets.reduce((a, b) => a + b, 0);
  assert.equal(sum, acc.total, 'every protocol must be in exactly one bucket');
  const ranked = acc.groups.filter((g) => g.label.startsWith('Ranked')).reduce((a, g) => a + g.count, 0);
  assert.ok(evidence.includes('>' + ranked + ' ranked<'), 'the ranked bucket must be on the cover');
  assert.ok(evidence.includes(' fit<'), 'the fit-peer bucket must be on the cover');
  const cex = acc.groups.find((g) => g.label === 'Pre-token, CEX');
  if (cex !== undefined && cex.count > 0) {
    assert.ok(evidence.includes('>' + cex.count + ' CEX<'), 'the excluded CEX bucket must be on the cover');
  }
});

test('the cover shows the fitted coefficients of both models', () => {
  const radar = buildRadar(oddsSnapshot()).radar;
  const evidence = buildDashboard(radar).board.evidence;
  // The value model: log10(mcap) = a + b·log10(tvl) + the category's offset.
  assert.ok(evidence.includes('β: '), 'the cover must print the fitted coefficients');
  assert.ok(evidence.includes(radar.fit.sizeB.toFixed(2) + '·log10 TVL'), 'the size curve slope must be on the cover');
  assert.ok(evidence.includes('R² ' + radar.fit.sizeR2.toFixed(2)), 'the size curve R² must be on the cover');
  // The odds model: the intercept and every kept term's coefficient.
  const coefs = radar.odds.terms.map((t, i) => radar.odds.coefs![i]!.toFixed(3));
  for (const c of coefs) assert.ok(evidence.includes(c + '·'), 'the odds coefficient must be on the cover: ' + c);
  assert.ok(evidence.includes(Math.abs(radar.odds.intercept).toFixed(3)), 'the odds intercept must be on the cover');
});
