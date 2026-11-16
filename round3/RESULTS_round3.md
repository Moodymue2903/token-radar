# Token Radar — Round 3 results (top-5 push)

**Branch:** `round3`, HEAD `801a660` (Stage B) + this Stage C commit.
**Model:** M0 (`radar-3-bands`) + top-10 scalar c=1.15. No model change.
**Round-1 entry (submitted, judged):** 935,714, rank #473 of 6,283 (top ~7.5%).
Top-20 bar (2026-11-16): 953,929. Top-10 bar: 957,219. Top-5 bar: 958,843.
**Deadline:** 2026-12-14T10:00Z. Quota used 1/10 (9 left).

## 1. Stage A — clean-comps experiment: NO VARIANT SHIPS, fall back to M0

Frozen splits exactly as round 2: blind 80/20 ×5, seeds [11, 23, 37, 41, 53],
102 train / 26 test per seed; time-split train 64 / test 31 (33 peers have null
`listed_at`); LOO 128 folds. Full output: `round3/stageA/experiment3.out`.

| variant | blind median | blind within2 | blind within3 | blind Spearman | time-split median | LOO median | LOO within3 | LOO Spearman | board watchlist | tiers |
|---|---|---|---|---|---|---|---|---|---|---|
| **M0 (baseline)** | **x1.8859** | 23.8% | 38.5% | 0.409 | **x1.8401** | x1.8865 | 43.8% | 0.367 | **$0.637B** | **15/78/107** |
| M5 α=0.25 | x1.8621 | 25.4% | 35.4% | 0.445 | x1.9035 | x1.8689 | 43.0% | 0.421 | $0.868B | 11/99/90 |
| M5 α=0.75 | x1.8947 | 26.2% | 36.2% | 0.417 | x1.9038 | x1.8767 | 43.0% | 0.388 | $0.702B | 13/87/100 |
| M4 λ=0 | x1.8268 | 26.2% | 38.5% | 0.453 | x1.8622 | x1.8536 | 41.4% | 0.363 | $1.134B | 55/93/52 |
| M4 λ=0.5 | x2.0250 | 25.4% | 36.2% | 0.433 | x1.8895 | x1.8677 | 42.2% | 0.363 | $1.029B | 33/103/64 |

Ship rule (pre-registered, from the top-5 consults): blind Spearman ≥ 0.44 AND
LOO median ≤ 1.90 AND watchlist $0.60–0.68B AND tiers 15/78/107.
- **M5:** α=0.25 passes the split criteria (Spearman 0.445, LOO x1.8689) but
  watchlist $0.868B and tiers 11/99/90 — outside the bound. α=0.75 is closest
  on watchlist ($0.702B) but Spearman 0.417 < 0.44. **No α ships.**
- **M4:** λ=0 has the best split metrics of any variant (blind median x1.8268,
  Spearman 0.453, LOO x1.8536) but within-3x only 38.5% (< 43% target) and the
  board is $1.134B / FARM 55 (Steakhouse $157.2M, a 2.2× overshoot). **No λ ships.**
- **Structural finding:** recovering Spearman by removing M0's dampening
  necessarily inflates the board top end past the $0.68B bound. Ranking
  accuracy and level calibration trade off directly in this model family.
  M0 is the fallback.

### Two corrections to the brief (measured in Stage A, report plainly)
1. **SIGN ERROR in the brief/GLM:** FARM rows' multiples are 0.362–0.888, so
   FARM requires multiple **≥ ~0.35, NOT "< 0.35"**. The existing gate (netEv ≥
   $40 AND ratio ≥ 1.5) corresponds to multiple ≳ 0.35. Implementing "< 0.35"
   would flip FARM to the SKIP rows. The existing ≥ 0.35 cutoff is kept.
