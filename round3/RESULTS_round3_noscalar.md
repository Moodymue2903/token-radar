# Token Radar — Round 3, post-audit: top-10 scalar dropped to 1.00

**Branch:** `round3`, HEAD `2bb44c5` (Stage C) + this commit.
**Model:** M0 (`radar-3-bands`), unchanged. **Scalar: 1.00 — the 1.15x top-10 lift is gone.**
**Round-1 entry (submitted, judged):** 935,714, rank #473 of 6,283 (top ~7.5%).
Top-20 bar (2026-11-16): 953,929. Top-10 bar: 957,219. Top-5 bar: 958,843.
**Deadline:** 2026-12-14T10:00Z. Quota used 1/10 (9 left).

## 1. Why the scalar was dropped

The Stage C entry (commit `2bb44c5`) was audited by Gemini, DeepSeek and
GLM, 3 of 3, on 2026-11-16. All three flagged the 1.15x top-10 scalar as
unjustified and the biggest risk; Gemini and GLM both recommended dropping
it to 1.00 before submission. The user chose "Drop the scalar and rebuild,
then submit".

- The scalar had no documented derivation; it was a post-hoc patch applied
  to the least trustworthy rows (the top of the board, where the model is
  already weakest).
- It created an artificial 15% cliff between rank #10 and rank #11.
- It pushed the watchlist total to $678,270,901 — 99.75% of the $680M
  ceiling, a $1,729,099 (0.25%) margin, a hard-boundary breach risk from
  rounding, snapshot or inclusion differences.
- The auditors' consensus predicted range for the scalar entry was
  ~932,000–950,000, central ~937,000–943,000 — not the stated
  ~945,000–955,000 central ~950,000 — and top-20 ~5%, not 35–45%.

The fix, as recommended: drop the scalar to 1.00 and document why. The
change is recorded in the dashboard methodology panel ("No top-10 scalar"),
in `lib/model.ts` (comment on `MODEL.topScalar`) and in the README model
section. The scalar hook is kept at 1.00 so `buildBoard`, `attachBands`
and the dashboard's `impliedOf` need no structural change — with the
scalar at 1.00 the lift is a no-op and the recomputed verdicts are
identical to the model values.

## 2. What changed in the code

- `lib/model.ts`: `MODEL.topScalar` 1.15 → **1.0**; comments updated at the
  field, the constant, the `buildBoard` lift loop and `attachBands`.
- `dashboard/app.js`: methodology panel gains the "No top-10 scalar" note
  (after "The model" intro). To fit the dossier byte cap, ~600 B was
  trimmed from the Methodology — a duplicated under-coverage sentence in
  "Reading it honestly", the shrunk-effects sentence in "Coherence", a
  redundant sentence in the LOO paragraph, a summary sentence in the small
  print, and the M1/M2 detail in the ship-rule paragraph (the t-stats and
  the rejection are kept). Net app.js change: 58,659 → 58,335 B (−324 B).
  No content verified by Stage C was removed: the bootstrap caveat, the
  flat table, "worse on Spearman", the THIN tooltip, the P10 playbook,
  Downside and Risk are all still present (DOM checks, §5).
- `README.md`: the three scalar mentions updated to "dropped to 1.00x".
  The README's watchlist total ($0.637B) and top values (Steakhouse
  $55.8M, Gauntlet $43.4M, Veda $41.9M, USDD $39.3M) were the PRE-scalar
  figures and are now correct again for the production build.
- Model (M0), farm layer logic, verdict gate, bootstrap resamples (200)
  and the snapshot are UNCHANGED.

## 3. Four builds at this HEAD — byte-identical (determinism PASS)

Each build: `MAKEFUN_OUTPUT_DIR=out node main.ts --input
…/token-radar-01-kit/input/snapshot.json` (Node v22.23.5, ~11 s each).
All four exit 0 (gate PASS). sha files committed under `round3/stageD/`
(build1.sha … build4.sha) — all four files are byte-identical to each
other. Screenshots were final before the four builds ran.

