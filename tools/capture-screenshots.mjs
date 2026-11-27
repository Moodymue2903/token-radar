// Re-capture the dashboard's PNGs from the sealed snapshot.
//
//   node tools/capture-screenshots.mjs --input ../input/snapshot.json
//
// Builds the dashboard from the snapshot into a temp folder, serves it on
// localhost, drives headless Chrome over the DevTools protocol with the
// viewport pinned to exactly 1024x1024, and writes four PNGs into
// screenshots/: the board cover, a protocol detail view, the calibration
// tab and the ranked table. Zero dependencies: Node 22's global fetch and
// WebSocket do the work.
//
// The snapshot is the sealed input and is never written into the repo. If it
// is missing the script says where to drop it and stops.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const SHOT_MAX_BYTES = 524_288;

function arg(name, fallback) {
  const at = process.argv.indexOf('--' + name);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1];
  return fallback;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// The sealed snapshot: --input first, then the usual mounts.
function findSnapshot() {
  const tried = [];
  const candidates = [
    arg('input', null),
    resolve(here, '..', 'input', 'snapshot.json'),
    resolve(here, 'input', 'snapshot.json'),
    '/input/snapshot.json',
  ].filter(Boolean);
  for (const c of candidates) {
    const path = resolve(c);
    tried.push(path);
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  process.stderr.write(
    'token radar: no sealed snapshot found. Drop it at one of:\n' +
      tried.map((p) => '  ' + p).join('\n') + '\n' +
      'then run: node tools/capture-screenshots.mjs\n');
  process.exit(2);
}

// Chrome: the usual install paths, in order.
function findChrome() {
  const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const candidates = [];
  for (const root of roots) candidates.push(join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  for (const c of candidates) if (existsSync(c)) return c;
  process.stderr.write('token radar: no chrome.exe found. Set CHROME=<path to chrome.exe>.\n');
  process.exit(2);
}

const snapshotFile = findSnapshot();
const chrome = process.env.CHROME || findChrome();
const shotsDir = join(here, 'screenshots');
const buildDir = mkdtempSync(join(tmpdir(), 'token-radar-build-'));

function mime(file) {
  const t = extname(file);
  if (t === '.html') return 'text/html; charset=utf-8';
  if (t === '.css') return 'text/css; charset=utf-8';
  if (t === '.js') return 'text/javascript; charset=utf-8';
  if (t === '.json') return 'application/json; charset=utf-8';
  if (t === '.png') return 'image/png';
  return 'application/octet-stream';
}

function serve(root) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    const file = join(root, path.endsWith('/') ? path + 'index.html' : path);
    if (!resolve(file).startsWith(resolve(root)) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': mime(file) });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

function build() {
  return new Promise((ok, no) => {
    const child = spawn(process.execPath, [join(here, 'main.ts'), '--input', snapshotFile, '--output', buildDir], {
      cwd: here, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => {
      if (code === 0) ok(out.trim());
      else no(new Error('the build failed (' + code + '):\n' + (err.trim() || out.trim())));
    });
  });
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (!msg.id || !this.pending.has(msg.id)) return;
      const { resolve: done, reject: fail } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) fail(new Error(msg.error.message));
      else done(msg.result);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

(async () => {
  const buildLog = await build();
  process.stdout.write(buildLog + '\n');

  const server = await serve(buildDir);
  const port = server.address().port;
  const page = 'http://127.0.0.1:' + port + '/dashboard/index.html';

  const profile = mkdtempSync(join(tmpdir(), 'cdp-prof-'));
  const debugPort = 9700 + Math.floor(Math.random() * 400);
  const child = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--remote-allow-origins=*',
    '--remote-debugging-port=' + debugPort,
    '--user-data-dir=' + profile,
    '--window-size=1024,1024',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  const cleanup = () => {
    try { child.kill(); } catch { /* ignore */ }
    try { server.close(); } catch { /* ignore */ }
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
  };

  try {
    let wsUrl = null;
    for (let i = 0; i < 150 && wsUrl === null; i++) {
      try {
        const res = await fetch('http://127.0.0.1:' + debugPort + '/json/version');
        if (res.ok) {
          const j = await res.json();
          if (j.webSocketDebuggerUrl) wsUrl = j.webSocketDebuggerUrl;
        }
      } catch { /* not up yet */ }
      if (wsUrl === null) await sleep(100);
    }
    if (wsUrl === null) throw new Error('chrome did not open a debugging port');

    const ws = new WebSocket(wsUrl);
    await new Promise((ok, no) => {
      ws.addEventListener('open', ok, { once: true });
      ws.addEventListener('error', no, { once: true });
    });
    const cdp = new Cdp(ws);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);

    const metrics = (width, height) => cdp.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height,
    }, sessionId);

    const evalJs = async (expression) => {
      const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (r.exceptionDetails) throw new Error('the page threw: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    };

    const ready = async () => {
      for (let i = 0; i < 80; i++) {
        const n = await evalJs("document.querySelectorAll('#board-body tr').length");
        if (n > 0) return;
        await sleep(100);
      }
      throw new Error('the board never rendered');
    };

    const shoot = async (name, width, height, script) => {
      await metrics(width, height);
      if (script) await evalJs(script);
      await sleep(600);
      const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
      const bytes = Buffer.from(r.data, 'base64');
      writeFileSync(join(shotsDir, name), bytes);
      const w = bytes.readUInt32BE(16);
      const h = bytes.readUInt32BE(20);
      if (bytes.length > SHOT_MAX_BYTES) throw new Error(name + ' is ' + bytes.length + ' bytes, over the ' + SHOT_MAX_BYTES + ' the dossier takes');
      process.stdout.write('  ' + name + '  ' + w + 'x' + h + '  ' + bytes.length + ' bytes\n');
      return { name, w, h, bytes: bytes.length };
    };

    await metrics(1024, 1024);
    await cdp.send('Page.navigate', { url: page }, sessionId);
    await sleep(600);
    await ready();

    const probe = await evalJs(`(function () {
      var thead = document.querySelector('table.bt thead');
      var headBottom = thead ? thead.getBoundingClientRect().bottom : -1;
      var rows = Array.prototype.slice.call(document.querySelectorAll('#board-body tr'));
      var visible = rows.filter(function (tr) {
        var b = tr.getBoundingClientRect();
        return b.top >= 0 && b.bottom <= window.innerHeight;
      });
      return {
        viewport: window.innerWidth + 'x' + window.innerHeight,
        headBottom: Math.round(headBottom * 100) / 100,
        rowsVisible: visible.length,
        rowsTotal: rows.length,
        scrollWidth: document.documentElement.scrollWidth,
        checks: window.__CHECKS__,
      };
    })()`);
    process.stdout.write('board: ' + JSON.stringify(probe) + '\n');

    await shoot('1-board.png', 1024, 1024, 'window.scrollTo(0, 0);');
    await shoot('2-detail.png', 1024, 1024, "document.querySelector('#board-body tr[data-slug]').click();");
    await shoot('3-calibration.png', 1024, 1024, "document.getElementById('d-close') && document.getElementById('d-close').click(); document.querySelector('[data-tab=\"calibration\"]').click(); window.scrollTo(0, 0);");
    await shoot('4-board-table.png', 1698, 1024, "location.hash = '#/board'; window.scrollTo(0, 0);");

    ws.close();
  } finally {
    cleanup();
    rmSync(buildDir, { recursive: true, force: true });
  }
  process.exit(0);
})().catch((err) => {
  process.stderr.write('token radar: ' + err.message + '\n');
  rmSync(buildDir, { recursive: true, force: true });
  process.exit(1);
});
