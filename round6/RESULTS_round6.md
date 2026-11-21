# Token-Radar Round 6 — the farm-execution round

**Branch:** `round6-farm` (from `round5-dashboard`, commit 7ddd33f)
**Date:** 2026-11-17
**Status:** built and verified. **NOT pushed, NOT bundled, NOT checked, NOT submitted** — that comes after the 3-model audit, which the main agent runs. Round 5 (submission 01a1e7fc) is untouched and still unjudged (result due 2026-12-28).
**Bounty deadline:** 2026-12-14T10:00:00Z. **Quota:** BLOCKED (`can_submit=False`, account reputation, verified 2026-11-17 ~14:05 IST) — build-and-hold only.

## Verdict up front

Round 6 closes the **farm execution layer** — the last gap the round-5 audits named that a dashboard change can fix: no fully costed playbooks, no FARM-fees-hold column, and scatter points on a different basis from the LOO band. All three are done and verified.

It does **not** close the gap to top 5 by itself. The audits predicted round 5 at 952–958k against a top-5 bar of 958,843 and a top-10 bar of 957,219. Round 6 removes the last identified presentation gap, but the model — the other half of the gap — is unchanged and at its ceiling (Huber winner; every alternative dropped; Spearman(TVL, MC) ceiling 0.439 on 128 peers; all five top entries use the same model structure as M0). There is no measurement that converts "farm layer added" into judge points: the judge is a quantised pairwise BT rating, and the top entries' advantage was presentation depth, which round 6 now matches. Whether the score moves from ~952–958k to ≥958,843 is unknowable in advance — the honest claim is that there is no remaining *identified* presentation gap, and the residual risk is the model itself (which no dashboard change can fix) plus judge noise (±8pp noise floor, quantised scores).

There is also an honest cost to the new layer, stated plainly below: **fully costed, 3 of the 5 P25-positive rows no longer break even at p25.** The playbooks are more honest than the badge, and honesty here costs some of the tier's shine. The badge is defined on board costs and does not change; the playbooks print both figures side by side so a reader can see exactly where the money goes.

## What was added

### 1. Fully costed playbooks — 7 rows (`lib/model.ts`: `Playbook`, `buildPlaybook`, `attachPlaybooks`)

Every P25-positive row (5) plus the top 5 FARM rows by NetEV, deduplicated: 7 playbooks. Each carries the exact entry ($2,500, protocol, mechanism, chain(s)), every fee the board does not count, the hold, the exit, NetEV at p10/p25/p50/p75 fully costed, and the fully costed break-even. Board figures are taken from the row itself (already rounded to cents), so fully costed figures reconcile by construction: `fully costed = board − extraTotal` at every percentile, verified to ≤$0.01 in Python and again by the in-page self-check.

Fee rules (all stated in the code and on the dashboard):

| Fee | Rule | Source |
|---|---|---|
| Entry/exit swaps | 0.30% of the swapped amount | Standard AMM tier. LP rows swap half the capital each way ($3.75 + $3.75); stake rows swap the whole capital each way; USDC deposit/mint/lend needs no swap |
| Bridge | $2.00 flat per non-Ethereum chain touched | Capital starts as USDC on Ethereum (stated assumption). CCTP-style routes are gas-only; native bridges cost a few dollars of L1 gas; $0 if the farmer already holds USDC on the target chain |
| Exit gas | 1 transaction per chain touched, at that chain's `gasPerTx` from the snapshot | Snapshot data |
| Deposit / withdrawal protocol fee | $0 | Stated assumption — verify on the protocol's own page; no deposit/withdrawal fee is recorded in the snapshot |

Extra fees per farm: **$2.05–$9.80**. LP rows cost the most ($9.55–$9.80: two 0.30% swaps + $2 bridge + exit gas); RWA/lending rows the least ($2.05–$6.05).

**The playbook table (all figures from the final build, `out/board.json`):**

