// Token Radar's entrypoint (Node 22, standard library only).
//
// Reads the sealed snapshot from /input/snapshot.json (or --input
// <file|dir>), scores every pre-token protocol with the shrunk comps model
// in lib/model.ts, writes the ranked board to /output/board.json and the
// dashboard's data to /output/data.js, copies dashboard/ and screenshots/
// to /output, and writes /output/dossier.json with the vendored make.fun
// library. The program runs twice and both runs write identical bytes:
// no clock, no randomness, no locale-dependent formatting, every sort
// explicit.
//
// The five outputs the scorer reads are board.json (200 ranked rows: 40
// watchlist + 160 early), data.js (the same radar as window.RADAR, for the
// dashboard), dashboard/ (the static page), screenshots/ (the 3 PNGs:
// board, detail, filtered — captured by hand from the rendered page), and
// dossier.json. The dossier is written last and the scorer rebuilds it
// from this /output and compares bytes, so it must be exactly what
// buildDossier writes — never hand-edited.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot, SnapshotError } from './lib/model.ts';
import { buildDossier, DossierError } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_MAX = 4;
const SCREENSHOT_MAX_BYTES = 524_288;
const DASHBOARD_MAX_FILES = 400;
const DASHBOARD_MAX_BYTES = 4_194_304;
/** The dashboard the judge reads must stay small enough to read: the whole
  * of dashboard/ together, in bytes. The page's own code and style are the
  * bulk of it, so the prose lives in data.js (the model's copy), not here. */
const DASHBOARD_BUDGET_BYTES = 62_000;
/** The dossier's cut line: the text cap trims a file that does not fit, and
  * a trimmed dossier is a failed gate, not a build. */
const CUT_MARKER = '[Cut at 65536 bytes';
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/** One line, no stack: the grader reads the message, not a trace. */
function fail(code: number, message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

/** The bytes of every file in a directory, and the files themselves. */
function dirBytes(dir: string): { total: number; names: string[] } {
  if (!existsSync(dir)) return { total: 0, names: [] };
  let total = 0;
  const names: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!statSync(path).isFile()) continue;
    total += statSync(path).size;
    names.push(name);
  }
  return { total, names };
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  fail(2, `no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

let snapshot;
let board;
let radar;
try {
  snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  ({ board, radar } = buildRadar(snapshot));
} catch (err) {
  if (err instanceof SnapshotError) fail(2, `the snapshot is refused: ${err.message}`);
  fail(1, `the model failed: ${err instanceof Error ? err.message : String(err)}`);
}

// The gate runs before a single byte is written: a run that refuses leaves
// no half-built output behind.
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(1, `the model wrote a board the gate refuses: ${issue}`);
if (board.length !== 200) fail(1, `the board holds ${board.length} rows, not the 200 the plan calls for`);

const dashDir = join(here, 'dashboard');
const shotsDir = join(here, 'screenshots');
const dashBytes = dirBytes(dashDir);
if (dashBytes.total > DASHBOARD_BUDGET_BYTES) {
  fail(1, `dashboard/ is ${dashBytes.total} bytes, over the ${DASHBOARD_BUDGET_BYTES} the judge reads: move the prose into data.js`);
}
const shotNames = existsSync(shotsDir)
  ? readdirSync(shotsDir).filter((name) => !name.startsWith('.') && statSync(join(shotsDir, name)).isFile())
  : [];
if (shotNames.length < 3) {
  fail(1, `screenshots/ holds ${shotNames.length} image${shotNames.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
}
if (shotNames.length > SCREENSHOT_MAX) {
  fail(1, `screenshots/ holds ${shotNames.length} images, over the ${SCREENSHOT_MAX} the dossier takes`);
}
for (const name of shotNames) {
  if (!IMAGE_NAME.test(name)) fail(1, `screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
  const size = statSync(join(shotsDir, name)).size;
  if (size > SCREENSHOT_MAX_BYTES) fail(1, `screenshots/${name} is ${size} bytes, over the ${SCREENSHOT_MAX_BYTES} the dossier takes`);
}

// The output is written from scratch: a stale file from an earlier run
// would ship beside the new ones.
mkdirSync(out, { recursive: true });
rmSync(join(out, 'dashboard'), { recursive: true, force: true });
rmSync(join(out, 'screenshots'), { recursive: true, force: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

const dashFiles = copyFiles(dashDir, join(out, 'dashboard'));
const shots = copyFiles(shotsDir, join(out, 'screenshots'));

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
let dossier: Uint8Array;
try {
  dossier = buildDossier(out, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: { max: SCREENSHOT_MAX, max_bytes: SCREENSHOT_MAX_BYTES },
    dashboard: { max_files: DASHBOARD_MAX_FILES, max_bytes: DASHBOARD_MAX_BYTES },
  });
} catch (err) {
  if (err instanceof DossierError) fail(1, `the dossier is refused: ${err.message}`);
  fail(1, `the dossier failed: ${err instanceof Error ? err.message : String(err)}`);
}
const dossierText = Buffer.from(dossier).toString('utf8');
if (dossierText.includes(CUT_MARKER)) {
  fail(1, `the dossier cuts at ${TEXT_MAX_BYTES} bytes: the dashboard does not fit whole, so the page the judge reads is incomplete`);
}
writeFileSync(join(out, 'dossier.json'), dossier);

const farm: Record<string, number> = { 'P25-POSITIVE': 0, FARM: 0, THIN: 0, SKIP: 0 };
for (const r of board) farm[r.farm.verdict] = (farm[r.farm.verdict] ?? 0) + 1;
const watchTotal = board.filter((r) => r.is_watchlist).reduce((s, r) => s + r.implied_value_usd, 0);
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: watchlist implied value $${(watchTotal / 1e9).toFixed(3)}B, LOO median error x${radar.validation.adoptedMedianMaxRatio.toFixed(2)}, ${radar.validation.adoptedWithin3.toFixed(1)}% within 3x\n` +
    `token radar: verdicts P25-POSITIVE ${farm['P25-POSITIVE']} / FARM ${farm.FARM} / MARGINAL ${farm.THIN} / SKIP ${farm.SKIP} (FARM ${farm.FARM + farm['P25-POSITIVE']} incl. P25-positive ${farm['P25-POSITIVE']})\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files, ${dashBytes.total} bytes), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
