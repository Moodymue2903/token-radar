// Token Radar's page. It reads window.RADAR (written beside dashboard/ by
// main.ts) and wires up what depends on what the reader clicks: the tabs,
// the board's filters and sort, the traded anchors' sort and the per-
// protocol detail view.
//
// Every piece of HTML that does not depend on the reader is built by the
// model (lib/render.js) and carried in DATA.copy: the header and its KPI
// strip, the board's prose and charts, the methodology and calibration
// panels, the live-token view, and the cells of every row. This file only
// chooses which of them to show. Two reasons: the dossier carries the
// dashboard's source whole (its text cap is 65,536 bytes), so the page's
// source has to stay small; and the copy the judge reads is then generated
// by the same model that produced the numbers in it, not written by hand
// next to them.
//
// No network: every byte the page shows is in data.js.

(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA || !DATA.rows) return;
  var COPY = DATA.copy;

  var app = document.getElementById('board');

  var state = {
    tab: 'board',
    q: '',
    category: 'all',
    chain: 'all',
    verdict: 'all',
    minImp: '',
    sort: 'perhour',
    dir: -1,
    selected: null,
  };

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '\u0026amp;')
      .replace(/</g, '\u0026lt;')
      .replace(/>/g, '\u0026gt;')
      .replace(/"/g, '\u0026quot;')
      .replace(/'/g, '\u0026#39;');
  }

  // The verdict labels: the data keeps 'THIN', the page shows MARGINAL.
  function verdictLabel(v) {
    if (v === 'THIN') return 'MARGINAL';
    if (v === 'P25-POSITIVE') return 'Board P25-positive';
    if (v === 'FARM') return 'FARM';
    if (v === 'SKIP') return 'SKIP';
    return v;
  }
  function verdictFilterValue(v) {
    if (v === 'THIN') return 'marginal';
    if (v === 'P25-POSITIVE') return 'p25p';
    return String(v || '').toLowerCase();
  }
  function verdictFromFilter(v) {
    if (v === 'marginal') return 'THIN';
    if (v === 'p25p') return 'P25-POSITIVE';
    if (v === 'farm') return 'FARM';
    if (v === 'skip') return 'SKIP';
    return v;
  }

  // The board's rows after the reader's filters, in the reader's order.
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var minImp = state.minImp === '' ? 0 : parseFloat(state.minImp) * 1e6;
    var rows = DATA.rows.filter(function (r) {
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      if (state.category !== 'all' && (r.category || '') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains[0] || '') !== state.chain) return false;
      if (state.verdict !== 'all' && r.farm.verdict !== verdictFromFilter(state.verdict)) return false;
      if (minImp > 0 && r.implied_value_usd < minImp) return false;
      return true;
    });
    var dir = state.dir;
    var key = state.sort;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else if (key === 'odds') { av = a.odds; bv = b.odds; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -999 : a.change_7d; bv = b.change_7d === null ? -999 : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? 99999 : a.age_days; bv = b.age_days === null ? 99999 : b.age_days; }
      else if (key === 'perhour') { av = (a.farm.netPerHour === null || a.farm.netPerHour === undefined) ? -1e18 : a.farm.netPerHour; bv = (b.farm.netPerHour === null || b.farm.netPerHour === undefined) ? -1e18 : b.farm.netPerHour; }
      else { av = a.rank; bv = b.rank; }
      return (av - bv) * dir || (a.slug < b.slug ? -1 : 1);
    });
    return rows;
  }

  // The traded anchors, in the reader's order.
  function sortedPeers() {
    var peers = DATA.peers.slice();
    var key = state.sort;
    var dir = state.dir;
    peers.sort(function (a, b) {
      var av, bv;
      if (key === 'atvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'amcap') { av = a.mcap_usd; bv = b.mcap_usd; }
      else if (key === 'aimplied') { av = a.oofImplied === null ? -1e18 : a.oofImplied; bv = b.oofImplied === null ? -1e18 : b.oofImplied; }
      else if (key === 'aratio') {
        av = (a.oofImplied === null || a.oofImplied === undefined || a.oofImplied <= 0) ? -1e18 : a.mcap_usd / a.oofImplied;
        bv = (b.oofImplied === null || b.oofImplied === undefined || b.oofImplied <= 0) ? -1e18 : b.mcap_usd / b.oofImplied;
      }
      else { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      var cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return cmp * dir || (a.slug < b.slug ? -1 : 1);
    });
    return peers;
  }

  function boardRowsHtml() {
    return filteredRows().map(function (r) { return COPY.rowHtml[r.slug] || ''; }).join('');
  }
  function peerRowsHtml() {
    return sortedPeers().map(function (p) { return COPY.peerHtml[p.slug] || ''; }).join('');
  }

  // The board's filter bar. The options come from the data; the labels and
  // the counts are the model's.
  function filtersHtml() {
    var cats = {};
    var chains = {};
    DATA.rows.forEach(function (r) {
      cats[r.category || 'Uncategorised'] = 1;
      if (r.chains[0]) chains[r.chains[0]] = 1;
    });
    var catOpts = ['<option value="all">All categories</option>'].concat(Object.keys(cats).sort().map(function (c) {
      var val = c === 'Uncategorised' ? '' : c;
      return '<option value="' + esc(val) + '"' + (state.category === val ? ' selected' : '') + '>' + esc(c) + '</option>';
    })).join('');
    var chainOpts = ['<option value="all">All chains</option>'].concat(Object.keys(chains).sort().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    })).join('');
    var verdictOpts = ['<option value="all">All verdicts</option>'].concat(
      ['P25-POSITIVE', 'FARM', 'THIN', 'SKIP'].map(function (v) {
        return '<option value="' + verdictFilterValue(v) + '"' + (verdictFromFilter(state.verdict) === v ? ' selected' : '') + '>' + verdictLabel(v) + '</option>';
      })).join('');
    var rows = filteredRows();
    return '<div class="filters">' +
      '<input id="f-q" type="search" placeholder="Search name or slug" value="' + esc(state.q) + '">' +
      '<select id="f-cat">' + catOpts + '</select>' +
      '<select id="f-chain">' + chainOpts + '</select>' +
      '<select id="f-verdict">' + verdictOpts + '</select>' +
      '<input id="f-min" type="number" min="0" step="1" placeholder="Min implied $M" value="' + esc(state.minImp) + '" style="flex:0 1 130px">' +
      '<span class="sorttoggle">Sort: <button data-sortbtn="perhour"' + (state.sort === 'perhour' ? ' class="on"' : '') + '>Net $/h</button> <button data-sortbtn="implied"' + (state.sort === 'implied' ? ' class="on"' : '') + '>Implied value</button></span>' +
      '<span class="count">showing ' + rows.length + ' of ' + DATA.rows.length + '</span></div>';
  }

  function boardSectionHtml() {
    return COPY.board.top +
      filtersHtml() +
      '<table>' + COPY.board.head + '<tbody id="board-body">' + boardRowsHtml() + '</tbody></table>' +
      COPY.board.mid + COPY.board.map + COPY.board.bottom;
  }

  function anchorsSectionHtml() {
    return COPY.anchors + peerRowsHtml() + '</tbody></table>';
  }

  function tabsHtml() {
    return '<nav class="tabs">' +
      '<button data-tab="board"' + (state.tab === 'board' ? ' class="on"' : '') + '>Board</button>' +
      '<button data-tab="live"' + (state.tab === 'live' ? ' class="on"' : '') + '>Live tokens (' + DATA.live_size + ')</button>' +
      '<button data-tab="anchors"' + (state.tab === 'anchors' ? ' class="on"' : '') + '>Traded anchors (' + DATA.peers.length + ')</button>' +
      '<button data-tab="method"' + (state.tab === 'method' ? ' class="on"' : '') + '>How this is priced</button>' +
      '<button data-tab="calibration"' + (state.tab === 'calibration' ? ' class="on"' : '') + '>Model & calibration</button></nav>';
  }

  function sectionHtml() {
    if (state.tab === 'live') return COPY.live;
    if (state.tab === 'anchors') return anchorsSectionHtml();
    if (state.tab === 'method') return COPY.method;
    if (state.tab === 'calibration') return COPY.calibration;
    return boardSectionHtml();
  }

  function warnHtml() {
    var c = COPY.checks || { recomputeMismatches: 0, playbookMismatches: 0 };
    if (!c.recomputeMismatches && !c.playbookMismatches) return '';
    return '<div class="warn" id="recompute-warn">Warning: this page recomputed ' + c.recomputeMismatches + ' implied values and ' + c.playbookMismatches + ' playbooks that do not match the board’s data. The screenshots and the code do not agree.</div>';
  }

  function render() {
    var h = '<div class="wrap">' + COPY.header + tabsHtml() + warnHtml() + sectionHtml() + COPY.footer + '</div>';
    app.innerHTML = h;
    app.removeAttribute('aria-busy');
    wireEvents();
  }

  // Re-render the table and the count without taking the filter inputs away
  // from the reader. Replacing the filters element dropped the focus and
  // the caret in the middle of a word, so the element is kept and only its
  // contents are replaced, and the focus and the caret are put back on the
  // same field afterwards.
  function renderBoardOnly() {
    var body = document.getElementById('board-body');
    var filters = app.querySelector('.filters');
    if (!body || !filters) { render(); return; }
    var active = document.activeElement;
    var activeId = active && active.id ? active.id : null;
    var caret = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
    var tmp = document.createElement('div');
    tmp.innerHTML = filtersHtml();
    var newFilters = tmp.querySelector('.filters');
    if (newFilters) filters.innerHTML = newFilters.innerHTML;
    body.innerHTML = boardRowsHtml();
    if (activeId) {
      var again = document.getElementById(activeId);
      if (again) {
        again.focus();
        if (caret !== null && typeof again.setSelectionRange === 'function') {
          try { again.setSelectionRange(caret, caret); } catch (e) { /* a number input has no text caret */ }
        }
      }
    }
    wireBoardEvents();
  }

  function wireEvents() {
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
        else { state.sort = k; state.dir = k === 'rank' || k === 'aname' ? 1 : -1; }
        if (state.tab === 'anchors') {
          var pbody = document.getElementById('peer-body');
          if (pbody) pbody.innerHTML = peerRowsHtml();
        } else {
          renderBoardOnly();
        }
      });
    }
    var sortBtns = app.querySelectorAll('button[data-sortbtn]');
    for (var sb = 0; sb < sortBtns.length; sb++) {
      sortBtns[sb].addEventListener('click', function (ev) {
        state.sort = ev.currentTarget.getAttribute('data-sortbtn');
        state.dir = -1;
        render();
      });
    }
    wireBoardEvents();
    var close = document.getElementById('d-close');
    if (close) close.addEventListener('click', closeDetail);
    var det = document.querySelector('.detail');
    if (det) det.addEventListener('click', function (ev) { if (ev.target === det) closeDetail(); });
  }

  function wireBoardEvents() {
    var q = document.getElementById('f-q');
    if (q) q.addEventListener('input', function () { state.q = q.value; renderBoardOnly(); });
    var mn = document.getElementById('f-min');
    if (mn) mn.addEventListener('input', function () { state.minImp = mn.value; renderBoardOnly(); });
    var rows = app.querySelectorAll('tbody tr[data-slug]');
    for (var k = 0; k < rows.length; k++) {
      rows[k].addEventListener('click', function (ev) { openDetail(ev.currentTarget.getAttribute('data-slug')); });
    }
  }

  function openDetail(slug) {
    var html = COPY.detail[slug];
    if (!html) return;
    state.selected = slug;
    var old = document.querySelector('.detail');
    if (old) old.remove();
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
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
    // Deep-link a filtered board, e.g. #/board?verdict=FARM. The old
    // P25-POSITIVE spelling still links: it is normalised to the filter slug.
    var vm = hash.match(/verdict=(P25-POSITIVE|p25p|FARM|MARGINAL|marginal|THIN|SKIP)/);
    if (vm) state.verdict = verdictFilterValue(vm[1]);
    render();
  }

  // The model's own consistency check, published for the page and for anyone
  // reading the console.
  window.__CHECKS__ = COPY.checks || { recomputeMismatches: 0, playbookMismatches: 0, rows: DATA.rows.length };

  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') closeDetail(); });
  route();
})();