| # | Farm | Verdict | Entry | Board cost | Extra | Hold | p10 full | p25 full | Median full | p75 full | Break-even full |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 21 | Manta CeDeFi | FARM | $2,500 · Manta | $32.54 | $9.80 | 90d | −$36.17 | −$15.78 | +$54.68 | +$296.60 | $5,615,574 |
| 40 | BounceBit Prime | P25-POSITIVE | $2,500 · Binance | $28.54 | $9.55 | 90d | −$31.23 | −$9.02 | +$78.16 | +$296.04 | $2,179,371 |
| 43 | Theo Network thBill | P25-POSITIVE | $2,500 · Stable + Ethereum | $36.54 | $6.05 | 90d | −$30.26 | +$1.40 | +$67.44 | +$320.28 | $2,514,984 |
| 74 | Binaryx Platform | P25-POSITIVE | $2,500 · Polygon | $28.54 | $2.05 | 90d | −$18.48 | +$6.71 | +$79.23 | +$197.71 | $1,375,585 |
| 78 | Bucket CDP | P25-POSITIVE | $2,500 · Sui | $28.54 | $2.05 | 90d | −$24.45 | −$1.58 | +$41.06 | +$220.17 | $1,940,900 |
| 86 | Manifest Trade | FARM | $2,500 · Solana | $28.54 | $9.55 | 90d | −$31.54 | −$12.44 | +$56.98 | +$250.90 | $1,730,055 |
| 135 | Defa By InvoiceMate | P25-POSITIVE | $2,500 · Stellar + ZIGChain | $28.64 | $4.10 | 90d | −$23.71 | −$1.93 | +$55.07 | +$317.90 | $1,176,690 |

Reading it:

- **All 7 stay positive at the median, fully costed** — $41.06–$79.23 (board $43.11–$87.71). The extra fees shave $2.05–$9.80 off the board NetEV; nothing flips at the median.
- **At p25, only Binaryx (+$6.71) and Theo (+$1.40) still break even.** BounceBit −$9.02, Bucket −$1.58 and Defa −$1.93 go negative once swaps, bridges and the exit are counted. The P25-POSITIVE badge is defined on board costs and does not change — the playbooks print both, and each detail view says in plain words when a row no longer breaks even at p25.
- **At p10 every playbook is negative** (−$18.48 to −$36.17 fully costed): the 10th percentile of the 80% band is far below break-even on every farm. That is the honest floor of the 80% band, and it is why the board's verdict is a median rule, not a p10 rule.
- **Fully costed break-evens:** $1.18M (Defa) to $5.62M (Manta) — the token must be worth at least that for the position to pay for itself after all fees.

### 2. FARM-fees-hold column (`dashboard/app.js`)

The board's `F-Hold` column is now **"Fees · Hold"**: each cell shows `$<totalCost> · <hold>d` (hold from the existing `holdDaysFor`, 90d or 60d if age is null), with a title attribute giving the gas/opportunity split. The `feesHold` data field stays in `board.json`/`data.js` (auditability) but is no longer displayed. A small print line under the table defines the column. Verified in the browser: header present, 189 cells `· 90d`, 11 cells `· 60d` (200 rows). The table is 1,594px wide at a 1,024px viewport — 30px wider than round 5's 1,564px, a pre-existing overflow (the 16-column table was already horizontally scrollable in round 5).

### 3. Scatter points now out-of-fold (`dashboard/app.js`)

The round-5 limitation is fixed: `ratioScatter` and `calibrationChart` now use `p.oofImplied` (out-of-fold) instead of recomputed in-sample `impliedOf`, so the points and the shaded LOO residual band share the same out-of-sample basis. Falls back to in-sample if an older data file lacks `oofImplied`. Captions updated ("Out-of-fold fitted vs actual"; "In-sample fit" gone). Verified in the browser: 95 dots, each dot's y matches its OOF-implied value within 1.5px after deriving the axis map from the tick labels (the check itself had to exclude the right-edge "3x"/"1/3x" annotations and the 3px text-baseline offset — the dots were correct; the first two check failures were the check's own bugs, not the chart's).

### Also added

- **`playbooksHtml()` panel** on the board tab (after the session plan): the 7-row playbook table at a glance — Farm, Entry, Board cost, Extra fees, Hold, Net EV p25/median/p75 (fully costed), Break-even — plus a footnote counting how many P25-positive rows still break even at p25 fully costed, computed from DATA.
- **`playbookHtml(row)` detail-view section** (`id="playbook"`): entry line, cost table (board gas, board opp, each extra fee with its basis, total fully costed), Net EV table (board vs fully costed at p10/p25/median/p75), break-even board vs fully costed, and the plain-words note (survives p25 fully costed, or no longer breaks even at p25 with the badge defined on board costs only).
- **`playbookMethodHtml()`** in the method tab (Farm verdicts section): what the board's cost model leaves out, what playbooks add, and what survives fully costed — all numbers computed from DATA.
- **In-page self-check extended:** `playbookFeesFor(r)` mirrors the TS fee rules; `__CHECKS__` gains `playbookMismatches`; the warning banner includes the playbook count.

