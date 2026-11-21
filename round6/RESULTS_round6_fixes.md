# Token-Radar Round 6 — Audit-Fix Results

**Branch:** `round6-farm` (from `round5-dashboard`, commit 7ddd33f)
**Date:** 2026-11-17
**Status:** all 9 audit fixes implemented and verified. **NOT pushed, NOT bundled, NOT checked, NOT submitted** — that comes after the user sees it, on their go-ahead. Round 5 (submission 01a1e7fc) is untouched and still unjudged (result due 2026-12-28).
**Bounty deadline:** 2026-12-14T10:00:00Z. **Quota:** BLOCKED (`can_submit=False`, account reputation, verified 2026-11-17 ~14:05 IST) — build-and-hold only.

## Verdict up front

All 9 fixes from `round6/AUDIT_SYNTHESIS.md` (unanimous (b) SUBMIT WITH FIXES from Gemini, DeepSeek, GLM) are implemented on `round6-farm`. The model is untouched (Huber IRLS δ=1.0, intercept 3.138, slope 0.508, n=95, `radar-5-huber`), the verdict rule is untouched ($2,500 capital; FARM if NetEV ≥ $40 and NetEV/cost ≥ 1.5x), and the verdict counts are unchanged (**P25-POSITIVE 5 / FARM 6 / THIN 72 / SKIP 117**). Two consecutive rebuilds are byte-identical; Python reconciliation is exact ($0.0000 worst error); the headless-Chromium harness passes **50/50**; the 4 screenshots are retaken and visually inspected.

## The fixes, and where each lands

### 1. Badge rename — CRITICAL (all three audits)

The bare `P25-POSITIVE` badge no longer appears anywhere in the rendered output. The underlying verdict value in the data stays `'P25-POSITIVE'` (filters, counts and the self-check compare against it), but every rendered surface uses the new label **"Board P25-positive (pre-fee)"**:

- **Board table verdict cell** (`dashboard/app.js`, `verdictBadge` + the verdict-cell builder): the badge, plus — for the 5 pre-fee rows — the fully costed p25 inline beside the pre-fee p25, e.g. BounceBit `pre-fee p25 +$0.53 · fully costed p25 $-9.02` and Theo `pre-fee p25 +$7.45 · fully costed p25 +$1.40`. (Negative values render as `$-9.02`, the board's existing `fmtUsd2` convention — the sign sits after the `$`, as in every other Net EV cell on the board.)
- **P25-FULL marker** (GLM option b, implemented): Binaryx and Theo — the 2 rows that still break even fully costed at p25 — carry a `P25-FULL ✓` marker beside the badge, on the board table, in the playbooks panel, and in the detail view.
- **Legend** (board tab): renamed badge + the required line — "Fully costed p25 nets all fees; 3 of 5 pre-fee P25-positive rows are negative once costs are counted (see playbooks)."
- **Tier counts** (`boardSummaryHtml` band strip + header KPI): "FARM 11, incl. 5 Board P25-positive (pre-fee)".
- **Detail views** (kv verdict cell, verdict box, p25 note, playbook note): all renamed; the verdict-box CSS class is now `P25P` (was `P25-POSITIVE`) and the badge class likewise, so the string is gone from class attributes too.
- **Filter select**: the option displays the new label; its value is the slug `p25p` (mapped back to the raw verdict for filtering), so the bare string is gone from option values as well. Deep links still work: `#/board?verdict=P25-POSITIVE` and `#/board?verdict=p25p` both filter to the 5 rows (verified: 5 rows).
- **Method tab** (Farm verdicts paragraph) and **playbooks panel/method footnotes**: renamed everywhere.
- Verified in the browser: bare `P25-POSITIVE` = **0** in board `innerHTML`, **0** in board visible text, **0** in the BounceBit detail view (text + HTML). The data file still carries the raw verdict value, as it must — the verdict counts are unchanged.

### 2. Fee disclosures (all three audits)

One shared block, `playbookDisclosuresHtml()` in `dashboard/app.js`, carried in **every playbook detail view** and in the **method tab** playbook section:

> "Deposit/withdrawal assumed $0 (not verified per-protocol; would be $12.50 at 0.5% of the $2,500 capital). Slippage not modeled (0.30% = pool fee only). Bridge $2.00 flat per non-Ethereum chain (point estimate). Gas snapshot 2026-11-14. Opportunity cost is counted, not excluded: the board charges 4.5% a year for 90 days ($27.74 on $2,500), above the ~$25 risk-free benchmark at 4% APY. Counts 1 entry + 1 exit transaction per chain (assumes pre-approved spend); the actual exit is 1–4 transactions per chain by mechanism."

**Deviation from the audit wording, deliberate and documented:** the audits asked for "Excludes 90d risk-free opportunity cost (~$25 at 4% APY)". That is factually wrong for this board — the board's cost model **already counts** opportunity cost at 4.5% a year for 90 days ($27.74 on $2,500, visible as the "Board opportunity cost" line in every playbook cost table; `MODEL.oppRate = 0.045`). $27.74 is *above* the ~$25 benchmark at 4% APY, so the board's figure is the conservative one. Writing "excludes" would have added a false statement to the board — exactly the class of inconsistency the audits are removing. The disclosure as implemented states the $25 benchmark and the fact that the board counts more than it. The $12.50 deposit/withdrawal sensitivity is 0.5% × $2,500; the gas snapshot date is the snapshot's `as_of` (2026-11-14), read from `DATA.as_of`.

### 3. Fee decomposition per playbook (GLM fix 1; Gemini's Binaryx/Bucket note)

`Playbook.feeSplit` added in `lib/model.ts` (`buildPlaybook`, grouped from the fee labels by prefix) and mirrored in-page by `playbookSplitFor()` in `dashboard/app.js` (recomputed from the same rules; the self-check now verifies the split too). Rendered as one line in the playbooks panel's Extra-fees cell and as a paragraph in each detail playbook. **The split sums exactly to Extra on all 7 rows** (verified in Python and in-page):

| Farm | Extra | Swap | Bridge | Gas |
|---|---|---|---|---|
| Manta CeDeFi | $9.80 | $7.50 | $2.00 (1 chain) | $0.30 (1 tx) |
| BounceBit Prime | $9.55 | $7.50 | $2.00 (1 chain) | $0.05 (1 tx) |
| Theo Network thBill | $6.05 | $0.00 | $2.00 (1 chain) | $4.05 (2 tx) |
| Binaryx Platform | $2.05 | $0.00 | $2.00 (1 chain) | $0.05 (1 tx) |
| Bucket CDP | $2.05 | $0.00 | $2.00 (1 chain) | $0.05 (1 tx) |
| Manifest Trade | $9.55 | $7.50 | $2.00 (1 chain) | $0.05 (1 tx) |
| Defa By InvoiceMate | $4.10 | $0.00 | $4.00 (2 chains) | $0.10 (2 tx) |

**The Binaryx/Bucket $2.05 rows are resolved, verified from the code/data (not assumed):** Binaryx is RWA → mechanism `yield-bearing mint`; Bucket is CDP → mechanism `lending supply`. Neither is LP and neither is a stake, so the swap rule correctly charges $0 — a mint/deposit in USDC needs no paired-asset swap. The $2.05 is the $2.00 bridge to the single non-Ethereum chain (Polygon / Sui) plus $0.05 exit gas. The split line says so explicitly on those rows: "swap $0.00 (no swap — yield-bearing mint takes USDC directly, no paired-asset swap)". Theo's $4.05 gas is 2 exit transactions (Stable $0.05 + Ethereum $4.00); Defa's $4.00 bridge is 2 chains (Stellar + ZIGChain).

### 4. Break-even / implied pairing (Gemini fix 2; GLM 4e)

Every playbook (panel + detail) now shows **Break-even / Implied side-by-side with the safety margin (implied / break-even)**, computed from the row's own implied value:

| Farm | Break-even (fully-costed) | Implied | Margin |
|---|---|---|---|
| Manta CeDeFi | $5.62M | $12.87M | 2.29x |
| BounceBit Prime | $2.18M | $6.65M | 3.05x |
| Theo Network thBill | $2.51M | $6.50M | 2.58x |
| Binaryx Platform | $1.38M | $4.94M | 3.59x |
| Bucket CDP | $1.94M | $4.55M | 2.34x |
| Manifest Trade | $1.73M | $4.32M | 2.50x |
| Defa By InvoiceMate | $1.18M | $3.16M | 2.68x |

Column header: **"Break-even / Implied (market cap, fully-costed)"**. **Unit choice, deliberate:** the header says *market cap*, not FDV. The method tab already discloses — as a round-5 audit fix — that the board "does not call its output 'implied FDV' — the snapshot carries market capitalisation, not fully diluted value". Labelling the pair FDV would have broken that disclosure and created a new internal contradiction. The detail view adds the same sentence beside the pair. **Gemini's Manta example was wrong against the data:** the audit wrote "Implied: $38.4M — 6.8x safety margin"; the row's own implied value is $12.87M, margin 2.29x. The implemented figures use the row's own data.

### 5. Dedup rule stated (GLM fix 3; DeepSeek)

The playbooks panel intro and the method-tab playbook section now state the rule and the dedup set, computed from the data: "Playbooks cover all 5 Board P25-positive (pre-fee) rows plus the top-5 FARM rows by NetEV, deduped — the top-5 FARM by NetEV are BounceBit Prime, Binaryx Platform, Theo Network thBill, Manifest Trade, Manta CeDeFi, of which 2 are pure FARM rows (Manifest Trade, Manta CeDeFi) and the rest are already Board P25-positive (pre-fee), so the dedup leaves 7 playbooks in total." Verified from `out/board.json`: FARM 11 includes the 5 P25-positive as a subset; the top-5 FARM by NetEV are exactly those 3 P25-positive + Manifest + Manta. GLM's inference that the dedup was against round-5 covered rows is **not** repeated.

### 6. Cover claim reframed (GLM fix 4; DeepSeek)

Verified by grep over `dashboard/app.js`, `lib/model.ts`, `main.ts` and `dashboard/index.html`: **no "closes the gap" / "closes the gap to top 5" language exists on the board** — nothing to remove. (The phrase lives only in `round6/RESULTS_round6.md`, the build notes, not the rendered dashboard.) The board makes no top-5 claim; the playbooks panel and method sections state the facts and let the judge conclude.

### 7. Watchlist $0.600B defined (DeepSeek; GLM)

One line on the board (legend, board tab): "Watchlist total $599.8M is the sum of the 40 watchlist rows' point-estimate implied values, not expected capture." Verified from the data: **sum** of implied values of the 40 watchlist rows = $0.600B (median is $12.32M — not the total). Computed in-page from `DATA.rows`, not hardcoded. (The method tab already carried this definition; it now also sits on the board itself.)

### 8. Scatter note (GLM 4c)

Appended to the out-of-fold scatter caption (board tab) and the calibration-chart caption (method tab): "The dots may look noisier than round 5's in-sample scatter — that is the point: the in-sample visual was flattering; out-of-fold is the honest basis."

### 9. p10 column visible (GLM 4d)

The playbooks panel now has a **Net EV p10** column (fully costed) alongside p25 / median / p75, and the panel footnote states the range: "At p10 every playbook is negative (−$36.17 to −$18.48 fully costed)". The detail playbooks already carried p10 (board vs fully costed); it is now checkable from the board tab itself.

## What did NOT change

- **The model is untouched.** M0 stays Huber IRLS δ=1.0, intercept 3.138, slope 0.508, n=95 peers, `MODEL_VERSION` `radar-5-huber`. No retune, no new features. The only `lib/model.ts` change is the additive `Playbook.feeSplit` field — a grouping of fees the playbook already carried.
- **The verdict rule is untouched.** $2,500 capital; FARM if NetEV ≥ $40 and NetEV/cost ≥ 1.5x. No re-tiering (the unified-cost-basis alternative was rejected per the synthesis).
- **All board numbers are unchanged from round 6:** 758 protocols, 40 watchlist, 200 rows, watchlist $0.600B, LOO median error x2.96, 50.5% within 3x, verdicts **P25-POSITIVE 5 / FARM 6 / THIN 72 / SKIP 117**, blind 42.1%, time-split 41.9%, Spearman 0.340.

## Verification

- **Rebuild:** `mkdir -p out && MAKEFUN_OUTPUT_DIR=out ~/workspace/makefun/node22/node-v22.23.5-linux-x64/bin/node main.ts --input ~/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json` — passes. `out/data.js` md5 `4e46d760d4d6f7cc5756970ae6df73d8`; `out/board.json` md5 `e330a524a2a89b3152d8d0cf28bf9b0a` (both changed from round 6 only by the additive `feeSplit` field).
- **Determinism:** two consecutive rebuilds byte-identical (`diff -r` clean) on the final code, and a third rebuild after the last edit also byte-identical.
- **Reconciliation (Python, against `out/board.json`):** NetEV at p10/p25/median/p75 exact (board − extraTotal = fully costed, **worst error $0.0000**, bar $0.01) on all 7 playbooks; fee splits sum exactly to Extra and match the fee lines (swap/bridge/gas amounts and chain/tx counts) on all 7; verdict counts 5/6/72/117; model `radar-5-huber`.
- **In-browser verification (Playwright, headless Chromium, local server, `--no-proxy-server`):** **50/50 checks passed** (harness `~/workspace/makefun/shot-tool/r6f_verify.mjs`, derived from the round-6 harness). Self-checks all zero (`recomputeMismatches 0, farmMismatches 0, playbookMismatches 0, rows 200`), no warning banner, renamed badge present, bare `P25-POSITIVE` = 0 in board HTML/text and in the detail view, legend/watchlist/dedup lines present, p10 column + break-even/implied header + fee split present in the panel, fully costed p25 inline on the board, P25-FULL markers (4 on the board tab: 2 in the panel + 2 in the table), no "closes the gap" language, scatter 95 dots matching OOF-implied y within 0.08px, verdict filter `p25p` shows exactly 5 rows, BounceBit detail (disclosures, fee split, break-even/implied pair, $78.16) and Binaryx detail (no-swap wording, $2.05 split, P25-FULL, $1.4M / $4.9M — 3.59x) all pass.
  - **Three harness bugs found and fixed during verification (all in the check, not the dashboard):** (a) the round-6 harness's scatter check counted the right-edge "3x" annotation as a y-axis tick and ignored the 3px text-baseline offset — the same two bugs the round-6 results file documents; with the correct filter (left-side ticks only, −3px) the dots match at 0.08px. The original round-6 harness fails the same 3 checks on this build, confirming they are harness artifacts. (b) Its calibration check looked for the chart caption on the calibration *tab*, but the calibration chart lives on the *method* tab (the calibration tab is the ledger, by design) — the check now reads the method tab. (c) Its detail break-even check looked for the old `Break-even:` string; the new pair is `Break-even / Implied (market cap, fully-costed):`.
- **Screenshots inspected visually** (all 1024×711, all <512KB): 1-board 117,773 B, 2-detail 168,539 B, 3-calibration 122,049 B, 4-anchors 120,507 B. Board (renamed badge in KPI + legend, legend line, watchlist definition), playbooks panel (renamed badges, P25-FULL markers, fee splits, p10 column, break-even/implied pairs), detail playbook (cost table, fee split, Net EV table, break-even/implied pair), board table verdict cells (inline fully costed p25, verified on the 5-row filtered view), calibration and anchors tabs all render correctly. The playbooks panel and board table are wider than the 1024px viewport (pre-existing horizontal scroll — the table was already 1,594px wide in round 6; the two new columns widen it further).

## Files changed (branch `round6-farm`, uncommitted)

- `lib/model.ts` — `PlaybookFeeSplit` interface + `feeSplit` field, computed in `buildPlaybook` (grouped from the fee labels). Model and verdict rule untouched.
- `dashboard/app.js` — verdict label/class/filter helpers, renamed badge everywhere rendered, inline fully costed p25 + P25-FULL marker, legend line + watchlist definition, dedup rule, p10 column, break-even/implied pairing, fee-split rendering, shared disclosures block, scatter note, extended self-check (fee split), deep-link slug handling.
- `dashboard/app.css` — `.badge.P25P` / `.verdictbox.P25P` (renamed from `.P25-POSITIVE`), `.badge.P25FULL`, `.p25full`, `.feesplit`.
- `screenshots/` — 4 retaken shots (1-board, 2-detail, 3-calibration, 4-anchors), replacing the round-6 shots.
- `round6/RESULTS_round6_fixes.md` — this file.
- Harness (not in the repo): `~/workspace/makefun/shot-tool/r6f_verify.mjs`.
- `main.ts` unchanged. `out/` is gitignored (build output only).

## What remains

1. **Show to the user first** — then, on their go-ahead: push the branch, `makefun record` / bundle / `makefun check`, and submit. **Quota is currently BLOCKED** — re-verify `makefun status --competition token-radar-01` immediately before any submit; if it is still `can_submit=False`, hold.
2. The two deliberate deviations from the audit wording (opportunity-cost "excludes" → "counted, $27.74, above the ~$25 benchmark"; FDV → market cap in the break-even/implied header) are called out above — they are corrections against the data, not oversights, but the user should see them before submit.