| file | sha256 (all 4 builds) |
|---|---|
| out/board.json | `30011ad60f560fb91d664e4be1542749d96b4052dd4ac555d253823a145ef8f9` |
| out/data.js | `84ecb656d02b39fd656edd166fc9f76aef36deb2517d24650727f81a7d16bcff` |
| out/dossier.json | `35bfd868d29a6abbde50b5e3b93fd1caac785c8be1f1939115465eb673a37f1f` |
| out/screenshots/1-board.png | `61721106d2cba104310f9c1660319f88281ffce084e2adacdb10994f5caf1b1c` |
| out/screenshots/2-detail.png | `941a9e162249c7cd23b389500d9e1cfa576f520bc713e8796a8b2d84bb1f7f70` |
| out/screenshots/3-method.png | `ea8b152d52a9669e4cd2163de5f3a7e0a7743f8f19e384624e69ec0c97591a34` |
| out/screenshots/4-filtered.png | `4a3ed3c060f77ffe9a5c4d6906ce960465775b008aed296dd536b8a65ca1fb3f` |

- Board sha CHANGED vs Stage C (`ea145b50…` → `30011ad6…`) — expected:
  the top-10 rows are no longer lifted. The change comes solely from the
  scalar removal.
- data.js sha CHANGED vs Stage C (`821f4c64…` → `84ecb656…`) — expected:
  it carries the model with `topScalar: 1`.
- Dossier sha CHANGED vs Stage C (`5d3d2bad…` → `35bfd868…`) — expected:
  new board/data.js + new screenshots + methodology edits.

## 4. Board constraints — PASS

- Watchlist implied total: **$636,636,074 ($0.637B)** — inside $0.60–0.68B
  (margin $43,363,926 below the cap; was $1,729,099). Matches the Stage A
  M0 board ($0.637B) and the README figure. GLM estimated $630–640M for
  the drop; Gemini estimated $645–655M. GLM was closer.
- Tiers: **FARM 15 / THIN 78 / SKIP 107** — UNCHANGED. GLM's "FARM may
  shift by 1–2 rows" did not happen: no FARM row is in the top 10, and
  ranks 9–10 (pulsechain-bridge, ink-bridge) stay THIN after the lift is
  removed (netEv $84.90 / $67.63).
- Rows: 200 (40 watchlist + 160 early). Watchlist 40/40.
- Top-3 (exact): Steakhouse **$55,815,324** (band $4,018,478–$818,937,465),
  Gauntlet **$43,378,428** (band $4,072,764–$420,424,585), Veda
  **$41,886,603** (band $3,230,098–$956,009,580). Each is exactly the
  Stage C value ÷ 1.15. Rank #4 USDD $39,288,597.
- Top-10: ranks 1–8 watchlist SKIP, ranks 9–10 pulsechain-bridge
  ($20,984,746) and ink-bridge ($20,744,661), both THIN — same order as
  Stage C; removing a uniform lift preserves the order, so no rank moved.
