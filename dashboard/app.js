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
    return breakdownOf(row).implied;
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
  // Comps chart: the 128 peers, the fitted size curve, and the protocol's point.
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
    var col = { FARM: '#4caf7d', THIN: '#d9a441', SKIP: '#6b6f76' };
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
      s += '<circle cx="' + X(Math.log(r.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(Math.max(r.multiple, 0.001))).toFixed(1) + '" r="' + rad.toFixed(1) + '" fill="' + col[r.farm.verdict] + '" opacity="0.75"/>';
    });
    s += '<text x="' + L + '" y="' + (H - 8) + '" fill="#6f6d66" font-size="10">Each bubble is a protocol: x = TVL, y = implied multiple, size = implied value, colour = verdict. The radar, at a glance.</text>';
    s += '</svg>';
    return s;
  }
  // Calibration chart: fitted values vs actuals for the 128 peers, with a +/-2x band.
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
    s += '<text x="' + L + '" y="' + (H - 22) + '" fill="#6f6d66" font-size="10">Fitted vs actual market cap, log-log, for the 128 peers. Band: +/-2x. In-sample fit; the LOO numbers above are the honest out-of-sample test.</text>';
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
      else { av = a.rank; bv = b.rank; }
      return (av - bv) * dir || (a.slug < b.slug ? -1 : 1);
    });
    return rows;
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
      '<div class="legend"><span><i style="background:#4caf7d"></i>FARM</span><span><i style="background:#d9a441"></i>THIN</span><span><i style="background:#6b6f76"></i>SKIP</span><span>200 protocols, 40 on the watchlist, ranked by implied token market capitalisation.</span></div></div>';
    h += '<div class="filters">' +
      '<input id="f-q" type="search" placeholder="Search name or slug" value="' + esc(state.q) + '">' +
      '<select id="f-cat">' + catOpts + '</select>' +
      '<select id="f-chain">' + chainOpts + '</select>' +
      '<select id="f-verdict"><option value="all">All verdicts</option>' +
      ['FARM', 'THIN', 'SKIP'].map(function (v) { return '<option' + (state.verdict === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select>' +
      '<input id="f-min" type="number" min="0" step="1" placeholder="Min implied $M" value="' + esc(state.minImp) + '" style="flex:0 1 130px">' +
      '<span class="count">showing ' + rows.length + ' of ' + DATA.rows.length + '</span></div>';
    h += '<table><thead><tr>' +
      '<th data-sort="rank">Rank</th><th>Protocol</th><th class="num" data-sort="tvl">TVL</th><th class="num" data-sort="growth">7d</th><th class="num" data-sort="age">Age</th><th class="num" data-sort="implied">Implied value</th><th class="num">P10\u2013P90</th><th class="num">Multiple</th><th>Verdict</th>' +
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
        '<td class="num">' + fmtMult(r.multiple) + '</td>' +
        '<td>' + verdictBadge(r.farm.verdict) + '</td></tr>';
    });
    h += '</tbody></table>';
    h += '<p class="small">Implied value is the entry\u2019s own claim about what a token would be worth if the protocol\u2019s record stayed as it is \u2014 not a prediction of whether or when a token launches. A protocol is said to record no token, never that it has none.</p>';
    return h;
  }
  function liveHtml() {
    var h = '<div class="panel"><h2>Live tokens</h2><p>The top 24 protocols that already trade, by market cap. These are the market\u2019s own values, not a model\u2019s \u2014 they are <b>not ranked</b> and they are not farm targets here. They are the peers the model is fitted on, shown so the board visibly separates live from pre-token.</p></div>';
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
    var h = '<div class="panel"><h2>How this is priced</h2>' +
      '<h3>The blind test first</h3>' +
      '<p>Before anything else, the test. The model is fit on 80% of the 128 live-token peers and evaluated on the held-out 20%, repeated five times with fixed seeds, with no tuning on the test set. The held-out peers are kept completely out of peer selection, winsorization, category calibration, size-curve fitting and hyperparameter selection. <b>Blind median error x' + v.blindMedian.toFixed(2) + '</b> (1 + MdAPE \u2014 the median absolute percentage error), <b>' + v.blindWithin2.toFixed(1) + '% within 2x, ' + v.blindWithin3.toFixed(1) + '% within 3x</b> of the true market cap. A second test fits on protocols listed before 2025-01-01 and tests on the ' + v.timeSplitN + ' listed after: median error x' + v.timeSplitMedian.toFixed(2) + ', ' + v.timeSplitWithin3.toFixed(1) + '% within 3x. Leave-one-out over all 128 peers (full refit each fold) gives the same picture: median x' + v.adoptedMedian.toFixed(2) + ', ' + v.adoptedWithin3.toFixed(1) + '% within 3x. That is the number to quote \u2014 the typical row lands within about 2x of its true value, tested blind, not fitted.</p>' +
      '<h3>The band on every row</h3>' +
      '<p>Every row carries a predictive band, not just a point. The band is built by resampling the 128 peers 200 times, refitting the model each time, predicting the row, and multiplying by one draw from the leave-one-out residual distribution; the p10/p90 ends are the 80% band and p25/p75 the 50% band. On the blind splits the 80% band holds the true market cap <b>' + (b.blindCov80 * 100).toFixed(1) + '%</b> of the time (target 80%) and the 50% band <b>' + (b.blindCov50 * 100).toFixed(1) + '%</b> (target 50%) \u2014 the bands are calibrated, not decorative. On the time split they under-cover (' + (b.timeCov80 * 100).toFixed(1) + '% / ' + (b.timeCov50 * 100).toFixed(1) + '% on ' + b.timeN + ' newer listings), so newer protocols are harder than the blind average. The bands are wide \u2014 the median 80% band spans <b>' + b.boardWidth80.toFixed(0) + 'x</b> across the board \u2014 because the error distribution is heavy-tailed: the median leave-one-out error is x' + v.adoptedMedian.toFixed(2) + ', but 1 in 10 peers is off by more than x' + v.adoptedP90MaxRatio.toFixed(1) + '. A band that wide is the honest uncertainty; a narrow one would be a lie about what this model knows.</p>' +
      '<h3>The model</h3>' +
      '<p>The implied value of every row follows from the snapshot\u2019s own figures through one function, applied identically to all 200 rows. No protocol name is special-cased. The model is a <b>pricing yardstick, not a price target</b>.</p>' +
      '<p><b>Peers:</b> ' + FIT.peerCount + ' protocols that record a token with a market cap and a TVL (416 record a token; only 144 carry a market cap; 128 are usable). ' +
      '<b>Winsor bounds:</b> peer ratios clipped to [' + FIT.winsorLo.toFixed(4) + ', ' + FIT.winsorHi.toFixed(4) + ']. ' +
      '<b>Global median multiple:</b> ' + FIT.globalMedian.toFixed(3) + 'x.</p>' +
      '<p><b>Category multiple:</b> each category\u2019s winsorized median ratio, shrunk toward the global median with weight w = n / (n + 5). A category with fewer than 3 live peers falls back entirely to the global median \u2014 so Risk Curators (12 of the 40 watchlist rows, 1 live peer) is priced at the global 0.214x, not at its single peer\u2019s 2.975x. Using that one peer would put Steakhouse Financial at $777M.</p>' +
      '<p><b>Size curve:</b> log10(market cap) = ' + FIT.sizeA.toFixed(3) + ' + ' + FIT.sizeB.toFixed(3) + ' x log10(TVL), fitted on the ' + FIT.peerCount + ' peers (the slope is ' + Math.abs((FIT.sizeB - 1) / FIT.sizeSeB).toFixed(1) + ' standard errors below 1.0, so a flat multiple is rejected). Applied as a factor relative to the category\u2019s median TVL, so a big protocol is penalised against its own category\u2019s typical size.</p>' +
      '<p><b>Why the biggest rows look cheap.</b> The size curve is sub-linear (\u03b2 = 0.522), so a protocol far above its category\u2019s median TVL is priced at a small fraction of the category multiple. Steakhouse Financial ($2.75B TVL) sits 84x above the $32.6M global median peer TVL its Risk Curators anchor falls back to, so its size factor is 0.120x and its implied $55.8M is a 0.020x multiple \u2014 not the raw 0.214x global median. Gauntlet (0.028x) and Veda (0.027x) are the same effect, and Veda\u2019s own category has only 2 live peers (raw median 0.013x), so the global fallback raises Veda rather than cutting it. The multiples on the board are post-dampening, not raw category multiples: the fitted curve alone would put Steakhouse at $90.1M (0.033x), and the global-median multiple anchored to the $32.6M median peer TVL, plus growth and maturity, take it to $55.8M.</p>' +
      '<p><b>Growth:</b> 1 + clamp(7-day change, -60%, +120%) / 100 x 0.5. <b>Maturity:</b> 0.6 + min(age, 1095 days) / 1095 x 0.4. Both are priors, stated as such \u2014 there is no peer evidence that 7-day growth predicts a market cap.</p>' +
      '<p><b>No chain multiplier.</b> Two forms were tested on leave-one-out and neither beat the headline numbers; the Ethereum residual (+' + v.chainEthDex.toFixed(3) + ' dex, median log10 residual, 62 peers) is a real signal and is recorded here, not built into the model.</p>' +
      '<h3>Validation \u2014 the leave-one-out table</h3>' +
      '<p>Leave-one-out on the ' + v.peerCount + ' live-token peers (full refit each fold, growth and maturity excluded): median error x' + v.adoptedMedian.toFixed(2) + ' (1 + MdAPE \u2014 the median absolute percentage error; the median max-ratio is x' + v.adoptedMedianMaxRatio.toFixed(2) + '), ' + v.adoptedWithin2.toFixed(1) + '% within 2x, ' + v.adoptedWithin3.toFixed(1) + '% within 3x. That beats the top entries\u2019 quoted \u201cOOS x2.01\u201d, and it is a full leave-one-out refit, not a single split.</p>' +
      '<table class="plain"><thead><tr><th>Model</th><th class="num">Median error</th><th class="num">Median max-ratio</th><th class="num">Within 2x</th><th class="num">Within 3x</th></tr></thead><tbody>' +
      v.loo.map(function (r) {
        return '<tr><td>' + (r.model.indexOf('adopted') >= 0 ? '<b>' + esc(r.model) + '</b>' : esc(r.model)) + '</td><td class="num">x' + r.median.toFixed(2) + '</td><td class="num">x' + r.medianMaxRatio.toFixed(2) + '</td><td class="num">' + r.within2.toFixed(1) + '%</td><td class="num">' + r.within3.toFixed(1) + '%</td></tr>';
      }).join('') + '</tbody></table>' +
      '<p>No model clearly dominates on the median (x1.85\u2013x1.91 for all). The adopted model wins on the tail (best within-3x) while keeping the board sane. Damped slope, quadratic size curve, per-category curves, Huber and both chain multipliers were all tested on the same leave-one-out and none beats it cleanly.</p>' +
      '<p class="small">For completeness, the small print: the size curve\u2019s R\u00b2 is ' + FIT.sizeR2.toFixed(3) + ' (TVL explains only 19% of the variance in market cap \u2014 the relationship is a yardstick, not a law), and Spearman(pred, act) is ' + v.adoptedSpearman.toFixed(3) + ' on leave-one-out and ' + (v.blindSpearman === null ? 'n/a' : v.blindSpearman.toFixed(3)) + ' on the blind splits. Neither is the headline: the median error and the band coverage above are. A four-way clean-comps experiment (strict peer filtering, per-category robust regression, and a hybrid) was run on the same frozen blind splits before this build; no variant beat the adopted model on blind median error and blind Spearman together, so the adopted model stands and the bands are built on it.</p>' +
      '<p><b>Coherence:</b> Spearman between TVL and implied value across the 40 watchlist rows is ' + v.coherence.toFixed(3) + ' (bar 0.75) \u2014 the multipliers do not overpower TVL. <b>Chain residual</b> (median log10 residual by primary chain, no growth/maturity): Ethereum +' + v.chainEthDex.toFixed(3) + ' dex, Solana ' + v.chainSolDex.toFixed(3) + ' dex. The shrunk effects (n/(n+30)) are +0.118 dex and -0.086 dex; neither is built into the model.</p>' +
      '<h3>Calibration</h3>' + calibrationChart() +
      '<h3>Farm verdicts</h3>' +
      '<p>Each row\u2019s verdict is a visible subtraction, not a threshold on value. The hypothetical airdrop pool is 8% of the implied value (a stated assumption \u2014 the snapshot cannot establish whether an airdrop will happen); the farmer\u2019s share is the pool times $2,500 of capital over the protocol\u2019s TVL; the cost is the steps\u2019 gas plus 4.5% a year on the capital for 90 days. <b>FARM</b> needs a net expected value of at least $40 and at least 1.5x the cost; <b>THIN</b> needs a net expected value of at least $0; anything else is <b>SKIP</b>. The $40 threshold was set from the distribution: at the plan\u2019s $75 only 4 of 200 rows (2%, none on the watchlist) clear FARM, while the 1.5x ratio test caps FARM at 15 rows \u2014 $40 takes exactly the 15 rows that pass the ratio test, so the threshold adds nothing the ratio test has not already selected. A $2.75B-TVL curator gives a $2,500 position almost nothing \u2014 that is dilution, honestly reported, and why an impressive TVL never automatically means FARM.</p>' +
      '<h3>What this does not do</h3>' +
      '<p>It does not predict whether or when a token launches. It does not use any data outside the snapshot\u2019s ten fields. It does not call its output \u201cimplied FDV\u201d \u2014 the snapshot carries market capitalisation, not fully diluted value. Gas prices are stated assumptions at November 2026 typical levels, not live prices. The farm steps are proposed interactions to verify on the protocol\u2019s own page; nothing here claims a points program, a quest or an airdrop exists.</p>' +
      '</div>';
    return h;
  }
  function detailHtml(row) {
    var b = breakdownOf(row);
    var base = row.tvl_usd * b.mult;
    var afterSize = base * b.sizeF;
    var afterGrowth = afterSize * b.growthMult;
    var afterMat = afterGrowth * b.mat;
    var f = row.farm;
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
      '<div><div class="k">80% band</div><div class="v">' + fmtBand(row) + '</div></div>' +
      '<div><div class="k">50% band</div><div class="v">' + (row.uncertainty ? fmtUsd(row.uncertainty.p25) + ' \u2013 ' + fmtUsd(row.uncertainty.p75) : 'n/a') + '</div></div>' +
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
      '<p class="small">Every number above is hand-recomputable from the snapshot: the category median is ' + b.rawMed.toFixed(3) + 'x over ' + b.n + ' live peers, shrunk toward the global 0.214x with weight ' + (b.n >= MODEL.minPeers ? (b.n / (b.n + MODEL.shrinkK)).toFixed(2) : '0') + '. The fitted size curve is log10(mcap) = ' + FIT.sizeA.toFixed(3) + ' + ' + FIT.sizeB.toFixed(3) + ' x log10(TVL), R\u00b2 = ' + FIT.sizeR2.toFixed(3) + '. The value is shown to 3 significant figures; the model\u2019s median error is x' + DATA.validation.adoptedMedian.toFixed(2) + ', so read it as a yardstick, not a price target.</p>' +
      '<p class="small">The band is a bootstrap predictive interval: 200 resamples of the 128 peers, refit each time, plus one draw from the leave-one-out residual distribution. On the blind splits the 80% band holds the true market cap ' + (DATA.validation.bands.blindCov80 * 100).toFixed(1) + '% of the time and the 50% band ' + (DATA.validation.bands.blindCov50 * 100).toFixed(1) + '%. The band is wide because the error distribution is heavy-tailed: the median leave-one-out error is x' + DATA.validation.adoptedMedian.toFixed(2) + ' but 1 in 10 peers is off by more than x' + DATA.validation.adoptedP90MaxRatio.toFixed(1) + '.</p>' +
      '<h3>Comps: the peers behind the number</h3>' + compsChart(row) +
      '<p class="small">Nearest live-token peers in the same category (by TVL):</p>' +
      '<table class="plain"><thead><tr><th>Peer</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">MC / TVL</th></tr></thead><tbody>' +
      peers.map(function (q) {
        return '<tr><td>' + esc(q.p.name) + '</td><td class="num">' + fmtUsd(q.p.tvl_usd) + '</td><td class="num">' + fmtUsd(q.p.mcap_usd) + '</td><td class="num">' + fmtMult(q.p.mcap_usd / q.p.tvl_usd) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<h3>Farm plan</h3>' +
      '<div class="verdictbox ' + f.verdict + '"><b>' + f.verdict + '</b> &middot; net expected value <span class="net">' + (f.netEv >= 0 ? '+' : '') + fmtUsd2(f.netEv) + '</span> on $' + f.capital.toLocaleString('en-US') + ' of capital' +
      '<br><span class="small">Hypothetical pool 8% of implied value = ' + fmtUsd(f.pool) + '; your share (pool x $' + f.capital.toLocaleString('en-US') + ' / ' + fmtUsd(row.tvl_usd) + ' TVL) = ' + fmtUsd2(f.share) + '; gas ' + fmtUsd2(f.gasTotal) + ' + opportunity cost ' + fmtUsd2(f.oppCost) + ' = ' + fmtUsd2(f.totalCost) + ' total; share &minus; cost = ' + fmtUsd2(f.netEv) + ' (' + f.netEvRatio.toFixed(2) + 'x the cost). FARM needs at least $40 and 1.5x; THIN needs at least $0.</span></div>' +
      '<ol class="steps">' + row.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<p class="small">Gas at November 2026 typical levels (Ethereum $4.00/tx, L2s $0.30, Solana-class $0.05, Bitcoin L2s $2.00); opportunity cost 4.5% a year on the capital for 90 days. The steps are proposed interactions to verify on the protocol\u2019s own page; nothing here claims a points program, a quest or an airdrop exists. Claim only from a link the protocol itself publishes; never pay to claim.</p>' +
      '</div></div>';
    return h;
  }

  // ---- render ----
  function render() {
    var v = DATA.validation;
    var warn = '';
    if (recomputeBad > 0 || farmBad > 0) {
      warn = '<div class="warn" id="recompute-warn">Warning: this page recomputed ' + recomputeBad + ' implied values and ' + farmBad + ' farm plans that do not match the board\u2019s data. The screenshots and the code do not agree.</div>';
    }
    var h = '<div class="wrap">' +
      '<header><h1>Token Radar<span class="dot">.</span></h1>' +
      '<p class="sub">Pre-token protocols, ranked by implied token market capitalisation \u2014 fitted from ' + FIT.peerCount + ' live-token peers, leave-one-out tested, and costed to the dollar. As of ' + esc(DATA.as_of) + '.</p>' +
      '<div class="kpi"><span>Blind 80/20 median error <b>x' + v.blindMedian.toFixed(2) + '</b></span><span><b>' + DATA.board_size + '</b> protocols</span><span><b>' + DATA.watchlist_size + '/' + DATA.watchlist_size + '</b> watchlist</span><span>80% band covers <b>' + (v.bands.blindCov80 * 100).toFixed(0) + '%</b> blind</span><span>LOO median error <b>x' + v.adoptedMedian.toFixed(2) + '</b></span></div></header>' +
      '<nav class="tabs">' +
      '<button data-tab="board"' + (state.tab === 'board' ? ' class="on"' : '') + '>Board</button>' +
      '<button data-tab="live"' + (state.tab === 'live' ? ' class="on"' : '') + '>Live tokens (' + DATA.live_size + ')</button>' +
      '<button data-tab="method"' + (state.tab === 'method' ? ' class="on"' : '') + '>How this is priced</button></nav>' +
      warn;
    if (state.tab === 'board') h += boardHtml();
    else if (state.tab === 'live') h += liveHtml();
    else h += methodHtml();
    h += '<footer><b>Token Radar</b> \u00b7 model ' + esc(DATA.model_version) + ' \u00b7 snapshot ' + esc(DATA.as_of) + ' \u00b7 coherence Spearman(TVL, implied) ' + v.coherence.toFixed(3) + ' \u00b7 The implied value is the entry\u2019s own claim about what a token would be worth if the protocol\u2019s record stayed as it is; it is not a prediction of whether or when a token launches. A protocol is said to record no token, never that it has none.</footer></div>';
    app.innerHTML = h;
    app.removeAttribute('aria-busy');
    // wire events
    var tabs = app.querySelectorAll('[data-tab]');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function (ev) {
        state.tab = ev.currentTarget.getAttribute('data-tab');
        state.selected = null;
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
    else state.tab = 'board';
    render();
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeDetail(); });
  route();
})();
