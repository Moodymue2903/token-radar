import { readFileSync } from 'node:fs';
import { buildDossier } from '/home/hatch/workspace/makefun/token-radar/vendor/makefun-board.ts';
const rebuilt = buildDossier('/home/hatch/workspace/makefun/token-radar/out', { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } });
const shipped = readFileSync('/home/hatch/workspace/makefun/token-radar/out/dossier.json');
console.log('rebuilt bytes:', rebuilt.length, 'shipped bytes:', shipped.length);
console.log('dossier rebuild matches shipped:', Buffer.from(rebuilt).equals(shipped));