2. **P10 Net EV > 0 as a hard gate is INFEASIBLE:** 0 of 15 FARM rows pass (P10
   Net EVs −$18.26 to −$98.38; manta-cedefi −$24.94, sx-rollup-bridge −$98.38,
   liminal-basis −$21.40) because the bands are ~200× wide. Applying it would
   zero FARM (15 → 0). P10 Net EV is DISPLAYED transparently in the P10
   playbook instead; it is not a verdict gate. The "band 50% coverage ≥ 40%"
   conjunct is a global calibration metric (blind 46.2% ✓, time-split 32.3% ✗),
   not a per-row quantity — it cannot be a per-row verdict condition either.

## 2. Scalar c = 1.15 (the only level change; verify in production — done, §4)

Top-10 rows by implied value = ranks 1–8 (watchlist, SKIP) + ranks 9–10
(pulsechain-bridge, ink-bridge; THIN, not watchlist). Top-10 watchlist $277.5M
pre-scalar. Reference ratios: Steakhouse 1.281×, Gauntlet 1.321×, Veda 1.179×.
±5% on all three is INFEASIBLE under the $0.68B watchlist bound (needs
c≈1.25–1.26 → watchlist $0.706B). Max feasible c≈1.156.
- c=1.15 → watchlist $0.678B (inside), tiers UNCHANGED 15/78/107, top-3
  $64.2M / $49.9M / $48.2M (Steakhouse −10.2%, Gauntlet −12.9%, Veda −2.5%
  vs the reference dashboard). c=1.20 breaks the bound ($0.692B).
- Implementation: `MODEL.topScalar = 1.15`, `TOP_ROWS = 10` in `lib/model.ts`;
  `buildBoard` lifts the top-10 rows' implied values and recomputes their farm
  verdicts on the lifted value (order preserved); `attachBands` scales the
  top-10 bands by the same factor (the point keeps its place in the band);
  dashboard `impliedOf` mirrors it, so the self-check still passes.
- The board WILL change (new sha256, §4); the change comes solely from the
  scalar, not a model change.

## 3. Stage B — farm layer + scalar (commit 801a660, parent 86a6e64)

3 files changed, 68 insertions, 13 deletions. All 8 items:
1. **F-Hold column** — `feesHold = netEv × (1 − feeDrag)`, feeDrag =
   clamp(gasTotal/capital, 0.005, 0.015), added to `Verdict` in `lib/model.ts`
   (:171, :797–799), serialized in `buildBoard` (:880), rendered as a
   board-table column in `dashboard/app.js` (header "F-Hold").