- Top FARM row: manta-cedefi $12,935,282, netEv $64.99, feesHold $64.66 —
  unchanged (rank #28, outside the top 10). FARM netEv range $43.93–$235.65,
  unchanged.
- Validation unchanged (the scalar does not touch it): LOO median x1.89,
  43.8% within 3x, Spearman 0.367; blind x1.89 / 23.8% / 38.5% / Spearman
  0.409; time-split x1.84.

## 5. Gate + dossier rebuild + byte caps — all PASS

- Gate: main.ts exit 0 on all 4 builds (boardIssue clean, 200 rows, 4
  screenshots present, all caps enforced in-code).
- Dossier rebuild: re-running `buildDossier` on `out/` reproduces
  `dossier.json` byte-for-byte (rebuilt 1,038,304 = shipped 1,038,304,
  `round2/stageB/rebuild-check.mjs`). This is the scorer's own check.
- Dashboard total 64,903 / 65,536 B (633 B spare; was 309 B).
- Dossier `text` 65,166 / 65,536 B (**370 B spare**; was 46 B — the trim
  bought real headroom).
- Dossier total 1,038,304 / 1,572,864 B (534,560 B spare).
- Screenshots: 1-board 152,874 B, 2-detail 239,869 B, 3-method 180,242 B,
  4-filtered 155,237 B — all ≤ 524,288 B.
- `data.js` model carries `"topScalar":1` — the scalar is 1.00 in the
  shipped data, not just in the source.

## 6. Screenshots — re-captured at 1440×900, visually verified

Captured with Puppeteer + Chromium in `~/workspace/.scratch/pptr/`
(shot.mjs) from the built `out/dashboard`. All four render correctly:
- **1-board.png** (152,874 B): Tidegauge header, flat-comparison KPI
  chips, scatter plot, board table with P10–P90, MULTIPLE, GROSS, COST,
  NET EV, **F-HOLD** and VERDICT columns; Steakhouse $55.8M, P10–P90
  $4.0M–$818.9M, Gross $4.05, Cost $40.54, Net EV −$36.49, F-Hold −$36.30,
  SKIP; mechanism tag "curator allocation" on the row.
- **2-detail.png** (239,869 B): Manta CeDeFi rank #28, implied $12.9M,
  multiple 0.488x, FARM, 50% band $2.5M–$29.1M (11.5x), 80% band
  $1.0M–$125.2M (124x), FARM MECHANISM "liquidity provision",
  value-derivation chain (waterfall now ends at $12.9M = the board value;
  under the scalar it would have ended at the unlifted value), band
  explanation, Downside + Risk paragraphs, P10 playbook ("P10: $1.0M net
  EV $-24.94. Farm only if it clears p10.").
- **3-method.png** (180,242 B): methodology page, "The blind test first",
  validation table (model vs flat, same splits), "Reading it honestly:
  … worse on Spearman". The scalar note sits below the 900px viewport
  fold (scroll position 1178) — same as the Stage B bootstrap caveat,
  which is also below the fold; both ARE in the rendered page DOM and in
  the dossier text. The visible viewport is unchanged from Stage C apart
  from the trimmed duplicate sentence.
- **4-filtered.png** (155,237 B): genuine FARM-only filtered view, dropdown
  reads FARM, "showing 15 of 200"; Manta CeDeFi $12.9M, SX Rollup Bridge
  $12.2M, Liminal Basis $11.7M with Gross/Cost/Net EV/F-Hold columns.
- DOM checks (not just pixels): scalar note present in the methodology DOM;
  bootstrap caveat and "worse on Spearman" still present; THIN tooltip on
  78/78 THIN verdict cells; P10 playbook + Downside + Risk in the FARM
  detail view.

## 7. Honest predicted-score range (post-drop)

GLM's audit said: if the scalar is dropped, revise its central estimate
slightly UP to ~939,000, range 935,000–943,000 (from 932,000–942,000,
central ~937,000). The other two auditors did not re-score the drop, but
both recommended it, and the drop removes the single biggest risk they
named (ceiling breach + unjustified fudge factor) at zero ranking cost.
- **Honest range after the drop: ~935,000–943,000, central ~939,000.**
- Top-20 bar (953,929, drifting up): ~5%. Top-10 (957,219): ~1%.
  Top-5 (958,843): ~0.5%. The entry is a top-3%-5% entry, not a top-20
  contender on the stated probabilities — the gap from round 1's 935,714
  to the top-20 bar is 18,215 points with no documented mechanism to close
  it, and this round changes no model.
- What the drop buys is not points but risk removal: the watchlist total
  is now $43.4M inside the ceiling instead of $1.7M, the #10/#11 cliff is
  gone, and the methodology narrative is cleaner — the exact things the
  auditors said a judge would penalise.

## 8. What remains before submission (parent's steps, NOT done here)

- Merge the submitted branch to `master` first (Qwen's landmine — the
  default branch must hold the submitted entry). Do NOT merge in this round.
- Verify the account's actual remaining quota (9 slots left as of 2026-11-16).
- Bundle from the main session WITH the full Nov 17 run-record flag set (the
  bundle must cover the round-3 build session, not inherit round 1's record),
  run `makefun check`, then submit with a Tidegauge top-5 title only after
  the user's go-ahead. The user has already chosen "Drop the scalar and
  rebuild, then submit" — the submit step itself is still the parent's.
- Do NOT push, bundle, submit, or merge from this round. Commit locally on
  `round3` only.

## 9. Files

- Commit (this round): scalar drop + methodology edits + new screenshots +
  sha files + this write-up on branch `round3`, NOT pushed.
- `round3/stageD/build1.sha` … `build4.sha` — sha256 of board.json, data.js,
  dossier.json and all 4 screenshots per build (all four identical).
- `round3/stageD/build1.log` … `build4.log` — build stdout per build.
- Screenshots: `screenshots/1-board.png`, `2-detail.png`, `3-method.png`,
  `4-filtered.png`.