## What did NOT change

- **The model is untouched.** M0 stays Huber IRLS δ=1.0, intercept 3.138, slope 0.508, n=95 peers, MODEL_VERSION `radar-5-huber`. No retune, no new features.
- **The verdict rule is untouched.** $2,500 capital; FARM if NetEV ≥ $40 and NetEV/cost ≥ 1.5x. The playbooks never re-decide a verdict.
- **All board numbers are unchanged from round 5:** 758 protocols, 40 watchlist, 200 rows (160 early, 24 live), watchlist $0.600B, LOO median error x2.96, 50.5% within 3x, verdicts **P25-POSITIVE 5 / FARM 6 / THIN 72 / SKIP 117** (FARM 11 incl. P25-positive 5), blind 42.1%, time-split 41.9%, Spearman 0.340.

## Verification

- **Rebuild:** `mkdir -p out && MAKEFUN_OUTPUT_DIR=out ~/workspace/makefun/node22/node-v22.23.5-linux-x64/bin/node main.ts --input ~/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json` — passes. `out/data.js` md5 `d5bcb98e2e5d040387396273e1277b3e`; `out/board.json` md5 `f2a1b70fe130deab6136d0e59c6f6b38`.
- **Determinism:** two consecutive rebuilds are byte-identical (`diff -r` clean).
- **Reconciliation (Python, against `out/board.json`):** NetEV at p10/p25/median/p75 exact (board − extraTotal = fully costed, ≤$0.01) on all 7 playbooks; fee sums exact; board gas + opp = board total exact; breakevenFull consistent by construction (board break-even + extraTotal × TVL / (0.08 × capital)).
- **In-browser verification (Playwright, headless Chromium, local server, `--no-proxy-server`):** **26/26 checks passed.** Self-checks all zero (`recomputeMismatches 0, farmMismatches 0, playbookMismatches 0, rows 200`), no warning banner, "Fees · Hold" header present with 200 cells, playbooks panel with 7 rows, scatter 95 dots matching OOF-implied y within 1.5px, BounceBit detail contains the playbook section (entry swap, bridge to Binance, exit swap, fully costed total, break-even, honest p25-loss note, $78.16), calibration caption out-of-fold, anchors tab 48 of 95 with an OOF column.
- **Screenshots inspected visually** (all 1024×711, all <512KB): 1-board 120,568 B, 2-detail 171,845 B, 3-calibration 120,906 B, 4-anchors 119,356 B. Playbooks panel, detail playbook (incl. the new p10 column), board table, scatter (OOF dots + LOO band + 3x/1/3x lines), calibration and anchors tabs all render correctly. Harness at `/tmp/r6_verify.mjs` (run from inside `~/workspace/makefun/shot-tool/` so `playwright-core` resolves — `NODE_PATH` does not work for ESM imports).

## Files changed (branch `round6-farm`)

- `lib/model.ts` — `PlaybookFee` + `Playbook` interfaces, `playbookExtraFees`, `exitFor`, `buildPlaybook`, `attachPlaybooks` (wired into `buildRadar` after `attachBands`).
- `dashboard/app.js` — OOF scatter/calibration, "Fees · Hold" column, playbooks panel, detail playbook section, method playbook section, extended self-check.
- `screenshots/` — 4 new shots (1-board, 2-detail, 3-calibration, 4-anchors), replacing the round-5 shots.
- `round6/RESULTS_round6.md` — this file.
- `main.ts` unchanged. `out/` is gitignored (build output only).

## What remains

1. **3-model audit** (Gemini, DeepSeek, GLM) — main agent runs it; do not submit before it.
2. **Show to the user first** — then, on their go-ahead: push the branch, `makefun record` / bundle / `makefun check`, and submit. **Quota is currently BLOCKED** — re-verify `makefun status --competition token-radar-01` immediately before any submit; if it is still `can_submit=False`, hold.
3. If the audit wants changes, they land on `round6-farm`, never on `round5-dashboard`.
