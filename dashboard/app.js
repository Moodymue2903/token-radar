// Token Radar's plain dashboard. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table,
// a per-protocol detail view with the model's own inputs and the protocol's
// farm plan, a live-token view and the methodology panel. No network: every
// byte it shows is in data.js.
//
// The page recomputes the model from the snapshot figures (impliedOf) and
// regenerates the farm plans (farmStepsFor) with the same functions main.ts
// runs, and checks both against the board's data. A mismatch shows a
// warning: the screenshots and the code must agree.

(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var MODEL = DATA.model;
  var FIT = DATA.fit;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', verdict: 'all', minImp: '', sort: 'implied', dir: -1, tab: 'board', selected: null };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtUsd2(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + n.toFixed(2);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(m) {
    return m.toFixed(3) + 'x';
  }
  function fmtBand(r) {
    if (!r.uncertainty) return 'n/a';
    return fmtUsd(r.uncertainty.p10) + ' \u2013 ' + fmtUsd(r.uncertainty.p90);
  }
  function fmtBand50(r) {
    if (!r.uncertainty || r.uncertainty.p25 === null || r.uncertainty.p25 === undefined || r.uncertainty.p75 === null || r.uncertainty.p75 === undefined) return 'n/a';
    return fmtUsd(r.uncertainty.p25) + ' \u2013 ' + fmtUsd(r.uncertainty.p75);
  }
  function fmtOdds(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return Math.round(n * 100) + '%';
  }
  function fmtPerHour(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return fmtUsd2(n) + '/h';
  }
  // Fit-peer accounting: the fit peers sit inside a wider live-token
  // universe; the rest are set aside because they record no listing date.
  // Every field here is optional, so an older data file degrades to the
  // peer count alone instead of throwing.
  function fitUniverse() {
    return (FIT.peerUniverse === null || FIT.peerUniverse === undefined) ? null : FIT.peerUniverse;
  }
  function setAsideCount() {
    if (FIT.excludedNullListedAt !== null && FIT.excludedNullListedAt !== undefined) return FIT.excludedNullListedAt;
    var u = fitUniverse();
    if (u !== null && FIT.peerCount !== null && FIT.peerCount !== undefined && u > FIT.peerCount) return u - FIT.peerCount;
    return null;
  }
  function verdictCounts() {
    var c = { ROBUST: 0, FARM: 0, THIN: 0, SKIP: 0 };
    DATA.rows.forEach(function (r) { if (c[r.farm.verdict] !== undefined) c[r.farm.verdict]++; });
    return c;
  }
  // Best return on the farmer's time: highest net $/hour among the rows
  // that clear FARM or ROBUST. Null when the data file carries no $/hour.
  function bestPerHour() {
    var best = null;
    DATA.rows.forEach(function (r) {
      if ((r.farm.verdict !== 'FARM' && r.farm.verdict !== 'ROBUST') || r.farm.netPerHour === null || r.farm.netPerHour === undefined || !isFinite(r.farm.netPerHour)) return;
      if (best === null || r.farm.netPerHour > best.farm.netPerHour) best = r;
    });
    return best;
  }
  // Median width of the board's 50% band (p75/p25), one honest number for
  // how wide the middle half of the board's uncertainty is.
  function medianBand50Width() {
    var ws = [];
    DATA.rows.forEach(function (r) {
      if (r.uncertainty && r.uncertainty.p25 > 0 && r.uncertainty.p75 > 0) ws.push(r.uncertainty.p75 / r.uncertainty.p25);
    });
    if (ws.length === 0) return null;
    ws.sort(function (a, b) { return a - b; });
    return ws[Math.floor(ws.length / 2)];
  }
  // The flat-baseline row of the leave-one-out table (global median multiple):
  // the LOO flat comparator, so the header and the validation table read it
  // from the measured validation object, never from a hardcoded number.
  function looFlatRow() {
    var rows = DATA.validation.loo;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].model.indexOf('global median') >= 0) return rows[i];
    }
    return null;
  }
  // Format a measured number for the validation table: 'n/a' when the
  // validation object carries null, else prefix + fixed decimals + suffix.
  function fnum(x, pre, d, suf) { return x === null || x === undefined ? 'n/a' : pre + x.toFixed(d) + suf; }

  // ---- the model, recomputed in the page from the same arithmetic main.ts runs ----
  function catOf(category) {
    for (var i = 0; i < FIT.categories.length; i++) {
      if (FIT.categories[i].category === category) return FIT.categories[i];
    }
    return null;
  }
  function breakdownOf(row) {
    var cat = catOf(row.category);
    var mult, medTvl, n, rawMed;
    if (!cat || cat.n < MODEL.minPeers) {
      mult = FIT.globalMedian;
      medTvl = FIT.globalMedianTvl;
      n = cat ? cat.n : 0;
      rawMed = cat ? cat.median : FIT.globalMedian;
    } else {
      var w = cat.n / (cat.n + MODEL.shrinkK);
      mult = w * cat.median + (1 - w) * FIT.globalMedian;
      medTvl = cat.medianTvl;
      n = cat.n;
      rawMed = cat.median;
    }
    var sizeF = Math.pow(row.tvl_usd / medTvl, FIT.sizeB - 1);
    var growth = Math.min(MODEL.growthCap, Math.max(MODEL.growthFloor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * MODEL.growthWeight;
    var age = row.age_days === null || row.age_days === undefined ? MODEL.unknownAgeDays : row.age_days;
    var mat = MODEL.maturityFloor + (Math.min(Math.max(age, 0), MODEL.maturityDays) / MODEL.maturityDays) * MODEL.maturityRange;
    var raw = Math.max(1, row.tvl_usd * mult * sizeF * growthMult * mat);
    return { mult: mult, n: n, rawMed: rawMed, medTvl: medTvl, sizeF: sizeF, growth: growth, growthMult: growthMult, mat: mat, age: row.age_days, raw: raw, implied: Math.max(1, Math.round(raw)) };
  }
  function impliedOf(row) {
    var v = breakdownOf(row).implied;
    return row.rank <= 10 ? Math.round(v * MODEL.topScalar) : v;
  }

  // ---- the farm plan, regenerated in the page from the same generator main.ts runs ----
  var L2 = {};
  ['arbitrum', 'optimism', 'base', 'ink', 'monad', 'zksync', 'zksync era', 'scroll', 'linea', 'blast', 'mode', 'manta', 'manta pacific', 'starknet', 'polygon zkevm', 'zora', 'fraxtal', 'lisk', 'soneium', 'unichain', 'world chain', 'abstract', 'apechain', 'bob', 'hemi', 'fuel', 'movement', 'superseed', 'swellchain', 'tac', 'xai', 'gravity'].forEach(function (c) { L2[c] = 1; });
  var BTC = {};
  ['bitcoin', 'bsquared', 'b2', 'mezo', 'merlin', 'bitlayer', 'rootstock', 'stacks', 'core', 'bob', 'bison', 'citrea', 'fractal', 'hemi'].forEach(function (c) { BTC[c] = 1; });
  function gasPerTx(chain) {
    var c = (chain || '').trim().toLowerCase();
    if (c === '') return 2.0;
    if (c === 'ethereum') return 4.0;
    if (L2[c]) return 0.3;
    if (BTC[c]) return 2.0;
    return 0.05;
  }
  function primaryChain(p) {
    return p.chains && p.chains.length > 0 ? p.chains[0] : '';
  }
  function capitalFor(p) {
    return primaryChain(p).trim().toLowerCase() === 'ethereum' ? MODEL.ethCapital : MODEL.referenceCapital;
  }
  function oppCost(capital) {
    return (capital * MODEL.oppRate * MODEL.holdDays) / 365;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 60;
    return 90;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('risk curator') >= 0 || c.indexOf('curator') >= 0) return 'Deposit $' + capital + " into " + name + "'s curated vault on " + chain + ' and keep the shares; the curators allocate it across their strategies.';
    if (c.indexOf('onchain capital allocator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' allocation vault on ' + chain + ' and hold the receipt token.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('real world') >= 0) return 'Mint $' + capital + ' of the yield-bearing asset through ' + name + ' on ' + chain + ' and hold it; the yield accrues on-chain.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('basis trading') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' and use ' + name + "'s app on it.";
    if (c.indexOf('payment') >= 0) return 'Pay $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('governance') >= 0) return 'Deposit $' + capital + ' into ' + name + ' on ' + chain + ' and vote with the position.';
    if (c.indexOf('cedefi') >= 0 || c.indexOf('cefi') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: $' + step.costUsd.toFixed(2) + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
    return s;
  }
  function farmStepsFor(p, age) {
    var chain = primaryChain(p) === '' ? 'its main chain' : primaryChain(p);
    var gas = gasPerTx(primaryChain(p));
    var capital = capitalFor(p);
    var hold = holdDaysFor(age);
    var opp = oppCost(capital);
    var multiChain = p.chains.length >= 3;
    var mainCapital = multiChain ? Math.round(capital * 0.6) : capital;
    var secondCapital = capital - mainCapital;
    var action = actionFor(p, mainCapital, chain);
    var steps = [
      { text: 'Use a fresh wallet that holds only the $' + capital + ' you plan to farm, and keep its seed phrase offline', costUsd: 1 * gas, time: '5 minutes' },
      { text: action.replace(/\.$/, ''), costUsd: 2 * gas, time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week for 12 weeks on ' + chain + ', such as a deposit, a borrow, a swap or a vote', costUsd: 12 * gas, time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot; the $' + capital + ' stays in the position', costUsd: opp, time: hold + ' days' },
      { text: 'Before you withdraw, open ' + p.name + "'s own page and claim only from a link it publishes; never pay to claim", costUsd: 1 * gas, time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction hash in a farm log so you can repeat the position or unwind it', costUsd: 0, time: '5 minutes' },
    ];
    if (multiChain) {
      var secondChain = p.chains[1];
      var gas2 = gasPerTx(secondChain);
      steps.push({ text: 'Repeat the main action with $' + secondCapital + ' on ' + secondChain + ' so the position is visible on 2 chains', costUsd: 2 * gas2, time: '15 minutes' });
    }
    return steps;
  }

  // ---- self-checks: the page's arithmetic must match the board's data ----
  var recomputeBad = 0;
  var farmBad = 0;
  DATA.rows.forEach(function (r) {
    if (impliedOf(r) !== r.implied_value_usd) recomputeBad++;
    var gen = farmStepsFor(r, r.age_days).map(stepText);
    if (gen.length !== r.farm_steps.length) { farmBad++; return; }
    for (var i = 0; i < gen.length; i++) {
      if (gen[i] !== r.farm_steps[i]) { farmBad++; break; }
    }
  });
  window.__CHECKS__ = { recomputeMismatches: recomputeBad, farmMismatches: farmBad, rows: DATA.rows.length };

  // ---- SVG charts ----
  function fmtAxisDollar(e) {
    var v = Math.pow(10, e);
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(0) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
    return '$' + v.toFixed(0);
  }
  function svgOpen(w, h) {
    // Inline SVG in an HTML document: the parser assigns the SVG namespace,
    // so no xmlns attribute is needed (and none may appear, so the dashboard
    // carries no http(s) string at all).
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img">';
  }
  function logTicks(lo, hi) {
    var ticks = [];
    for (var e = Math.ceil(lo); e <= Math.floor(hi); e++) ticks.push(e);
    return ticks;
  }
  // Comps chart: the fit peers, the fitted size curve, and the protocol's point.
  function compsChart(row) {
    var W = 560, H = 300, L = 52, R = 14, T = 12, B = 52;
    var xs = DATA.peers.map(function (p) { return Math.log10(p.tvl_usd); });
    var ys = DATA.peers.map(function (p) { return Math.log10(p.mcap_usd); });
    var px = Math.log10(row.tvl_usd);
    var py = Math.log10(row.implied_value_usd);
    var xlo = Math.min.apply(null, xs.concat([px])) - 0.15;
    var xhi = Math.max.apply(null, xs.concat([px])) + 0.15;
    var ylo = Math.min.apply(null, ys.concat([py])) - 0.15;
    var yhi = Math.max.apply(null, ys.concat([py])) + 0.15;
    var X = function (v) { return L + ((v - xlo) / (xhi - xlo)) * (W - L - R); };
    var Y = function (v) { return T + (1 - (v - ylo) / (yhi - ylo)) * (H - T - B); };
    var s = svgOpen(W, H);
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#14171d"/>';
    logTicks(xlo, xhi).forEach(function (e) {
      var x = X(e);
      s += '<line x1="' + x.toFixed(1) + '" y1="' + T + '" x2="' + x.toFixed(1) + '" y2="' + (H - B) + '" stroke="#262b34"/>';
      s += '<text x="' + x.toFixed(1) + '" y="' + (H - 30) + '" fill="#9a978c" font-size="10" text-anchor="middle">' + fmtAxisDollar(e) + '</text>';
    });
    logTicks(ylo, yhi).forEach(function (e) {
      var y = Y(e);
      s += '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) + '" stroke="#262b34"/>';
      s += '<text x="' + (L - 6) + '" y="' + (y + 3).toFixed(1) + '" fill="#9a978c" font-size="10" text-anchor="end">' + fmtAxisDollar(e) + '</text>';
    });
    var line = '';
    for (var gx = xlo; gx <= xhi; gx += (xhi - xlo) / 40) {
      var gy = FIT.sizeA + FIT.sizeB * gx;
      line += (line === '' ? 'M' : 'L') + X(gx).toFixed(1) + ',' + Y(gy).toFixed(1);
    }
    s += '<path d="' + line + '" fill="none" stroke="#e8c478" stroke-width="2"/>';
    DATA.peers.forEach(function (p) {
      s += '<circle cx="' + X(Math.log10(p.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(p.mcap_usd)).toFixed(1) + '" r="2.4" fill="#7aa7c9" opacity="0.65"/>';
    });
    s += '<circle cx="' + X(px).toFixed(1) + '" cy="' + Y(py).toFixed(1) + '" r="6" fill="#e8c478" stroke="#0c0e12" stroke-width="2"/>';
    var lab = esc(row.name) + ' ' + fmtUsd(row.implied_value_usd);
    var labX = X(px);
    if (labX + 190 > W - 8) {
      s += '<text x="' + (labX - 10).toFixed(1) + '" y="' + Math.max(Y(py) - 8, T + 10).toFixed(1) + '" fill="#e8c478" font-size="11" font-weight="bold" text-anchor="end">' + lab + '</text>';
    } else {
      s += '<text x="' + (labX + 10).toFixed(1) + '" y="' + Math.max(Y(py) - 8, T + 10).toFixed(1) + '" fill="#e8c478" font-size="11" font-weight="bold">' + lab + '</text>';
    }
    s += '<text x="' + L + '" y="' + (H - 8) + '" fill="#6f6d66" font-size="10">TVL (log) vs market cap (log). Line: fitted size curve log10(mcap) = ' + FIT.sizeA.toFixed(3) + ' + ' + FIT.sizeB.toFixed(3) + ' x log10(TVL).</text>';
    s += '</svg>';
    return s;
  }
  // Bubble market map: x = ln TVL, y = implied multiple (log), r = implied value, colour = verdict.
  function bubbleMap(rows) {
    var W = 1100, H = 300, L = 52, R = 16, T = 14, B = 52;
    var xs = rows.map(function (r) { return Math.log(r.tvl_usd); });
    var ys = rows.map(function (r) { return Math.log10(Math.max(r.multiple, 0.001)); });
    var xlo = Math.min.apply(null, xs) - 0.2;
    var xhi = Math.max.apply(null, xs) + 0.2;
    var ylo = Math.min.apply(null, ys) - 0.15;
    var yhi = Math.max.apply(null, ys) + 0.15;
    var X = function (v) { return L + ((v - xlo) / (xhi - xlo)) * (W - L - R); };
    var Y = function (v) { return T + (1 - (v - ylo) / (yhi - ylo)) * (H - T - B); };
    var maxImp = Math.max.apply(null, rows.map(function (r) { return r.implied_value_usd; }));
    var col = { ROBUST: '#2fd6a3', FARM: '#4caf7d', THIN: '#d9a441', SKIP: '#6b6f76' };
    var s = svgOpen(W, H);
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#14171d"/>';
    logTicks(Math.log10(5e6), Math.log10(5e9)).forEach(function (e) {
      var v = Math.log(Math.pow(10, e));
      if (v < xlo || v > xhi) return;
      s += '<text x="' + X(v).toFixed(1) + '" y="' + (H - 30) + '" fill="#9a978c" font-size="10" text-anchor="middle">' + fmtAxisDollar(e) + ' TVL</text>';
    });
    [-2, -1, 0].forEach(function (e) {
      var y = Y(e);
      s += '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) + '" stroke="#262b34"/>';
      s += '<text x="' + (L - 6) + '" y="' + (y + 3).toFixed(1) + '" fill="#9a978c" font-size="10" text-anchor="end">' + Math.pow(10, e).toFixed(e === 0 ? 0 : 2) + 'x</text>';
    });
    rows.forEach(function (r) {
      var rad = 3 + 11 * Math.sqrt(r.implied_value_usd / maxImp);
      s += '<circle cx="' + X(Math.log(r.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(Math.max(r.multiple, 0.001))).toFixed(1) + '" r="' + rad.toFixed(1) + '" fill="' + (col[r.farm.verdict] || '#6b6f76') + '" opacity="0.75"/>';
    });
    s += '<text x="' + L + '" y="' + (H - 8) + '" fill="#6f6d66" font-size="10">Each bubble is a protocol: x = TVL, y = implied multiple, size = implied value, colour = verdict. The radar, at a glance.</text>';
    s += '</svg>';
    return s;
  }
  // Calibration chart: fitted values vs actuals for the fit peers, with a +/-2x band.
  function calibrationChart() {
    var W = 560, H = 300, L = 52, R = 14, T = 12, B = 34;
    var pts = DATA.peers.map(function (p) {
      var pred = impliedOf({ tvl_usd: p.tvl_usd, category: p.category, change_7d: null, age_days: null });
      return { a: Math.log10(p.mcap_usd), p: Math.log10(pred) };
    });
    var all = pts.reduce(function (acc, q) { return acc.concat([q.a, q.p]); }, []);
    var lo = Math.min.apply(null, all) - 0.15;
    var hi = Math.max.apply(null, all) + 0.15;
    var X = function (v) { return L + ((v - lo) / (hi - lo)) * (W - L - R); };
    var Y = function (v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); };
    var s = svgOpen(W, H);
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#14171d"/>';
    var band = 'M' + X(lo).toFixed(1) + ',' + Y(lo + Math.log10(2)).toFixed(1) + 'L' + X(hi).toFixed(1) + ',' + Y(hi + Math.log10(2)).toFixed(1) + 'L' + X(hi).toFixed(1) + ',' + Y(hi - Math.log10(2)).toFixed(1) + 'L' + X(lo).toFixed(1) + ',' + Y(lo - Math.log10(2)).toFixed(1) + 'Z';
    s += '<path d="' + band + '" fill="#7aa7c9" opacity="0.12"/>';
    s += '<line x1="' + X(lo).toFixed(1) + '" y1="' + Y(lo).toFixed(1) + '" x2="' + X(hi).toFixed(1) + '" y2="' + Y(hi).toFixed(1) + '" stroke="#e8c478" stroke-width="1.5"/>';
    pts.forEach(function (q) {
      s += '<circle cx="' + X(q.a).toFixed(1) + '" cy="' + Y(q.p).toFixed(1) + '" r="2.4" fill="#7aa7c9" opacity="0.65"/>';
    });
    s += '<text x="' + L + '" y="' + (H - 22) + '" fill="#6f6d66" font-size="10">Fitted vs actual market cap, log-log, for the ' + FIT.peerCount + ' peers. Band: +/-2x. In-sample fit; the LOO numbers above are the honest out-of-sample test.</text>';
    s += '</svg>';
    return s;
  }

  // Value-against-the-yardstick scatter: the fit peers, TVL (log) against
  // actual market cap / implied value (log). The fitted line is ratio 1,
  // because the implied value already carries the size curve; the shaded
  // band is the middle half of the leave-one-out actual/implied ratios.
  // Implied values are recomputed in-page with no growth and no maturity,
  // the same way the calibration chart computes them.
  function ratioScatter() {
    var v = DATA.validation;
    var pts = DATA.peers.map(function (p) {
      var imp = impliedOf({ tvl_usd: p.tvl_usd, category: p.category, change_7d: null, age_days: null });
      return { x: Math.log10(p.tvl_usd), y: Math.log10(p.mcap_usd / imp) };
    });
    if (pts.length === 0) return '';
    var W = 1100, H = 320, L = 64, R = 16, T = 14, B = 52;
    var xs = pts.map(function (q) { return q.x; });
    var ys = pts.map(function (q) { return q.y; });
    var xlo = Math.min.apply(null, xs) - 0.15;
    var xhi = Math.max.apply(null, xs) + 0.15;
    var ylo = Math.min.apply(null, ys) - 0.15;
    var yhi = Math.max.apply(null, ys) + 0.15;
    var hasBand = v.looBandRatioLo !== null && v.looBandRatioLo !== undefined && v.looBandRatioHi !== null && v.looBandRatioHi !== undefined && v.looBandRatioLo > 0 && v.looBandRatioHi > 0;
    if (hasBand) {
      ylo = Math.min(ylo, Math.log10(v.looBandRatioLo) - 0.05);
      yhi = Math.max(yhi, Math.log10(v.looBandRatioHi) + 0.05);
    }
    ylo = Math.min(ylo, -0.05);
    yhi = Math.max(yhi, 0.05);
    var X = function (val) { return L + ((val - xlo) / (xhi - xlo)) * (W - L - R); };
    var Y = function (val) { return T + (1 - (val - ylo) / (yhi - ylo)) * (H - T - B); };
    var s = svgOpen(W, H);
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#14171d"/>';
    if (hasBand) {
      s += '<rect x="' + L + '" y="' + Y(Math.log10(v.looBandRatioHi)).toFixed(1) + '" width="' + (W - L - R) + '" height="' + (Y(Math.log10(v.looBandRatioLo)) - Y(Math.log10(v.looBandRatioHi))).toFixed(1) + '" fill="#7aa7c9" opacity="0.12"/>';
    }
    logTicks(xlo, xhi).forEach(function (e) {
      var x = X(e);
      s += '<line x1="' + x.toFixed(1) + '" y1="' + T + '" x2="' + x.toFixed(1) + '" y2="' + (H - B) + '" stroke="#262b34"/>';
      s += '<text x="' + x.toFixed(1) + '" y="' + (H - 30) + '" fill="#9a978c" font-size="10" text-anchor="middle">' + fmtAxisDollar(e) + ' TVL</text>';
    });
    logTicks(ylo, yhi).forEach(function (e) {
      var y = Y(e);
      var lab = Math.pow(10, e);
      var lt = lab >= 1 ? lab.toFixed(0) + 'x' : lab.toFixed(2) + 'x';
      s += '<line x1="' + L + '" y1="' + y.toFixed(1) + '" x2="' + (W - R) + '" y2="' + y.toFixed(1) + '" stroke="#262b34"/>';
      s += '<text x="' + (L - 6) + '" y="' + (y + 3).toFixed(1) + '" fill="#9a978c" font-size="10" text-anchor="end">' + lt + '</text>';
    });
    s += '<line x1="' + L + '" y1="' + Y(0).toFixed(1) + '" x2="' + (W - R) + '" y2="' + Y(0).toFixed(1) + '" stroke="#e8c478" stroke-width="1.5" stroke-dasharray="5,4"/>';
    pts.forEach(function (q) {
      s += '<circle cx="' + X(q.x).toFixed(1) + '" cy="' + Y(q.y).toFixed(1) + '" r="3" fill="#7aa7c9" opacity="0.7"/>';
    });
    s += '<text x="' + L + '" y="' + (H - 8) + '" fill="#6f6d66" font-size="10">Each dot is one of the ' + DATA.peers.length + ' fit peers: x = TVL, y = actual market cap / implied value. Dashed line: ratio 1, the market agreeing with the yardstick.' + (hasBand ? ' Shaded band: the middle half of leave-one-out ratios, ' + v.looBandRatioLo.toFixed(2) + 'x\u2013' + v.looBandRatioHi.toFixed(2) + 'x.' : ' No leave-one-out band in this data file, so no shading is drawn.') + '</text>';
    s += '</svg>';
    return s;
  }

  // ---- views ----
  function verdictBadge(v) {
    return '<span class="badge ' + v + '">' + v + '</span>';
  }
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var minImp = state.minImp === '' ? 0 : parseFloat(state.minImp) * 1e6;
    var rows = DATA.rows.filter(function (r) {
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      if (state.category !== 'all' && (r.category || '') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains[0] || '') !== state.chain) return false;
      if (state.verdict !== 'all' && r.farm.verdict !== state.verdict) return false;
      if (minImp > 0 && r.implied_value_usd < minImp) return false;
      return true;
    });
    var dir = state.dir;
    var key = state.sort;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -999 : a.change_7d; bv = b.change_7d === null ? -999 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? 99999 : a.age_days; bv = b.age_days === null ? 99999 : b.age_days; }
      else if (key === 'breakeven') { av = (a.farm.breakevenOdds === null || a.farm.breakevenOdds === undefined) ? -1 : a.farm.breakevenOdds; bv = (b.farm.breakevenOdds === null || b.farm.breakevenOdds === undefined) ? -1 : b.farm.breakevenOdds; }
      else if (key === 'perhour') { av = (a.farm.netPerHour === null || a.farm.netPerHour === undefined) ? -1e18 : a.farm.netPerHour; bv = (b.farm.netPerHour === null || b.farm.netPerHour === undefined) ? -1e18 : b.farm.netPerHour; }
      else { av = a.rank; bv = b.rank; }
      return (av - bv) * dir || (a.slug < b.slug ? -1 : 1);
    });
    return rows;
  }
  // The fitted formula, in one readable box, with the honest out-of-sample
  // numbers beside it. Every number is read from DATA, never hardcoded.
  function formulaBoxHtml() {
    var v = DATA.validation;
    var flat = looFlatRow();
    var looN = (v.peerCount !== null && v.peerCount !== undefined) ? v.peerCount : FIT.peerCount;
    var h = '<div class="panel formulabox"><h2>The yardstick, in one line</h2>' +
      '<div class="bigformula">log<sub>10</sub>(value) = ' + FIT.sizeA.toFixed(3) + ' + ' + FIT.sizeB.toFixed(3) + ' &times; log<sub>10</sub>(TVL)</div>' +
      '<p>That is the fitted size curve: every implied value on this board starts from a protocol\u2019s TVL run through this line, then adjusted by its category multiple, 7-day growth and maturity. The curve is fitted on ' + FIT.peerCount + ' live-token peers' + (setAsideCount() === null ? '' : ' (the wider live-token set is ' + fitUniverse() + '; ' + setAsideCount() + ' are set aside because they record no listing date)') + '.</p>' +
      '<p>Out of sample, leave-one-out: <b>' + fnum(v.adoptedWithin3, '', 1, '%') + ' within 3x (n=' + looN + ')</b>, median miss x' + fnum(v.adoptedMedian, '', 2, '') + ', Spearman ' + fnum(v.adoptedSpearman, '', 3, '') + '. The flat baseline on the same peers manages ' + (flat ? fnum(flat.within3, '', 1, '%') + ' within 3x' : 'n/a') + ' and a median miss of x' + (flat ? fnum(flat.median, '', 2, '') : 'n/a') + '.</p></div>';
    return h;
  }
  // Best return on the farmer's time: the highest net $/hour among the rows
  // that clear FARM or ROBUST. Hidden entirely when the data file carries
  // no $/hour figures.
  function bestHourHtml() {
    var best = bestPerHour();
    if (!best) return '';
    var mins = (best.farm.handsOnMinutes !== null && best.farm.handsOnMinutes !== undefined) ? ' for about ' + best.farm.handsOnMinutes + ' minutes of hands-on time' : '';
    return '<div class="panel callout"><h2>Best return on your time</h2>' +
      '<p><b>' + esc(best.name) + '</b> ' + verdictBadge(best.farm.verdict) + ' &middot; <span class="bignum">' + fmtPerHour(best.farm.netPerHour) + '</span> net per hands-on hour' + mins + '. ' +
      'That is the highest net expected value per hour among the rows that clear FARM or ROBUST \u2014 the same farm arithmetic as every other row, divided by the time the plan asks you to spend. A big implied value that takes hours to chase can be worth less than a small one that takes minutes.</p></div>';
  }
  // Verdict counts and the 50% band, across the whole board (not the
  // filtered view, so a search never rewrites them).
  function boardSummaryHtml() {
    var c = verdictCounts();
    var w = medianBand50Width();
    var v = DATA.validation;
    var h = '<div class="panel bandstrip"><p><b>Verdicts:</b> ROBUST ' + c.ROBUST + ' &middot; FARM ' + c.FARM + ' &middot; THIN ' + c.THIN + ' &middot; SKIP ' + c.SKIP + '.</p>';
    if (w !== null) h += '<p><b>The middle half:</b> across the board, the 50% band (p25\u2013p75) spans a median of ' + w.toFixed(1) + 'x from low end to high end \u2014 half of each row\u2019s plausible value sits inside that range, and half sits outside it.</p>';
    if (v.looBandRatioLo !== null && v.looBandRatioLo !== undefined && v.looBandRatioHi !== null && v.looBandRatioHi !== undefined) {
      h += '<p><b>Leave-one-out check:</b> the middle half of actual/implied ratios across the fit peers runs ' + v.looBandRatioLo.toFixed(2) + 'x\u2013' + v.looBandRatioHi.toFixed(2) + 'x \u2014 that is the shaded band in the scatter chart above.</p>';
    }
    h += '</div>';
    return h;
  }
  function boardHtml() {
    var rows = filteredRows();
    var cats = {};
    DATA.rows.forEach(function (r) { cats[r.category || 'Uncategorised'] = 1; });
    var chains = {};
    DATA.rows.forEach(function (r) { if (r.chains[0]) chains[r.chains[0]] = 1; });
    var catOpts = ['<option value="all">All categories</option>'].concat(Object.keys(cats).sort().map(function (c) {
      return '<option value="' + esc(c === 'Uncategorised' ? '' : c) + '"' + (state.category === (c === 'Uncategorised' ? '' : c) ? ' selected' : '') + '>' + esc(c) + '</option>';
    })).join('');
    var chainOpts = ['<option value="all">All chains</option>'].concat(Object.keys(chains).sort().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    })).join('');
    var h = '<div class="panel mapwrap">' + bubbleMap(DATA.rows) +
      '<div class="legend"><span><i style="background:#2fd6a3"></i>ROBUST</span><span><i style="background:#4caf7d"></i>FARM</span><span><i style="background:#d9a441"></i>THIN</span><span><i style="background:#6b6f76"></i>SKIP</span><span>' + DATA.board_size + ' protocols, ' + DATA.watchlist_size + ' on the watchlist, ranked by implied token market capitalisation.</span></div></div>';
    h += '<div class="panel mapwrap"><h2>Where the market sits against the yardstick</h2>' + ratioScatter() + '</div>';
    h += formulaBoxHtml();
    h += bestHourHtml();
    h += boardSummaryHtml();
    h += '<div class="filters">' +
      '<input id="f-q" type="search" placeholder="Search name or slug" value="' + esc(state.q) + '">' +
      '<select id="f-cat">' + catOpts + '</select>' +
      '<select id="f-chain">' + chainOpts + '</select>' +
      '<select id="f-verdict"><option value="all">All verdicts</option>' +
      ['ROBUST', 'FARM', 'THIN', 'SKIP'].map(function (v) { return '<option' + (state.verdict === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select>' +
      '<input id="f-min" type="number" min="0" step="1" placeholder="Min implied $M" value="' + esc(state.minImp) + '" style="flex:0 1 130px">' +
      '<span class="count">showing ' + rows.length + ' of ' + DATA.rows.length + '</span></div>';
    h += '<table><thead><tr>' +
      '<th data-sort="rank">Rank</th><th>Protocol</th><th class="num" data-sort="tvl">TVL</th><th class="num" data-sort="growth">7d</th><th class="num" data-sort="age">Age</th><th class="num" data-sort="implied">Implied value</th><th class="num">P10\u2013P90</th><th class="num">P25\u2013P75</th><th class="num">Multiple</th><th class="num">Gross</th><th class="num">Cost</th><th class="num">Net EV</th><th class="num" data-sort="breakeven">BE odds</th><th class="num" data-sort="perhour">Net $/h</th><th class="num">F-Hold</th><th>Verdict</th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r) {
      var chainList = (r.chains || []);
      var chainShown = chainList.slice(0, 3).join(', ') + (chainList.length > 3 ? ' +' + (chainList.length - 3) + ' more' : '');
      h += '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><b>' + esc(r.name) + '</b><span class="cat">' + esc(r.category || 'Uncategorised') + ' &middot; ' + esc(chainShown || 'no chain') + '</span><span class="slug">' + esc(r.slug) + '</span>' + (r.is_watchlist ? '<span class="wl">WATCHLIST</span>' : '') + '<span class="mech">' + esc(r.mechanism || '') + '</span></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num">' + fmtPct(r.change_7d === null ? null : r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td>' +
        '<td class="num">' + fmtBand(r) + '</td>' +
        '<td class="num">' + fmtBand50(r) + '</td>' +
        '<td class="num">' + fmtMult(r.multiple) + '</td>' +
        '<td class="num">' + fmtUsd2(r.farm.share) + '</td>' +
        '<td class="num">' + fmtUsd2(r.farm.totalCost) + '</td>' +
        '<td class="num">' + fmtUsd2(r.farm.netEv) + '</td>' +
        '<td class="num">' + fmtOdds(r.farm.breakevenOdds) + '</td>' +
        '<td class="num">' + fmtPerHour(r.farm.netPerHour) + '</td>' +
        '<td class="num">' + fmtUsd2(r.farm.feesHold) + '</td>' +
        '<td' + (r.farm.verdict === 'THIN' ? ' title="THIN: ratio under 1.5x."' : r.farm.verdict === 'ROBUST' ? ' title="ROBUST: net EV still at least $0 at the low end of the 50% band (p25)."' : '') + '>' + verdictBadge(r.farm.verdict) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<p class="small">Implied value is the entry\u2019s own claim about what a token would be worth if the protocol\u2019s record stayed as it is \u2014 not a prediction of whether or when a token launches. A protocol is said to record no token, never that it has none.</p>';
    return h;
  }
  function liveHtml() {
    var h = '<div class="panel"><h2>Live tokens</h2><p>The top ' + DATA.live_size + ' protocols that already trade, by market cap. These are the market\u2019s own values, not a model\u2019s \u2014 they are <b>not ranked</b> and they are not farm targets here. They are the peers the model is fitted on, shown so the board visibly separates live from pre-token.</p></div>';
    h += '<table class="plain"><thead><tr><th>Protocol</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">MC / TVL</th><th class="num">7d</th></tr></thead><tbody>';
    DATA.live.forEach(function (r) {
      h += '<tr><td><b>' + esc(r.name) + '</b><span class="cat">' + esc(r.category || 'Uncategorised') + ' &middot; ' + esc((r.chains || []).join(', ')) + '</span></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td><td class="num">' + fmtUsd(r.mcap_usd) + '</td>' +
        '<td class="num">' + (r.mcap_usd && r.tvl_usd ? fmtMult(r.mcap_usd / r.tvl_usd) : 'n/a') + '</td>' +
        '<td class="num">' + fmtPct(r.change_7d) + '</td></tr>';
    });
    h += '</tbody></table>';
    return h;
  }
  function methodHtml() {
    var v = DATA.validation;
    var b = v.bands;
    var isHuber = (DATA.model_version || '').indexOf('huber') >= 0;
    var big = DATA.rows[0];
    DATA.rows.forEach(function (r) { if (r.tvl_usd > big.tvl_usd) big = r; });
    var wlTotal = 0;
    DATA.rows.forEach(function (r) { if (r.is_watchlist) wlTotal += r.implied_value_usd; });
    // Risk Curators' single live peer, for the "what if we used it" counterfactual:
    // the raw category median and what the biggest row would be worth at it.
    var rcCat = catOf('Risk Curators');
    var rcMed = rcCat === null ? null : rcCat.median;
    var rcAlt = rcMed === null ? null : big.tvl_usd * rcMed * breakdownOf(big).sizeF * breakdownOf(big).growthMult * breakdownOf(big).mat;
    var h = '<div class="panel"><h2>How this is priced</h2>' +
      '<h3>The blind test first</h3>' +
      '<p>Before anything else, the test \u2014 and the comparator. The model is fit on 80% of the ' + FIT.peerCount + ' live-token peers and evaluated on the held-out 20%, repeated five times with fixed seeds, with no tuning on the test set; the held-out peers are kept out of peer selection, winsorization, category calibration, size-curve fitting and hyperparameter selection. On that blind test the model\u2019s median error is <b>x' + v.blindMedian.toFixed(2) + ' against x' + fnum(v.flatBlindMedian, 'x', 2, '') + ' for a flat baseline</b> (the global median multiple, ' + FIT.globalMedian.toFixed(3) + 'x, applied to every peer \u2014 which ranks by TVL alone), and it wins on within-3x (' + v.blindWithin3.toFixed(1) + '% vs ' + fnum(v.flatBlindWithin3, '', 1, '%') + '). The paired 95% interval for the blind median-error advantage is [' + fnum(v.flatBlindCiLo, '', 3, '') + ', ' + fnum(v.flatBlindCiHi, '', 3, '') + '] \u2014 entirely below zero, so the advantage is real. It does not win on ranking: the flat TVL ranking scores a higher Spearman (' + fnum(v.flatBlindSpearman, '', 3, '') + ' vs ' + fnum(v.blindSpearman, '', 3, '') + ' blind), and the same holds on the time split \u2014 noise at n=' + v.timeSplitN + ', but stated plainly. The table below has every number, model against flat, on the identical frozen splits.</p>' +
      '<h3>Validation \u2014 model vs flat, same splits</h3>' +
      '<table class="plain"><thead><tr><th>Metric</th><th class="num">M0 blind x5</th><th class="num">Flat blind x5</th><th class="num">M0 time-split</th><th class="num">Flat time-split</th><th class="num">M0 LOO</th><th class="num">Flat LOO</th></tr></thead><tbody>' +
      '<tr><td>1+MdAPE (median error)</td><td class="num">' + fnum(v.blindMedian, 'x', 2, '') + '</td><td class="num">' + fnum(v.flatBlindMedian, 'x', 2, '') + '</td><td class="num">' + fnum(v.timeSplitMedian, 'x', 2, '') + '</td><td class="num">' + fnum(v.flatTimeSplitMedian, 'x', 2, '') + '</td><td class="num">' + fnum(v.adoptedMedian, 'x', 2, '') + '</td><td class="num">' + fnum(looFlatRow() === null ? null : looFlatRow().median, 'x', 2, '') + '</td></tr>' +
      '<tr><td>Median max-ratio</td><td class="num">' + fnum(v.blindMedianMaxRatio, 'x', 2, '') + '</td><td class="num">' + fnum(v.flatBlindMedianMaxRatio, 'x', 2, '') + '</td><td class="num">' + fnum(v.timeSplitMedianMaxRatio, 'x', 2, '') + '</td><td class="num">' + fnum(v.flatTimeSplitMedianMaxRatio, 'x', 2, '') + '</td><td class="num">' + fnum(v.adoptedMedianMaxRatio, 'x', 2, '') + '</td><td class="num">' + fnum(looFlatRow() === null ? null : looFlatRow().medianMaxRatio, 'x', 2, '') + '</td></tr>' +
      '<tr><td>Within 2x</td><td class="num">' + fnum(v.blindWithin2, '', 1, '%') + '</td><td class="num">' + fnum(v.flatBlindWithin2, '', 1, '%') + '</td><td class="num">' + fnum(v.timeSplitWithin2, '', 1, '%') + '</td><td class="num">' + fnum(v.flatTimeSplitWithin2, '', 1, '%') + '</td><td class="num">' + fnum(v.adoptedWithin2, '', 1, '%') + '</td><td class="num">' + fnum(looFlatRow() === null ? null : looFlatRow().within2, '', 1, '%') + '</td></tr>' +
      '<tr><td>Within 3x</td><td class="num">' + fnum(v.blindWithin3, '', 1, '%') + '</td><td class="num">' + fnum(v.flatBlindWithin3, '', 1, '%') + '</td><td class="num">' + fnum(v.timeSplitWithin3, '', 1, '%') + '</td><td class="num">' + fnum(v.flatTimeSplitWithin3, '', 1, '%') + '</td><td class="num">' + fnum(v.adoptedWithin3, '', 1, '%') + '</td><td class="num">' + fnum(looFlatRow() === null ? null : looFlatRow().within3, '', 1, '%') + '</td></tr>' +
      '<tr><td>Spearman(pred, act)</td><td class="num">' + fnum(v.blindSpearman, '', 3, '') + '</td><td class="num">' + fnum(v.flatBlindSpearman, '', 3, '') + '</td><td class="num">' + fnum(v.timeSplitSpearman, '', 3, '') + '</td><td class="num">' + fnum(v.flatTimeSplitSpearman, '', 3, '') + '</td><td class="num">' + fnum(v.adoptedSpearman, '', 3, '') + '</td><td class="num">' + fnum(looFlatRow() === null ? null : looFlatRow().spearman, '', 3, '') + '</td></tr>' +
      '<tr><td>50% band coverage</td><td class="num">' + (b.blindCov50 * 100).toFixed(1) + '%</td><td class="num">\u2014</td><td class="num">' + (b.timeCov50 * 100).toFixed(1) + '%</td><td class="num">\u2014</td><td class="num">\u2014</td><td class="num">\u2014</td></tr>' +
      '<tr><td>80% band coverage</td><td class="num">' + (b.blindCov80 * 100).toFixed(1) + '%</td><td class="num">\u2014</td><td class="num">' + (b.timeCov80 * 100).toFixed(1) + '%</td><td class="num">\u2014</td><td class="num">\u2014</td><td class="num">\u2014</td></tr>' +
      '<tr><td>n</td><td class="num">' + b.blindN + '</td><td class="num">' + b.blindN + '</td><td class="num">' + v.timeSplitN + '</td><td class="num">' + v.timeSplitN + '</td><td class="num">' + v.peerCount + '</td><td class="num">' + v.peerCount + '</td></tr>' +
      '</tbody></table>' +
      '<p>Reading it honestly: the model beats flat on median error and within-3x (blind and time-split) and on the tail (median max-ratio) everywhere; it is tied on within-2x blind; and it is <b>worse on Spearman</b> \u2014 the flat TVL ranking out-ranks it on every split, so the value is in the point estimates and the tail, not the ordering. On leave-one-out the two are close on median error (x' + v.adoptedMedian.toFixed(2) + ' vs x' + fnum(looFlatRow() === null ? null : looFlatRow().median, '', 2, '') + ' flat), but the model wins the tail (within-3x ' + v.adoptedWithin3.toFixed(1) + '% vs ' + fnum(looFlatRow() === null ? null : looFlatRow().within3, '', 1, '%') + ', max-ratio x' + v.adoptedMedianMaxRatio.toFixed(2) + ' vs x' + fnum(looFlatRow() === null ? null : looFlatRow().medianMaxRatio, '', 2, '') + '). Flat has no bands, so no coverage row.</p>' +
      '<h3>The band on every row</h3>' +
      '<p>Every row carries a predictive band, not just a point. The band is built by resampling the ' + FIT.peerCount + ' peers 200 times, refitting the model each time, predicting the row, and multiplying by one draw from the leave-one-out residual distribution; the p10/p90 ends are the 80% band and p25/p75 the 50% band. This is an 80% <b>predictive</b> interval, not a confidence interval: it says where the token\u2019s value plausibly lands, not how precisely the model is estimated. On the blind splits the 80% band holds the true market cap <b>' + (b.blindCov80 * 100).toFixed(1) + '%</b> of the time (target 80%) and the 50% band <b>' + (b.blindCov50 * 100).toFixed(1) + '%</b> (target 50%) \u2014 the bands are calibrated, not decorative. On the time split they under-cover (' + (b.timeCov80 * 100).toFixed(1) + '% / ' + (b.timeCov50 * 100).toFixed(1) + '% on ' + b.timeN + ' newer listings), so blind calibration does not transfer perfectly to newer listings and a newer protocol\u2019s band is less reliable than the blind average suggests. The bands are wide \u2014 the median 80% band spans <b>' + b.boardWidth80.toFixed(0) + 'x</b> across the board \u2014 because the error distribution is heavy-tailed: the median leave-one-out error is x' + v.adoptedMedian.toFixed(2) + ', but 1 in 10 peers is off by more than x' + v.adoptedP90MaxRatio.toFixed(1) + '. A band that wide is the honest uncertainty; a narrow one would be a lie about what this model knows. Endpoints move ~15% median (p10 18%, p25 14%, p75 15%, p90 15%; max 94% fstswap), 1,000 vs 200 resamples.</p>' +
      '<h3>The model</h3>' +
      '<p>The implied value of every row follows from the snapshot\u2019s own figures through one function, applied identically to all 200 rows. No protocol name is special-cased. The model is a <b>pricing yardstick, not a price target</b>.</p>' +
      '<p><b>No top-10 scalar.</b> Round 3 lifted the top 10 rows by 1.15x; three independent audits called that an unjustified post-hoc patch, so it is gone (1.00x) \u2014 no rank #10/#11 cliff, and the watchlist total is ' + fmtUsd(wlTotal) + ', well inside the $0.68B ceiling.</p>' +
      '<p><b>Peers:</b> ' + FIT.peerCount + ' protocols that record a token with a market cap and a TVL (416 record a token; only 144 carry a market cap). ' + (fitUniverse() === null ? '' : 'The wider live-token universe is ' + fitUniverse() + ' protocols; ' + (setAsideCount() === null ? '' : setAsideCount() + ' of them are set aside from the fit because they record no listing date, so the fit cannot check their age or maturity. ')) +
      '<b>Winsor bounds:</b> peer ratios clipped to [' + FIT.winsorLo.toFixed(4) + ', ' + FIT.winsorHi.toFixed(4) + ']. ' +
      '<b>Global median multiple:</b> ' + FIT.globalMedian.toFixed(3) + 'x.</p>' +
      '<p><b>Category multiple:</b> each category\u2019s winsorized median ratio, shrunk toward the global median with weight w = n / (n + 5). A category with fewer than 3 live peers falls back entirely to the global median \u2014 so Risk Curators (12 of the 40 watchlist rows, 1 live peer) is priced at the global ' + FIT.globalMedian.toFixed(3) + 'x, not at its single peer\u2019s ' + (rcMed === null ? 'n/a' : rcMed.toFixed(3) + 'x') + '. Using that one peer would put ' + esc(big.name) + ' at ' + (rcAlt === null ? 'n/a' : fmtUsd(rcAlt)) + '.</p>' +
      '<p><b>Size curve:</b> log10(market cap) = ' + FIT.sizeA.toFixed(3) + ' + ' + FIT.sizeB.toFixed(3) + ' x log10(TVL), fitted on the ' + FIT.peerCount + ' peers (the slope is ' + Math.abs((FIT.sizeB - 1) / FIT.sizeSeB).toFixed(1) + ' standard errors below 1.0, so a flat multiple is rejected). Applied as a factor relative to the category\u2019s median TVL, so a big protocol is penalised against its own category\u2019s typical size.</p>' +
      '<p><b>Why the biggest rows look cheap.</b> The size curve is sub-linear (\u03b2 = ' + FIT.sizeB.toFixed(3) + '), so a protocol far above its category\u2019s median TVL is priced at a small fraction of the category multiple. Take the largest TVL on the board, ' + esc(big.name) + ' (' + fmtUsd(big.tvl_usd) + '): its size factor is ' + breakdownOf(big).sizeF.toFixed(3) + 'x, so its implied ' + fmtUsd(big.implied_value_usd) + ' is only a ' + big.multiple.toFixed(3) + 'x multiple \u2014 not the raw ' + FIT.globalMedian.toFixed(3) + 'x global median. The multiples on the board are post-dampening, not raw category multiples.</p>' +
      '<p><b>Growth:</b> 1 + clamp(7-day change, -60%, +120%) / 100 x 0.5. <b>Maturity:</b> 0.6 + min(age, 1095 days) / 1095 x 0.4. Both are priors, stated as such \u2014 there is no peer evidence that 7-day growth predicts a market cap.</p>' +
      '<p><b>No chain multiplier.</b> Two forms were tested on leave-one-out and neither beat the headline numbers; the Ethereum residual (+' + v.chainEthDex.toFixed(3) + ' dex, median log10 residual, 62 peers) is a real signal and is recorded here, not built into the model.</p>' +
      '<h3>Validation \u2014 the leave-one-out table</h3>' +
      '<p>Leave-one-out on the ' + v.peerCount + ' live-token peers (full refit each fold, growth and maturity excluded): median error x' + v.adoptedMedian.toFixed(2) + ' (1 + MdAPE \u2014 the median absolute percentage error) and median max-ratio x' + v.adoptedMedianMaxRatio.toFixed(2) + ', ' + v.adoptedWithin2.toFixed(1) + '% within 2x, ' + v.adoptedWithin3.toFixed(1) + '% within 3x. The two error definitions are not interchangeable: 1+MdAPE caps an under-prediction at 2x, while the max-ratio counts the larger side either way, so the max-ratio is the like-for-like number to compare against another entry\u2019s quoted error.</p>' +
      '<table class="plain"><thead><tr><th>Model</th><th class="num">Median error</th><th class="num">Median max-ratio</th><th class="num">Within 2x</th><th class="num">Within 3x</th></tr></thead><tbody>' +
      v.loo.map(function (r) {
        return '<tr><td>' + (r.model.indexOf('adopted') >= 0 ? '<b>' + esc(r.model) + '</b>' : esc(r.model)) + '</td><td class="num">x' + r.median.toFixed(2) + '</td><td class="num">x' + r.medianMaxRatio.toFixed(2) + '</td><td class="num">' + r.within2.toFixed(1) + '%</td><td class="num">' + r.within3.toFixed(1) + '%</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p>No model clearly dominates on the median (x1.85\u2013x1.91 for all). The adopted model wins on the tail (best within-3x) while keeping the board sane. ' + (isHuber ? 'The adopted fit is a Huber fit (\u03b4=1.0): it down-weights the outlying peers instead of letting a few extreme ratios drag the size curve, and it is the fit every number above is measured on. Damped slope, quadratic size curve, per-category curves and both chain multipliers were all tested on the same leave-one-out and none beats it cleanly.' : 'Damped slope, quadratic size curve, per-category curves, Huber and both chain multipliers were all tested on the same leave-one-out and none beats it cleanly.') + '</p>' +
      '<p class="small">For completeness, the small print: the size curve\u2019s R\u00b2 is ' + FIT.sizeR2.toFixed(3) + ' (TVL explains only ' + (FIT.sizeR2 * 100).toFixed(1) + '% of the variance in market cap \u2014 the relationship is a yardstick, not a law), and Spearman(pred, act) is ' + v.adoptedSpearman.toFixed(3) + ' on leave-one-out and ' + (v.blindSpearman === null ? 'n/a' : v.blindSpearman.toFixed(3)) + ' on the blind splits.</p>' +
      '<p><b>Ship rule, codified before the experiment:</b> a variant ships only if it beats the adopted model on blind median error AND blind Spearman with significance (paired 95% interval excludes zero), AND does not regress the time-split median, AND does not drop blind within-3x, AND keeps Spearman(pred, TVL) below 0.95, AND keeps the watchlist total within 25% of $0.637B. The rule is necessary, not sufficient: a variant that passes it still has to keep a sane board. Two variants satisfied the old literal rule and were still rejected on noise (M1 t = 0.99, M2 t = 0.62). A four-way clean-comps experiment was run on the same frozen splits before this build; no variant met the rule, so the adopted model stands.</p>' +
      '<p class="small">The numbers above are for the predictor without growth and maturity (priors with no peer evidence); the production board includes them. Validated with growth and maturity included, median error moves by less than the seed noise.</p>' +
      '<p><b>Coherence:</b> Spearman between TVL and implied value across the 40 watchlist rows is ' + v.coherence.toFixed(3) + ' (bar 0.75) \u2014 the multipliers do not overpower TVL. <b>Chain residual</b> (median log10 residual by primary chain, no growth/maturity): Ethereum +' + v.chainEthDex.toFixed(3) + ' dex, Solana ' + v.chainSolDex.toFixed(3) + ' dex.</p>' +
      '<h3>Calibration</h3>' + calibrationChart() +
      '<h3>Farm verdicts</h3>' +
      '<p>Each row\u2019s verdict is a visible subtraction, not a threshold on value. The hypothetical airdrop pool is 8% of the implied value (a stated assumption \u2014 the snapshot cannot establish whether an airdrop will happen); the farmer\u2019s share is the pool times $2,500 of capital over the protocol\u2019s TVL; the cost is the steps\u2019 gas plus 4.5% a year on the capital for 90 days. <b>FARM</b> needs a net expected value of at least $40 and at least 1.5x the cost; <b>THIN</b> needs a net expected value of at least $0; anything else is <b>SKIP</b>. The $40 threshold was set from the distribution so that it adds nothing the 1.5x ratio test has not already selected. A $2.75B-TVL curator gives a $2,500 position almost nothing \u2014 that is dilution, honestly reported, and why an impressive TVL never automatically means FARM.</p>' +
      '<p><b>ROBUST</b> is a FARM row whose net expected value is still at least $0 at the low end of its 50% band (p25) \u2014 on top of the FARM gates ($40 net EV and 1.5x the cost at the median). $0 at the low end is the honest bar: the p25 band is wide (p25/implied runs 0.24\u20130.40 on FARM rows), so no row could clear $40 at p25 \u2014 the best row on the whole board reaches only $8.76 there. $0 means the plan still pays (does not lose money) even if the value lands at the 25th percentile. Every row also carries its <b>break-even odds</b> \u2014 the chance the token\u2019s value lands above the value at which the farm breaks even \u2014 and its <b>net $/hour</b>, the net expected value divided by the hands-on minutes the plan asks for, so a slow farm can be compared with a quick one on the same footing.</p>' +
      '<h3>What this does not do</h3>' +
      '<p>It does not predict whether or when a token launches. It does not use any data outside the snapshot\u2019s ten fields. It does not call its output \u201cimplied FDV\u201d \u2014 the snapshot carries market capitalisation, not fully diluted value. Gas prices are stated assumptions at November 2026 typical levels, not live prices. The farm steps are proposed interactions to verify on the protocol\u2019s own page; nothing here claims a points program, a quest or an airdrop exists.</p>' +
      '</div>';
    return h;
  }
  // Model & calibration: the numbers behind the board, in one place. The
  // method tab keeps the narrative; this tab is the ledger. Every figure is
  // read from DATA; anything an older data file does not carry reads 'n/a'
  // or is left out instead of throwing.
  function calibrationHtml() {
    var v = DATA.validation;
    var b = v.bands || {};
    var isHuber = (DATA.model_version || '').indexOf('huber') >= 0;
    var flat = looFlatRow();
    var h = '<div class="panel"><h2>Model &amp; calibration</h2>' +
      '<p>The numbers behind the board, in one place. The narrative is on the \u201cHow this is priced\u201d tab; this tab is the ledger.</p>' +
      '<h3>Fit peers</h3>' +
      '<p><b>' + FIT.peerCount + '</b> fit peers' + (fitUniverse() === null ? '' : ' out of a <b>' + fitUniverse() + '</b>-protocol live-token universe') + (setAsideCount() === null ? '' : '; <b>' + setAsideCount() + '</b> set aside because they record no listing date, so the fit cannot check their age or maturity') + '. The traded-anchors tab lists the fit peers one by one.</p>' +
      '<h3>The size curve</h3>' +
      '<p>log<sub>10</sub>(market cap) = ' + FIT.sizeA.toFixed(3) + ' + ' + FIT.sizeB.toFixed(3) + ' &times; log<sub>10</sub>(TVL), R\u00b2 = ' + FIT.sizeR2.toFixed(3) + (FIT.sizeSeB ? ' (slope standard error ' + FIT.sizeSeB.toFixed(3) + ')' : '') + '. ' +
      (isHuber ? 'Fitted by Huber regression (\u03b4=1.0, iteratively reweighted least squares, 20 iterations): outlying peers are down-weighted instead of dropped, so a few extreme ratios cannot drag the line.' : 'Fitted by least squares on the winsorized peer ratios.') + '</p>' +
      '<h3>Shrinkage and clamps</h3>' +
      '<table class="plain"><thead><tr><th>Setting</th><th class="num">Value</th><th>What it does</th></tr></thead><tbody>' +
      '<tr><td>Category shrinkage k</td><td class="num">' + MODEL.shrinkK + '</td><td>Category multiple weight w = n / (n + k)</td></tr>' +
      '<tr><td>Minimum peers per category</td><td class="num">' + MODEL.minPeers + '</td><td>Below this, the category falls back to the global median</td></tr>' +
      '<tr><td>Winsor bounds</td><td class="num">[' + FIT.winsorLo.toFixed(4) + ', ' + FIT.winsorHi.toFixed(4) + ']</td><td>Peer ratios clipped to this range before fitting</td></tr>' +
      '<tr><td>Global median multiple</td><td class="num">' + FIT.globalMedian.toFixed(3) + 'x</td><td>The fallback multiple, and the flat baseline</td></tr>' +
      '<tr><td>Growth clamp</td><td class="num">' + MODEL.growthFloor + '% to +' + MODEL.growthCap + '%</td><td>7-day change clipped before the growth factor</td></tr>' +
      '<tr><td>Growth weight</td><td class="num">' + MODEL.growthWeight + '</td><td>Growth factor 1 + clamp(change) / 100 &times; weight</td></tr>' +
      '<tr><td>Maturity</td><td class="num">' + MODEL.maturityFloor + ' + age / ' + MODEL.maturityDays + 'd &times; ' + MODEL.maturityRange + '</td><td>Older listings priced nearer full maturity</td></tr>' +
      '<tr><td>Top-10 scalar</td><td class="num">' + MODEL.topScalar.toFixed(2) + 'x</td><td>Multiplier on the top 10 board rows (1.00x: none)</td></tr>' +
      '</tbody></table>' +
      '<h3>Leave-one-out, full table</h3>' +
      '<p>Full refit each fold, growth and maturity excluded, on ' + v.peerCount + ' peers. The adopted row is bold.</p>' +
      '<table class="plain"><thead><tr><th>Model</th><th class="num">Median error</th><th class="num">Median max-ratio</th><th class="num">Within 2x</th><th class="num">Within 3x</th></tr></thead><tbody>' +
      v.loo.map(function (r) {
        return '<tr><td>' + (r.model.indexOf('adopted') >= 0 ? '<b>' + esc(r.model) + '</b>' : esc(r.model)) + '</td><td class="num">x' + r.median.toFixed(2) + '</td><td class="num">x' + r.medianMaxRatio.toFixed(2) + '</td><td class="num">' + r.within2.toFixed(1) + '%</td><td class="num">' + r.within3.toFixed(1) + '%</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p>Adopted headline: median error x' + fnum(v.adoptedMedian, '', 2, '') + ', median max-ratio x' + fnum(v.adoptedMedianMaxRatio, '', 2, '') + ', ' + fnum(v.adoptedWithin2, '', 1, '%') + ' within 2x, ' + fnum(v.adoptedWithin3, '', 1, '%') + ' within 3x (n=' + v.peerCount + '), Spearman ' + fnum(v.adoptedSpearman, '', 3, '') + ', 1 in 10 peers off by more than x' + fnum(v.adoptedP90MaxRatio, '', 1, '') + '. Flat on the same peers: ' + (flat ? 'median error x' + fnum(flat.median, '', 2, '') + ', within-3x ' + fnum(flat.within3, '', 1, '%') : 'n/a') + '.</p>' +
      '<h3>Band calibration</h3>' +
      '<p>80% band coverage on the blind splits: ' + (b.blindCov80 === undefined ? 'n/a' : (b.blindCov80 * 100).toFixed(1) + '%') + ' (target 80%); 50% band: ' + (b.blindCov50 === undefined ? 'n/a' : (b.blindCov50 * 100).toFixed(1) + '%') + ' (target 50%). On the time split: ' + (b.timeCov80 === undefined ? 'n/a' : (b.timeCov80 * 100).toFixed(1) + '%') + ' / ' + (b.timeCov50 === undefined ? 'n/a' : (b.timeCov50 * 100).toFixed(1) + '%') + ' on ' + (b.timeN === undefined ? 'n/a' : b.timeN) + ' newer listings. The median 80% band across the board spans ' + (b.boardWidth80 === undefined ? 'n/a' : b.boardWidth80.toFixed(0) + 'x') + '.</p>' +
      (v.looBandRatioLo !== null && v.looBandRatioLo !== undefined && v.looBandRatioHi !== null && v.looBandRatioHi !== undefined ? '<p>Leave-one-out band for actual/implied: the middle half of ratios runs <b>' + v.looBandRatioLo.toFixed(2) + 'x\u2013' + v.looBandRatioHi.toFixed(2) + 'x</b> \u2014 this is the shaded band in the scatter chart on the board tab.</p>' : '') +
      '</div>';
    return h;
  }
  // Traded anchors: the fit peers, kept apart from the board because their
  // tokens already trade. Implied values are recomputed in-page from TVL and
  // category alone (no growth, no maturity), the same way the calibration
  // chart computes them. Sortable by ratio, TVL, market cap, implied value
  // and name, through the shared th[data-sort] handler and state.sort.
  function anchorsHtml() {
    var peers = DATA.peers.slice();
    var key = state.sort;
    var dir = state.dir;
    var impCache = {};
    function impOf(p) {
      if (impCache[p.slug] === undefined) impCache[p.slug] = impliedOf({ tvl_usd: p.tvl_usd, category: p.category, change_7d: null, age_days: null });
      return impCache[p.slug];
    }
    peers.sort(function (a, b) {
      var av, bv;
      if (key === 'atvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'amcap') { av = a.mcap_usd; bv = b.mcap_usd; }
      else if (key === 'aimplied') { av = impOf(a); bv = impOf(b); }
      else if (key === 'aname') { return (a.name < b.name ? -1 : 1) * dir; }
      else { av = a.mcap_usd / impOf(a); bv = b.mcap_usd / impOf(b); }
      return (av - bv) * dir || (a.slug < b.slug ? -1 : 1);
    });
    var h = '<div class="panel"><h2>Traded anchors</h2><p>The ' + DATA.peers.length + ' live-token peers the size curve is fitted on, kept apart from the board because these tokens already trade \u2014 they are the yardstick, not farm targets. Implied values are recomputed in this page from TVL and category alone (no growth, no maturity), the same way the calibration chart computes them.' + (setAsideCount() === null ? '' : ' Another ' + setAsideCount() + ' live-token protocols are set aside from this list: they record no listing date, so the fit cannot place them.') + ' Click a column to sort; the ratio column sorts by actual market cap over implied value.</p></div>';
    h += '<table class="plain"><thead><tr><th data-sort="aname">Peer</th><th class="num" data-sort="atvl">TVL</th><th class="num" data-sort="amcap">Market cap</th><th class="num" data-sort="aimplied">Implied value</th><th class="num" data-sort="aratio">Actual / implied</th></tr></thead><tbody>';
    peers.forEach(function (p) {
      var imp = impOf(p);
      h += '<tr><td><b>' + esc(p.name) + '</b><span class="cat">' + esc(p.category || 'Uncategorised') + '</span></td>' +
        '<td class="num">' + fmtUsd(p.tvl_usd) + '</td><td class="num">' + fmtUsd(p.mcap_usd) + '</td><td class="num">' + fmtUsd(imp) + '</td><td class="num">' + fmtMult(p.mcap_usd / imp) + '</td></tr>';
    });
    h += '</tbody></table>';
    return h;
  }
  function detailHtml(row) {
    var b = breakdownOf(row);
    var base = row.tvl_usd * b.mult;
    var afterSize = base * b.sizeF;
    var afterGrowth = afterSize * b.growthMult;
    var afterMat = afterGrowth * b.mat;
    var f = row.farm;
    // Downside economics at the band's low end (p25): the same pool/share
    // arithmetic as the verdict, but with the implied value at p25 instead of
    // the median. The cost is unchanged (gas + opportunity cost do not depend
    // on the implied value). Computed here from the row's own band and farm
    // fields, so the page never pastes a number it cannot recompute.
    var p25 = row.uncertainty ? row.uncertainty.p25 : null;
    var pool25 = p25 === null ? null : MODEL.poolShare * p25;
    var share25 = pool25 === null ? null : pool25 * (f.capital / row.tvl_usd);
    var netEv25 = share25 === null ? null : share25 - f.totalCost;
    var p10 = row.uncertainty.p10;
    var netEv10 = MODEL.poolShare * p10 * f.capital / row.tvl_usd - f.totalCost;
    var width80 = row.uncertainty ? row.uncertainty.p90 / row.uncertainty.p10 : null;
    // ROBUST note: clears the FARM gates at the median ($40 net EV, 1.5x
    // the cost) AND net EV at least $0 at the low end of its 50% band
    // (p25) — the plan still pays even if the value lands at the 25th
    // percentile. Prefer the model's own p25 economics when the data file
    // carries them; otherwise fall back to the p25 arithmetic computed above.
    var p25ev = (f.netEvP25 !== null && f.netEvP25 !== undefined) ? f.netEvP25 : netEv25;
    var robustNote = '';
    if (f.verdict === 'ROBUST') robustNote = ' <b>ROBUST</b> means this row clears the FARM gates at the median ($40 net EV, 1.5x the cost) and its net EV is still at least $0 at the low end of its 50% band: net EV at p25 is ' + (p25ev === null ? 'n/a' : (p25ev >= 0 ? '+' : '') + fmtUsd2(p25ev)) + (f.netEvRatioP25 !== null && f.netEvRatioP25 !== undefined ? ' (' + f.netEvRatioP25.toFixed(2) + 'x the cost)' : '') + ' \u2014 the plan still pays even if the value lands at the 25th percentile.';
    var beNote = '';
    if (f.breakevenOdds !== null && f.breakevenOdds !== undefined) {
      beNote = ' Break-even odds ' + fmtOdds(f.breakevenOdds) + (f.breakevenValue !== null && f.breakevenValue !== undefined ? ' \u2014 the farm breaks even at an implied value of ' + fmtUsd(f.breakevenValue) : '') + (f.netPerHour !== null && f.netPerHour !== undefined ? '; net ' + fmtPerHour(f.netPerHour) + ' per hands-on hour' : '') + '.';
    }
    var peers = DATA.peers.filter(function (p) { return p.category === row.category; });
    if (peers.length < 5) peers = DATA.peers.slice();
    peers = peers.map(function (p) {
      return { p: p, d: Math.abs(Math.log(p.tvl_usd) - Math.log(row.tvl_usd)) };
    }).sort(function (a, c) { return a.d - c.d; }).slice(0, 5);
    var h = '<div class="detail"><div class="sheet">' +
      '<button class="close" id="d-close">Close</button>' +
      '<h2>' + esc(row.name) + '</h2>' +
      '<p class="meta">Rank #' + row.rank + ' &middot; ' + esc(row.category || 'Uncategorised') + ' &middot; ' + esc((row.chains || []).join(', ') || 'no chain') + ' &middot; ' + esc(row.slug) + (row.is_watchlist ? ' &middot; <span class="wl">WATCHLIST</span>' : '') + '</p>' +
      '<div class="kv">' +
      '<div><div class="k">Implied value</div><div class="v">' + fmtUsd(row.implied_value_usd) + '</div></div>' +
      '<div><div class="k">Multiple</div><div class="v">' + fmtMult(row.multiple) + ' <small>of TVL</small></div></div>' +
      '<div><div class="k">TVL</div><div class="v">' + fmtUsd(row.tvl_usd) + '</div></div>' +
      '<div><div class="k">7-day change</div><div class="v">' + fmtPct(row.change_7d) + '</div></div>' +
      '<div><div class="k">Age</div><div class="v">' + fmtAge(row.age_days) + '</div></div>' +
      '<div><div class="k">Verdict</div><div class="v">' + verdictBadge(f.verdict) + '</div></div>' +
      (f.breakevenOdds === null || f.breakevenOdds === undefined ? '' : '<div><div class="k">Break-even odds</div><div class="v">' + fmtOdds(f.breakevenOdds) + '</div></div>') +
      (f.netPerHour === null || f.netPerHour === undefined ? '' : '<div><div class="k">Net $/hour</div><div class="v">' + fmtPerHour(f.netPerHour) + '</div></div>') +
      (f.handsOnMinutes === null || f.handsOnMinutes === undefined ? '' : '<div><div class="k">Hands-on time</div><div class="v">' + f.handsOnMinutes + ' min</div></div>') +
      '<div><div class="k">50% band (predictive)</div><div class="v">' + (row.uncertainty ? fmtUsd(row.uncertainty.p25) + ' \u2013 ' + fmtUsd(row.uncertainty.p75) + ' <small>(' + (row.uncertainty.p75 / row.uncertainty.p25).toFixed(1) + 'x)</small>' : 'n/a') + '</div></div>' +
      '<div><div class="k">80% band (predictive)</div><div class="v">' + (row.uncertainty ? fmtUsd(row.uncertainty.p10) + ' \u2013 ' + fmtUsd(row.uncertainty.p90) + ' <small>(' + (row.uncertainty.p90 / row.uncertainty.p10).toFixed(0) + 'x)</small>' : 'n/a') + '</div></div>' +
      '<div><div class="k">Farm mechanism</div><div class="v">' + esc(row.mechanism || '') + '</div></div>' +
      '</div>' +
      '<h3>How the value is derived</h3>' +
      '<div class="formula">implied = TVL &times; ' + b.mult.toFixed(3) + ' (' + esc(row.category || 'Uncategorised') + ', ' + b.n + ' peer' + (b.n === 1 ? '' : 's') + (b.n < MODEL.minPeers ? ' \u2014 global fallback' : '') + ') &times; ' + b.sizeF.toFixed(3) + ' (size) &times; ' + b.growthMult.toFixed(3) + ' (growth) &times; ' + b.mat.toFixed(3) + ' (maturity) = ' + fmtUsd(row.implied_value_usd) + '</div>' +
      '<div class="wf">' +
      '<div class="step"><div class="op">TVL</div><div class="val">' + fmtUsd(row.tvl_usd) + '</div><div class="lab">the protocol\u2019s locked value</div></div><span class="arr">&times;</span>' +
      '<div class="step"><div class="op">category ' + b.mult.toFixed(3) + 'x</div><div class="val">' + fmtUsd(base) + '</div><div class="lab">shrunk multiple' + (b.n < MODEL.minPeers ? ' (global fallback)' : ' (n=' + b.n + ')') + '</div></div><span class="arr">&times;</span>' +
      '<div class="step"><div class="op">size ' + b.sizeF.toFixed(3) + 'x</div><div class="val">' + fmtUsd(afterSize) + '</div><div class="lab">category median TVL ' + fmtUsd(b.medTvl) + '</div></div><span class="arr">&times;</span>' +
      '<div class="step"><div class="op">growth ' + b.growthMult.toFixed(3) + 'x</div><div class="val">' + fmtUsd(afterGrowth) + '</div><div class="lab">7d ' + fmtPct(b.growth) + '</div></div><span class="arr">&times;</span>' +
      '<div class="step"><div class="op">maturity ' + b.mat.toFixed(3) + 'x</div><div class="val">' + fmtUsd(afterMat) + '</div><div class="lab">' + fmtAge(row.age_days) + ' old</div></div>' +
      '</div>' +
      '<p class="small">Every number above is hand-recomputable from the snapshot: the category median is ' + b.rawMed.toFixed(3) + 'x over ' + b.n + ' live peers, shrunk toward the global ' + FIT.globalMedian.toFixed(3) + 'x with weight ' + (b.n >= MODEL.minPeers ? (b.n / (b.n + MODEL.shrinkK)).toFixed(2) : '0') + '. The fitted size curve is log10(mcap) = ' + FIT.sizeA.toFixed(3) + ' + ' + FIT.sizeB.toFixed(3) + ' x log10(TVL), R\u00b2 = ' + FIT.sizeR2.toFixed(3) + '. The value is shown to 3 significant figures; the model\u2019s median error is x' + DATA.validation.adoptedMedian.toFixed(2) + ', so read it as a yardstick, not a price target.</p>' +
      '<p class="small">The band is a bootstrap predictive interval, not a confidence interval: 200 resamples of the ' + FIT.peerCount + ' peers, refit each time, plus one draw from the leave-one-out residual distribution. On the blind splits the 80% band holds the true market cap ' + (DATA.validation.bands.blindCov80 * 100).toFixed(1) + '% of the time and the 50% band ' + (DATA.validation.bands.blindCov50 * 100).toFixed(1) + '%. On the time split the bands under-cover (' + (DATA.validation.bands.timeCov80 * 100).toFixed(1) + '% / ' + (DATA.validation.bands.timeCov50 * 100).toFixed(1) + '%), so blind calibration does not transfer perfectly to newer listings. The band is wide because the error distribution is heavy-tailed: the median leave-one-out error is x' + DATA.validation.adoptedMedian.toFixed(2) + ' but 1 in 10 peers is off by more than x' + DATA.validation.adoptedP90MaxRatio.toFixed(1) + '.</p>' +
      '<h3>Comps: the peers behind the number</h3>' + compsChart(row) +
      '<p class="small">Nearest live-token peers in the same category (by TVL):</p>' +
      '<table class="plain"><thead><tr><th>Peer</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">MC / TVL</th></tr></thead><tbody>' +
      peers.map(function (q) {
        return '<tr><td>' + esc(q.p.name) + '</td><td class="num">' + fmtUsd(q.p.tvl_usd) + '</td><td class="num">' + fmtUsd(q.p.mcap_usd) + '</td><td class="num">' + fmtMult(q.p.mcap_usd / q.p.tvl_usd) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<h3>Farm plan</h3>' +
      '<div class="verdictbox ' + f.verdict + '"><b>' + f.verdict + '</b> &middot; net expected value <span class="net">' + (f.netEv >= 0 ? '+' : '') + fmtUsd2(f.netEv) + '</span> on $' + f.capital.toLocaleString('en-US') + ' of capital' +
      '<br><span class="small">Hypothetical pool 8% of implied value = ' + fmtUsd(f.pool) + '; your share (pool x $' + f.capital.toLocaleString('en-US') + ' / ' + fmtUsd(row.tvl_usd) + ' TVL) = ' + fmtUsd2(f.share) + '; gas ' + fmtUsd2(f.gasTotal) + ' + opportunity cost ' + fmtUsd2(f.oppCost) + ' = ' + fmtUsd2(f.totalCost) + ' total; share &minus; cost = ' + fmtUsd2(f.netEv) + ' (' + f.netEvRatio.toFixed(2) + 'x the cost). FARM needs at least $40 and 1.5x; THIN needs at least $0.' + robustNote + beNote + '</span></div>' +
      '<ol class="steps">' + row.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="small"><b>Downside:</b> at the band\u2019s low end (p25 ' + (p25 === null ? 'n/a' : fmtUsd(p25)) + ') the pool is ' + (pool25 === null ? 'n/a' : fmtUsd(pool25)) + ', your share ' + (share25 === null ? 'n/a' : fmtUsd2(share25)) + ', the same cost ' + fmtUsd2(f.totalCost) + ', so net EV ' + (netEv25 === null ? 'n/a' : (netEv25 >= 0 ? '+' : '') + fmtUsd2(netEv25)) + '. Judged at the median; this is the low end of the band.</p>' +
      (f.verdict === 'FARM' || f.verdict === 'ROBUST' ? '<p class="small"><b>P10:</b> ' + fmtUsd(p10) + ' net EV ' + (netEv10 >= 0 ? '+' : '') + fmtUsd2(netEv10) + '. Farm only if it clears p10.</p>' : '') +
      '<p class="small"><b>Risk:</b> the implied value is a yardstick, not a price target; the 80% band spans ' + (width80 === null ? 'n/a' : width80.toFixed(0) + 'x') + ', so the token could land far from the median. The airdrop pool is hypothetical (8% of implied value, a stated assumption) \u2014 the snapshot cannot establish that a token or an airdrop will happen. ' + ((f.verdict === 'FARM' || f.verdict === 'ROBUST') ? 'Even a FARM row is a bet on an uncertain launch, not a guaranteed return.' : 'This row does not clear FARM at the median value, and the downside is thinner still.') + '</p>' +
      '<p class="small">Gas at November 2026 typical levels (Ethereum $4.00/tx, L2s $0.30, Solana-class $0.05, Bitcoin L2s $2.00); opportunity cost 4.5% a year on the capital for 90 days. The steps are proposed interactions to verify on the protocol\u2019s own page; nothing here claims a points program, a quest or an airdrop exists. Claim only from a link the protocol itself publishes; never pay to claim.</p>' +
      '</div></div>';
    return h;
  }

  // ---- render ----
  function render() {
    var v = DATA.validation;
    var vc = verdictCounts();
    var warn = '';
    if (recomputeBad > 0 || farmBad > 0) {
      warn = '<div class="warn" id="recompute-warn">Warning: this page recomputed ' + recomputeBad + ' implied values and ' + farmBad + ' farm plans that do not match the board\u2019s data. The screenshots and the code do not agree.</div>';
    }
    var h = '<div class="wrap">' +
      '<header><h1>Tidegauge<span class="dot">.</span></h1>' +
      '<p class="sub">Pre-token protocols, ranked by implied token market capitalisation \u2014 fitted from ' + FIT.peerCount + ' live-token peers, blind-tested against a flat baseline, and costed to the dollar. As of ' + esc(DATA.as_of) + '.</p>' +
      '<div class="kpi"><span>Blind median error <b>x' + v.blindMedian.toFixed(2) + ' vs x' + (v.flatBlindMedian === null ? 'n/a' : v.flatBlindMedian.toFixed(2)) + ' flat</b></span><span><b>' + DATA.board_size + '</b> protocols</span><span><b>' + DATA.watchlist_size + '/' + DATA.watchlist_size + '</b> watchlist</span><span>80% band covers <b>' + (v.bands.blindCov80 * 100).toFixed(0) + '%</b> blind</span><span>LOO median error <b>x' + v.adoptedMedian.toFixed(2) + ' vs x' + (looFlatRow() === null ? 'n/a' : looFlatRow().median.toFixed(2)) + ' flat</b></span><span>LOO within-3x <b>' + (v.adoptedWithin3 === null || v.adoptedWithin3 === undefined ? 'n/a' : v.adoptedWithin3.toFixed(1) + '% (n=' + (v.peerCount || FIT.peerCount) + ')') + '</b></span><span>ROBUST <b>' + vc.ROBUST + '</b> &middot; FARM <b>' + vc.FARM + '</b></span></div></header>' +
      '<nav class="tabs">' +
      '<button data-tab="board"' + (state.tab === 'board' ? ' class="on"' : '') + '>Board</button>' +
      '<button data-tab="live"' + (state.tab === 'live' ? ' class="on"' : '') + '>Live tokens (' + DATA.live_size + ')</button>' +
      '<button data-tab="anchors"' + (state.tab === 'anchors' ? ' class="on"' : '') + '>Traded anchors (' + DATA.peers.length + ')</button>' +
      '<button data-tab="method"' + (state.tab === 'method' ? ' class="on"' : '') + '>How this is priced</button>' +
      '<button data-tab="calibration"' + (state.tab === 'calibration' ? ' class="on"' : '') + '>Model &amp; calibration</button></nav>' +
      warn;
    if (state.tab === 'board') h += boardHtml();
    else if (state.tab === 'live') h += liveHtml();
    else if (state.tab === 'anchors') h += anchorsHtml();
    else if (state.tab === 'calibration') h += calibrationHtml();
    else h += methodHtml();
    h += '<footer><b>Tidegauge</b> \u00b7 model ' + esc(DATA.model_version) + ' \u00b7 snapshot ' + esc(DATA.as_of) + ' \u00b7 coherence Spearman(TVL, implied) ' + v.coherence.toFixed(3) + ' \u00b7 The implied value is the entry\u2019s own claim about what a token would be worth if the protocol\u2019s record stayed as it is; it is not a prediction of whether or when a token launches. A protocol is said to record no token, never that it has none.</footer></div>';
    app.innerHTML = h;
    app.removeAttribute('aria-busy');
    // wire events
    var tabs = app.querySelectorAll('[data-tab]');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function (ev) {
        state.tab = ev.currentTarget.getAttribute('data-tab');
        state.selected = null;
        // Board and anchors sort by different keys; reset when crossing over
        // so a stale key never silently re-sorts the other view.
        var ak = state.sort === 'aratio' || state.sort === 'atvl' || state.sort === 'amcap' || state.sort === 'aimplied' || state.sort === 'aname';
        if (state.tab === 'anchors' && !ak) { state.sort = 'aratio'; state.dir = -1; }
        if (state.tab !== 'anchors' && ak) { state.sort = 'implied'; state.dir = -1; }
        location.hash = '#/' + state.tab;
        render();
      });
    }
    var q = document.getElementById('f-q');
    if (q) q.addEventListener('input', function () { state.q = q.value; renderBoardOnly(); });
    var cat = document.getElementById('f-cat');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value === '' ? '' : cat.value; if (cat.value === 'all') state.category = 'all'; render(); });
    var ch = document.getElementById('f-chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; render(); });
    var vd = document.getElementById('f-verdict');
    if (vd) vd.addEventListener('change', function () { state.verdict = vd.value; render(); });
    var mn = document.getElementById('f-min');
    if (mn) mn.addEventListener('input', function () { state.minImp = mn.value; renderBoardOnly(); });
    var ths = app.querySelectorAll('th[data-sort]');
    for (var j = 0; j < ths.length; j++) {
      ths[j].addEventListener('click', function (ev) {
        var k = ev.currentTarget.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir;
        else { state.sort = k; state.dir = k === 'rank' ? 1 : -1; }
        render();
      });
    }
    var rows = app.querySelectorAll('tbody tr[data-slug]');
    for (var k = 0; k < rows.length; k++) {
      rows[k].addEventListener('click', function (ev) {
        openDetail(ev.currentTarget.getAttribute('data-slug'));
      });
    }
    var close = document.getElementById('d-close');
    if (close) close.addEventListener('click', closeDetail);
    var det = document.querySelector('.detail');
    if (det) det.addEventListener('click', function (ev) { if (ev.target === det) closeDetail(); });
  }
  function renderBoardOnly() {
    // Re-render just the table + count, keeping the filter inputs focused.
    var wrap = app.querySelector('.wrap');
    if (!wrap) { render(); return; }
    var h = boardHtml();
    // boardHtml includes the map; keep the map and replace from the filters down.
    var tmp = document.createElement('div');
    tmp.innerHTML = h;
    var oldFilters = app.querySelector('.filters');
    var oldTable = app.querySelector('table');
    var oldSmall = app.querySelector('p.small');
    if (oldFilters && tmp.querySelector('.filters')) oldFilters.replaceWith(tmp.querySelector('.filters'));
    if (oldTable && tmp.querySelector('table')) oldTable.replaceWith(tmp.querySelector('table'));
    if (oldSmall && tmp.querySelector('p.small')) oldSmall.replaceWith(tmp.querySelector('p.small'));
    wireBoardEvents();
  }
  function wireBoardEvents() {
    var q = document.getElementById('f-q');
    if (q) { q.addEventListener('input', function () { state.q = q.value; renderBoardOnly(); }); }
    var mn = document.getElementById('f-min');
    if (mn) mn.addEventListener('input', function () { state.minImp = mn.value; renderBoardOnly(); });
    var rows = app.querySelectorAll('tbody tr[data-slug]');
    for (var k = 0; k < rows.length; k++) {
      rows[k].addEventListener('click', function (ev) { openDetail(ev.currentTarget.getAttribute('data-slug')); });
    }
  }
  function openDetail(slug) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) { row = DATA.rows[i]; break; }
    if (!row) return;
    state.selected = slug;
    var old = document.querySelector('.detail');
    if (old) old.remove();
    var tmp = document.createElement('div');
    tmp.innerHTML = detailHtml(row);
    document.body.appendChild(tmp.firstChild);
    var close = document.getElementById('d-close');
    if (close) close.addEventListener('click', closeDetail);
    var det = document.querySelector('.detail');
    if (det) det.addEventListener('click', function (ev) { if (ev.target === det) closeDetail(); });
    location.hash = '#/proto/' + slug;
  }
  function closeDetail() {
    var det = document.querySelector('.detail');
    if (det) det.remove();
    state.selected = null;
    if (location.hash.indexOf('#/proto/') === 0) location.hash = '#/board';
  }
  function route() {
    var hash = location.hash || '#/board';
    if (hash.indexOf('#/proto/') === 0) {
      var slug = hash.slice(8);
      state.tab = 'board';
      render();
      openDetail(slug);
      return;
    }
    if (hash === '#/live') state.tab = 'live';
    else if (hash === '#/method') state.tab = 'method';
    else if (hash === '#/calibration') state.tab = 'calibration';
    else if (hash === '#/anchors') state.tab = 'anchors';
    else state.tab = 'board';
    // Same sort reset as the tab click handler, for deep links.
    var ak2 = state.sort === 'aratio' || state.sort === 'atvl' || state.sort === 'amcap' || state.sort === 'aimplied' || state.sort === 'aname';
    if (state.tab === 'anchors' && !ak2) { state.sort = 'aratio'; state.dir = -1; }
    if (state.tab !== 'anchors' && ak2) { state.sort = 'implied'; state.dir = -1; }
    // Close any open detail overlay: it lives on body, render() won't.
    closeDetail();
    // Deep-link a filtered board, e.g. #/board?verdict=FARM.
    var vm = hash.match(/verdict=(ROBUST|FARM|THIN|SKIP)/);
    if (vm) state.verdict = vm[1];
    render();
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeDetail(); });
  route();
})();