2. **P10 playbook** — computed in the detail view from existing fields
   (p10 = `row.uncertainty.p10`; P10 Net EV = 0.08 × p10 × capital/TVL −
   totalCost). Rendered for FARM rows: p10 + P10 net EV + trigger ("Farm only
   if it clears p10"). Verified in the rendered manta-cedefi detail view:
   "P10: $1.0M net EV $-24.94. Farm only if it clears p10."
3. **Mechanism label** — verified prominent in the FARM detail view (own "Farm
   mechanism" key-value row, `app.js:488`) and in the board table. No code added.
4. **Verdict gate UNCHANGED** — `verdictFor` untouched (netEv ≥ $40 AND ratio ≥
   1.5). P10 Net EV is display-only (see correction 2 above).
5. **THIN tooltip** — verdict cell carries `title="THIN: ratio under 1.5x."` on
   THIN rows. Verified in the rendered board: 78/78 THIN cells carry it.
   Covers Superbot's 8 THIN rows with Net EV ≥ lowest FARM $43.93, e.g.
   SuiBridge +$175.78 at ratio 1.47 (F-Hold $173.53).
6. **Bootstrap caveat** — appended to the band paragraph in Methodology:
   "Endpoints move ~15% median (p10 18%, p25 14%, p75 15%, p90 15%; max 94%
   fstswap), 1,000 vs 200 resamples." Verified present in the rendered
   methodology page DOM (below the 900px viewport fold — the visible
   methodology screenshot is therefore byte-identical to the fix round's; the
   caveat is in the page and in the dossier text).
7. **Farm sentence** — README only (did not fit in the dashboard Methodology
   page — see byte budget). States the actual logic: protocol-specific steps
   via `actionFor` (not a TVL-multiple cutoff), Net EV is downstream
   arithmetic, F-Hold + P10 display-only, steps not restructured, top-10
   scalar 1.15.
8. **README stale line fixed** — "Round 2 lives on branch `round2` … round 1 is
   the submitted entry on `master`" → "Round 3 lives on branch `round3`
   (model `radar-3-bands` + top-10 scalar 1.15); round 1 is the submitted
   entry on `master`." Also added a top-10 scalar bullet to the model section.

### Deliberate deviation from the plan (documented, not hidden)
- **P10 playbook is on ALL 15 FARM rows, not top-5 only.** The plan's TOPFARM
  precompute (~150 B + ~70 B comment) did not fit the byte budget — after the
  first app.js edits the delta was +689 B, already over the 598 B dossier-text
  headroom before the P10 rendering and bootstrap caveat. The TOPFARM
  precompute was removed and the P10 playbook is rendered for all FARM rows
  instead. This is a **superset** (the top 5 still get it) and saves ~220 B.
  The plan's "top 5 only" was a byte-saving constraint, not a content
  requirement.

### Byte costs (Stage B)
- `dashboard/app.js`: 58,107 → **58,659 B** (+552 B).
- Dashboard total (index.html 698 + app.js 58,659 + app.css 5,870):
  64,675 → **65,227 B** (cap 65,536; **309 B spare**).
- Dossier `text` field: 64,938 → **65,490 B** (cap 65,536; **46 B spare** —
  the tightest constraint; any future app.js addition needs a trim first).
- Dossier total: 1,046,046 → **1,046,487 B** (cap 1.5 MiB; 526,377 B spare).
- Trims used to fit: shortened the p25 Downside paragraph tail, shortened the
  THIN tooltip, shortened the P10 trigger, removed the "(pool …)" clause from
  the P10 line (pool is 8% of p10, derivable from the verdict box; netEv is
  the fully-costed result), removed redundant parentheses, shortened the
  "Fees-Hold" header to "F-Hold".

## 4. Stage C — verification (this round)

### 4.1 Four builds at HEAD 801a660 — byte-identical (determinism PASS)
Each build: `MAKEFUN_OUTPUT_DIR=out node main.ts --input
…/token-radar-01-kit/input/snapshot.json` (Node v22.23.5, ~11 s each).
All four exit 0 (gate PASS). sha files committed under `round3/stageC/`
(build1.sha … build4.sha) — all four files are byte-identical to each other,
fixing Superbot's finding that the fix round had no committed sha record.
(Round 2's build1.sha dossier hash differed from build3/build4 because a
screenshot was re-captured between builds; that cannot happen here — the
screenshots were final before the four builds ran.)

| file | sha256 (all 4 builds) |
|---|---|
| out/board.json | `ea145b500fb08ad9ef3546b631f6b26d1f8fa0fc58b0d6bb18453791afdcceab` |
| out/data.js | `821f4c643397c554e606fa311b23df2a1af14b4dc19896416655edfb7af364f3` |
| out/dossier.json | `5d3d2bad81d5f400edd02a766853706f33450659ef4ee601543a8f6bfbd62929` |
| out/screenshots/1-board.png | `a97084d8865a4c4b5f75323de38861693a4c319ec42ac86249e6cc3be81de6af` |
| out/screenshots/2-detail.png | `e696866cad326b693881fef44fa3750d4cff27bb7c09b49f113edf3571c5efb2` |
| out/screenshots/3-method.png | `3f335441b64e6ed38f0617028ca42835751d6f739d93c8df11820c7c0b95f005` |
| out/screenshots/4-filtered.png | `200ea5d9900c6731a5ca61b496fe924081e8ef340c101d0de9694dc7118337b4` |

- Board sha CHANGED vs round 2 (`6b2e8f11…` → `ea145b50…`) — expected: the
  scalar lifts the top-10 rows. The change comes solely from the scalar.
- data.js sha CHANGED vs round 2 (`ca70de37…` → `821f4c64…`) — expected: it
  carries the same radar data (scalar mirrored in the dashboard self-check).
- Dossier sha CHANGED vs the fix round (`00d62786…` → `5d3d2bad…`) —
  expected: new board/data.js + new screenshots.

### 4.2 Board constraints — PASS (scalar verified in production, no fallback needed)
- Watchlist implied total: **$678,270,901 ($0.678B)** — inside $0.60–0.68B
  (margin $1,729,099 below the cap; tight but inside). Fallback to c=1.14
  then c=1.0 was NOT needed.
- Tiers: **FARM 15 / THIN 78 / SKIP 107** — unchanged ✓.
- Rows: 200 (40 watchlist + 160 early). Watchlist 40/40.
- Top-3 (exact): Steakhouse **$64,187,623** (band $4,621,250–$941,778,085),
  Gauntlet **$49,885,192** (band $4,683,679–$483,488,272), Veda **$48,169,593**
  (band $3,714,613–$1,099,411,017). Vs the reference dashboard: Steakhouse
  −10.2% ($71.5M), Gauntlet −12.9% ($57.3M), Veda −2.5% ($49.4M) — matches
  the Stage A prediction ($64.2M / $49.9M / $48.2M).
- Top-10: ranks 1–8 watchlist SKIP, ranks 9–10 pulsechain-bridge ($24.13M) and
  ink-bridge ($23.86M), both THIN — as predicted.
- Top FARM row: manta-cedefi $12,935,282, netEv $64.99, feesHold $64.66.
  FARM netEv range $43.93–$235.65.
- Validation unchanged (scalar does not touch it): LOO median x1.89, 43.8%
  within 3x; blind x1.89 / 23.8% / 38.5% / Spearman 0.409; time-split x1.84.

### 4.3 Gate + dossier rebuild — PASS
- Gate: main.ts exit 0 on all 4 builds (boardIssue clean, 200 rows, 4
  screenshots present, all caps enforced in-code).
- Dossier rebuild: re-running `buildDossier` on `out/` reproduces
  `dossier.json` byte-for-byte (rebuilt 1,046,487 = shipped 1,046,487,
  `round2/stageB/rebuild-check.mjs`). This is the scorer's own check.

### 4.4 Byte caps — all PASS
- Dashboard total 65,227 / 65,536 B (309 B spare).
- Dossier `text` 65,490 / 65,536 B (46 B spare).
- Dossier total 1,046,487 / 1,572,864 B (526,377 B spare).
- Screenshots: 1-board 152,613 B, 2-detail 239,577 B, 3-method 187,069 B,
  4-filtered 154,855 B — all ≤ 524,288 B.

### 4.5 Screenshots — re-captured at 1440×900, visually verified
Captured with Puppeteer + Chromium in `~/workspace/.scratch/pptr/` (shot.mjs)
from the built `out/dashboard`. All four render correctly:
- **1-board.png** (152,613 B): Tidegauge header, flat-comparison KPI chips
  ("Blind median error x1.89 vs x1.92 flat", "LOO median error x1.89 vs x1.88
  flat"), scatter plot, board table with P10–P90, MULTIPLE, GROSS, COST,
  NET EV, **F-HOLD** and VERDICT columns; Steakhouse $64.2M, P10–P90
  $4.6M–$941.8M, Gross $4.66, Cost $40.54, Net EV −$35.88, F-Hold −$35.69,
  SKIP; mechanism tag "curator allocation" on the row.
- **2-detail.png** (239,577 B): Manta CeDeFi rank #28, implied $12.9M,
  multiple 0.488x, FARM, 50% band $2.5M–$29.1M (11.5x) leading, 80% band
  $1.0M–$125.2M (124x), FARM MECHANISM "liquidity provision", value-derivation
  chain, band explanation, Downside + Risk paragraphs, P10 playbook
  ("P10: $1.0M net EV $-24.94. Farm only if it clears p10.").
- **3-method.png** (187,069 B): methodology page, "The blind test first",
  validation table (model vs flat, same splits), "Reading it honestly:
  … worse on Spearman". **Byte-identical to the fix round's 3-method.png**
  (sha `3f335441…`) — the Stage B methodology additions (bootstrap caveat)
  sit below the 900px viewport fold; the caveat IS present in the rendered
  page DOM and in the dossier text, but the visible viewport is unchanged.
  This is a presentation note, not a content gap.
- **4-filtered.png** (154,855 B): genuine FARM-only filtered view, dropdown
  reads FARM, "showing 15 of 200"; Manta CeDeFi $12.9M, SX Rollup Bridge
  $12.2M, Liminal Basis $11.7M with Gross/Cost/Net EV/F-Hold columns.
- DOM checks (not just pixels): THIN tooltip on 78/78 THIN verdict cells;
  P10 playbook + Downside + Risk in the FARM detail view; bootstrap caveat,
  flat table and "worse on Spearman" in the methodology page.

## 5. Honest predicted-score range (calibrated DOWN)

Round 1 was judged 935,714 — BELOW every pre-submission audit prediction
(Gemini 951–956k, DeepSeek 950–953k, ChatGPT 953–956.5k, GLM 940–953k). The
models were optimistic by ~5–20k. The round-2 post-fix audit (952–958k) was
made BEFORE round 1 was judged, so it carries the same optimism. Round 3's
honest range must discount accordingly — and it must discount the top-5
consult projections too, because they assumed the MODEL change ships, and it
did not (Stage A: no M4/M5 variant ships under the board constraints).
- What round 3 actually adds over round 2: the top-10 scalar (GLM's #2,
  projected +500–1,200) + the farm presentation (GLM's #3, projected
  +200–500). The model lever (Gemini's #2 / GLM's #1, projected +400–1,500)
  is NOT in this round.
- **Honest range: ~945,000–955,000, central ~950,000.**
- Top-20 bar (953,929, and drifting up as new entries arrive): borderline,
  roughly a 35–45% chance. Top-10 bar (957,219): unlikely, ~10–15%. Top-5
  bar (958,843): very unlikely, ~5% — the top-5 case depended on the model
  change that Stage A ruled out under the locked board constraints.
- This round is a solid top-20 contender, not a top-5 entry. If the top-5 goal
  stands, the next round needs a model that recovers Spearman WITHOUT
  inflating the board past $0.68B — the structural trade-off Stage A found —
  or the board constraints themselves must be revisited with the user.

## 6. What remains before submission (parent's steps, NOT done here)
- Merge the submitted branch to `master` first (Qwen's landmine — the default
  branch must hold the submitted entry). Do NOT merge in this round.
- Verify the account's actual remaining quota (9 slots left as of 2026-11-16).
- Bundle from the main session WITH the full Nov 17 run-record flag set (the
  bundle must cover the round-3 build session, not inherit round 1's record),
  run `makefun check`, then submit with a Tidegauge top-5 title only after the
  user's go-ahead and the Gemini/DeepSeek/GLM audit.
- Do NOT push, bundle, submit, or merge from this round. Commit locally on
  `round3` only.

## 7. Files
- Commit (this round): Stage B 801a660 + Stage C (screenshots, sha files,
  this write-up) on branch `round3`, NOT pushed.
- `round3/stageA/experiment3.out` — Stage A numbers.
- `round3/stageB/PLAN_stageB.md` — Stage B plan + Stage C checklist.
- `round3/stageC/build1.sha` … `build4.sha` — sha256 of board.json, data.js,
  dossier.json and all 4 screenshots per build (all four identical).
- `round2/stageB/rebuild-check.mjs` — dossier-rebuild check (reused).
- Screenshots: `screenshots/1-board.png`, `2-detail.png`, `3-method.png`,
  `4-filtered.png`.
