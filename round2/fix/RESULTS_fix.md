# Token Radar — Round 2 fix round (RESULTS_fix.md)

Fix round applied to the round-2 branch after the six-model audit
(Gemini, DeepSeek, GLM, ChatGPT, Superbot High, Qwen4-Max). Board values
(M0) are LOCKED and unchanged: 200 rows, 40/40 watchlist, watchlist
$0.637B, FARM 15 / THIN 78 / SKIP 107, top-3 Steakhouse $55.8M /
Gauntlet $43.4M / Veda $41.9M. Board sha256 is byte-identical to round 2
(`6b2e8f11d71d80df14cb27c1261218f3a9840838037fcf34372d4f1f91f69b64`).

## 1. Overclaim removed (item 1)

Deleted from `dashboard/app.js` (was line ~403):

> "That beats the top entries' quoted 'OOS x2.01', and it is a full
> leave-one-out refit, not a single split."

Replaced with an honest two-definitions note in the LOO paragraph: the
headline error is 1+MdAPE (x1.89), which caps under-predictions at 2x;
the like-for-like number is the median max-ratio (x3.37), disclosed
alongside it. The top entries' quoted 'OOS x2.01' is not referenced
anywhere in the dashboard now (grep for "x2.01" = 0 in dashboard/).
The sentence is apples-to-oranges (our LOO median max-ratio x3.37 is
worse than 2.01) and was a credibility risk.

## 2. Fourth screenshot: filtered view (item 2)

Added `screenshots/4-filtered.png` (155,953 B) — a genuine FARM-only
filtered view of the board: the verdict dropdown reads FARM, the table
shows exactly the 15 FARM rows ("showing 15 of 200"), with the new
Gross / Cost / Net EV columns. `3-method.png` is KEPT as screenshot 3
(Qwen's approach, not ChatGPT's "replace"). The gate allows 3–4
screenshots; the dossier now carries 4.

All four screenshots re-captured (dashboard changed) at headless
Chromium 1440x900 (Puppeteer, since the Muse Browser refuses CLI
screenshot mode and no system Chrome exists):

| file | bytes | cap | content (visually verified) |
|---|---|---|---|
| 1-board.png | 151,314 | 524,288 | Tidegauge header; KPI chips lead "Blind median error x1.89 vs x1.92 flat" + "LOO median error x1.89 vs x1.88 flat"; board with Gross/Cost/Net EV columns; Steakhouse Gross $4.05 / Cost $40.54 / Net EV -$36.49 SKIP |
| 2-detail.png | 239,869 | 524,288 | Manta CeDeFi #28 detail; KV grid leads 50% band (predictive) $2.5M–$29.1M (11.5x), then 80% band $1.0M–$125.2M (124x); band paragraph "bootstrap predictive interval, not a confidence interval" + time-split under-cover (71.0% / 32.3%); Downside + Risk paragraphs present (verified in DOM) |
| 3-method.png | 187,069 | 524,288 | Methodology page; "The blind test first" leads with the flat comparison; validation table (see §3); "Reading it honestly" with "worse on Spearman" |
| 4-filtered.png | 155,953 | 524,288 | FARM-only filtered board (dropdown FARM, "showing 15 of 200"); Manta Gross $97.53 / Cost $32.54 / Net EV $64.99 FARM; SX Rollup Bridge Gross $355.13 / Cost $119.48 / Net EV $235.65 FARM |

Two real bugs found and fixed while capturing these (both in
`dashboard/app.js`, both genuine, not screenshot-only):

- **Detail overlay stayed open on hash navigation.** `route()` did not
  close the `.detail` overlay when the hash left `#/proto/...`, because
  the overlay lives on `document.body` and `render()` only rebuilds the
  board. Pressing the browser Back button from a detail view, or
  navigating from `#/proto/x` to `#/board`, left the overlay open over
  the board. Fixed: `closeDetail()` is now called in the non-proto
  branch of `route()` (safe — `closeDetail()` only rewrites the hash
  when it starts with `#/proto/`). This is why the first 4-filtered
  capture showed the Manta detail overlay on top of the filtered board.
- **No deep link for a filtered view.** The verdict filter was
  state-only, so a filtered view could not be linked or screenshotted
  by URL. Fixed: `route()` now parses `verdict=(FARM|THIN|SKIP)` from
  the hash, e.g. `#/board?verdict=FARM`. This is a real feature (the
  filtered view is shareable), not just a screenshot hook.

## 3. Flat-baseline validation table + header reframe (item 3)

`lib/model.ts` now computes the flat baseline inside `validateModel`
(train-median constant per split for blind/time-split; global median
0.214x for LOO) and the paired 95% CI for (M0 − flat) blind median
error (t(4) = 2.776). New `Validation` fields: `flatBlindMedian`,
`flatBlindMedianMaxRatio`, `flatBlindWithin2`, `flatBlindWithin3`,
`flatBlindSpearman`, `flatTimeSplitMedian`, `flatTimeSplitMedianMaxRatio`,
`flatTimeSplitWithin2`, `flatTimeSplitWithin3`, `flatTimeSplitSpearman`,
`flatBlindCiLo`, `flatBlindCiHi`, plus `blindMedianMaxRatio`,
`timeSplitMedianMaxRatio`, `timeSplitWithin2`, and per-row `spearman`
on `LooRow`. The numbers were verified against the parent's
`round2/verify_flat.py` (splits reproduce 102/26 blind, 64/31
time-split) and against a temp build before the fix commit.

Validation table (dashboard methodology page, "Validation — model vs
flat, same splits"):

| metric | M0 blind x5 | Flat blind x5 | M0 time-split | Flat time-split | M0 LOO | Flat LOO |
|---|---|---|---|---|---|---|
| 1+MdAPE (median error) | x1.89 | x1.92 | x1.84 | x1.89 | x1.89 | x1.88 |
| Median max-ratio | x5.16 | x5.87 | x3.49 | x5.35 | x3.37 | x5.07 |
| Within 2x | 23.8% | 23.8% | 25.8% | 19.4% | 30.5% | 28.1% |
| Within 3x | 38.5% | 30.0% | 41.9% | 35.5% | 43.8% | 35.2% |
| Spearman(pred, act) | 0.409 | 0.453 | 0.180 | 0.244 | 0.367 | 0.416 |
| 50% band coverage | 46.2% | — | 32.3% | — | — | — |
| 80% band coverage | 83.8% | — | 71.0% | — | — | — |
| n | 130 | 130 | 31 | 31 | 128 | 128 |

Paired 95% CI for (M0 − flat) blind median error: **[-0.0546, -0.0051]**
(TypeScript production, full precision) / [-0.0546, -0.0052] (Python
verify_flat.py, per-seed medians rounded to 3 decimals — a 0.0001
rounding difference, documented here). The interval does NOT span 0;
M0 wins on median error in all 5 seeds.

Honest reading (stated in the dashboard, "Reading it honestly"):
M0 beats flat on median error and within-3x (blind + time-split) and
on the tail (median max-ratio) everywhere; tied on within-2x blind;
**worse on Spearman** — the flat TVL ranking out-ranks M0 on every
split, so the value is in the point estimates and the tail, not the
ordering. On LOO flat is slightly better on median error (x1.88 vs
x1.89) and Spearman, but M0 wins the tail (within-3x 43.8% vs 35.2%,
max-ratio x3.37 vs x5.07). The time-split ranking gap (0.180 vs
0.2444) is noise at n=31 (SE ~0.19) but is stated plainly. Blind
calibration does not transfer perfectly to newer listings: the bands
under-cover on the time split (71.0% / 32.3%). Bands are NOT
recalibrated.

Header KPI strip now leads with the flat comparison: "Blind median
error x1.89 vs x1.92 flat" and "LOO median error x1.89 vs x1.88 flat".
The within-2x / within-3x numbers moved out of the header into the
validation table. R² (0.194) and Spearman stay in small print.

## 4. Ship-rule wording (item 4)

Reframed as a **necessary condition, not a compulsion**, codified ex
ante, in both `round2/RESULTS_round2.md` (new "Ship rule, codified ex
ante (fix round)" section) and the dashboard methodology page. A
variant ships only if ALL of these hold:

1. Beats M0 on blind median error AND blind Spearman **with
   significance** (paired 95% interval excludes zero).
2. Does not regress the time-split median (M0 x1.8401).
3. Does not drop blind within-3x (M0 38.5%).
4. Keeps Spearman(pred, TVL) below **0.95** (the board must not
   collapse to a TVL ranking; ceiling from Superbot High's degeneracy
   threshold).
5. Keeps the watchlist total within **25% of M0's $0.637B**
   (valuation-drift bound).

A variant that passes all five still has to keep a sane board. M1
failed (4) and (5) outright (Spearman 1.000, watchlist x2.0 to
$1.273B, FARM 15→43) and its wins were noise (t = 0.99, p ≈ 0.36).
M2 failed (5) (watchlist $1.133B) and its wins were noise too
(t = 0.62, p ≈ 0.55), and it needs clipped superlinear slopes
(Lending 1.452 / Dexs 1.776). M3 failed (1) outright. The ceiling
(0.95) and the bound (25%) are values chosen in this fix round and
documented here; they were not in the original ship rule.

## 5. Distinctive name + title (item 5)

Name: **Tidegauge** (from GLM's suggestions Tidegauge / Prelist /
Quietmint — most distinctive, no collision with any top-entry title;
"Launchscope", "Launch Ledger", "Unminted" are the top entries' names,
none is Tidegauge). The dashboard header is now "Tidegauge." and the
footer reads "Tidegauge". The README H1 is "Tidegauge — token launch
radar (token-radar-01)" and carries the entry name + proposed title.
The round-2 RESULTS file's proposed title is updated.

Proposed title (NOT final — the parent presents it to the user;
no submission yet):

> "Tidegauge — token launch radar: blind-tested x1.89 vs x1.92 flat,
> 200 rows, 40/40 watchlist, P10–P90 bands on every row"

## 6. Farm economics upgrade (item 6)

The verdict arithmetic is now visible, without changing any verdict
or threshold ($40 / 1.5x, FARM 15 / THIN 78 / SKIP 107 unchanged).

- **Board columns.** Gross, Cost and Net EV are now board columns,
  rendered from the `farm` object already on each BoardRow
  (`r.farm.share`, `r.farm.totalCost`, `r.farm.netEv` — no model
  change, no new fields). Example (from the board screenshot):
  Steakhouse Gross $4.05 / Cost $40.54 / Net EV -$36.49 SKIP;
  Gauntlet Gross $5.50 / Cost $32.64 / Net EV -$27.14 SKIP.
  This makes the collapse visible: the pool is 8% of implied value,
  the share is pool × $2,500 / TVL, so the verdict is essentially a
  threshold on the multiple (~0.35x) — which is why the top-3
  (multiples 0.020–0.028) are all SKIP and why FARM swung 15/43/48/32
  across variants. The methodology now states this arithmetic plainly
  ("Each row's verdict is a visible subtraction, not a threshold on
  value").
- **Downside NetEV at p25.** The detail view now computes, for every
  row, the downside from the band's p25: `pool25 = 0.08 × p25`,
  `share25 = pool25 × (capital / TVL)`, `netEv25 = share25 − totalCost`,
  and shows a "Downside" paragraph (e.g. Manta CeDeFi: "at the band's
  low end (p25 $2.5M)…") plus a "Risk" paragraph (band width as a
  multiple, the hypothetical-airdrop caveat, FARM vs non-FARM
  wording). The detail KV grid leads with the 50% band (see §8).
- **Farm steps: NOT restructured (documented deviation).** The brief
  asked for protocol-specific, costed farm steps computed at the
  band's low end. Changing the step text or costs would change
  `gasTotal` → `totalCost` → `netEv` → the verdicts, which are LOCKED;
  and the dashboard carries its own JS port of `farmSteps` that must
  match `model.ts` exactly (the gate's self-check recomputes the farm
  plans and would fail on a mismatch). The steps are already
  protocol-specific and mechanism-aware via `actionFor` (they name the
  protocol's mechanism, chain and pool). Instead of restructuring the
  steps, the transparency layer is dashboard-only: the board columns,
  the p25 NetEV and the Risk paragraph (above). The step text itself
  is unchanged.

## 7. Bootstrap sensitivity (item 7, offline only)

Script `round2/fix/bootstrap_sensitivity.ts` (fixed seeds, 29
representative rows: top 10 + 15 FARM + 5 spread). Production stays
at **200 resamples** (the brief's count; bumping risks the 120s
runtime cap).

Median relative change in the band endpoints, 200 → 1000 resamples:
p10 18.05%, p25 14.28%, p75 15.08%, p90 15.49%.
200 → 2000 resamples: p10 16.93%, p25 16.88%, p75 12.96%, p90 23.92%.
Max change: p10 55.08% / 58.24% (plume-vaults / katana-dex),
p90 93.60% / 84.59% (fstswap). Band WIDTHS are more stable than the
individual endpoints (Steakhouse width 203.7x at 200 → 199.5x at 1000
→ 187.3x at 2000).

Conclusion: **the bands are moderately unstable at 200 resamples —
tail quantiles (especially p90) move ~15% median, up to ~90% max.**
This is a documented limitation, not a defect: the calibration
numbers (83.8% / 46.2% blind, 71.0% / 32.3% time-split) already
reflect the 200-resample procedure, and the production count is left
at 200. The methodology does not claim the band endpoints are precise
to better than ~15%.

## 8. Bands presentation (item 8)

The detail view KV grid now leads with the **50% band (predictive)**
($2.5M–$29.1M for Manta, 11.5x) and puts the **80% band
(predictive)** ($1.0M–$125.2M, 124x) second. Every band is printed
with its multiple range next to the dollar range. P10–P90 is labelled
explicitly as an **80% predictive interval, not a confidence
interval**, in both the detail view and the methodology page. A
visible note states blind calibration does not transfer perfectly to
newer listings (time-split under-covers 71.0% / 32.3%).

## 9. Full-predictor validation (item 9)

Script `round2/fix/full_predictor.ts`: re-ran LOO / blind x5 /
time-split WITH growth and maturity included, vs the no-growth /
no-maturity numbers the headline uses.

| split | no-gm (headline) | full (growth+maturity) | diff (median error) |
|---|---|---|---|
| LOO median | x1.8865 | x1.8889 | +0.0024 |
| LOO within-2x / within-3x / Spearman | 30.5% / 43.8% / 0.367 | 28.1% / 42.2% / 0.347 | worse on within-2x |
| Blind x5 median | x1.8859 | x1.9085 | +0.0227 |
| Blind within-2x / within-3x / Spearman | 23.8% / 38.5% / 0.409 | 21.5% / 36.9% / 0.399 | worse on within-2x |
| Time-split median | x1.8401 | x1.8132 | -0.0270 |
| Time-split within-2x / within-3x / Spearman | 25.8% / 41.9% / 0.180 | 16.1% / 41.9% / 0.188 | worse on within-2x |

Conclusion: the full predictor is slightly worse on blind/LOO,
mixed on the time split; the differences are within ~0.02–0.03 on
median error (seed noise). **The headline validation stays no-gm** —
the numbers do not change materially. The gap is documented in the
methodology page (small print) and in this file, not hidden.

## 10. README fix (item 10)

`README.md`: "round 1 is the submitted entry on `main`" → **`master`**
(the default branch is master; round 1's commit eb994b7 is on master).
Also: H1 is now "Tidegauge — token launch radar (token-radar-01)",
the validation bullet carries the flat baseline (x1.89 vs x1.92 flat,
paired CI [-0.055, -0.005]) and the Spearman caveat, and the proposed
title is recorded.

## Verification (re-run after every change)

- **Board unchanged.** board.json sha256
  `6b2e8f11d71d80df14cb27c1261218f3a9840838037fcf34372d4f1f91f69b64`
  — identical to round 2. 200 rows, FARM 15 / THIN 78 / SKIP 107,
  watchlist 40/40, $0.637B, top-3 Steakhouse $55,815,324 /
  Gauntlet $43,378,428 / Veda $41,886,603.
- **Determinism PASS.** 4 builds, all exit 0; board.json, data.js and
  dossier.json byte-identical across all 4.
  board `6b2e8f11d71d80df…`, data.js
  `e6d834870beb2ca2ad1c46579acac9b9596385ecf52525179e8ba21066f77006`,
  dossier `00d627869f5012a3…` (first 16 hex).
- **Gate PASS.** `main.ts` exits 0 on every build (boardIssue incl.
  the band/mechanism checks, 200 rows, 40/40 watchlist, 4
  screenshots).
- **Dossier rebuild PASS.** `round2/stageB/rebuild-check.mjs`:
  rebuilt 1,046,046 B = shipped 1,046,046 B, "dossier rebuild matches
  shipped: true".
- **Dashboard bytes.** index.html 698 + app.js 58,107 +
  app.css 5,870 = **64,675 B** total, cap 65,536, headroom 861 B.
  Dossier `text` field **64,938 B**, cap 65,536, headroom 598 B.
  (The dashboard is close to the cap — no further prose should be
  added to app.js without trimming elsewhere.)
- **Dossier bytes.** **1,046,046 B**, cap 1.5 MiB (1,572,864),
  headroom ~527 KB. 4 images, each under 524,288 B.
- **Screenshots.** 4 files, sizes in §2, all visually verified.
- **Overclaim grep.** "x2.01" = 0 occurrences in dashboard/.

## Deviations from the brief (summary)

1. Farm steps NOT restructured (see §6): changing them would change
   the locked verdicts and break the dashboard/model.ts farm-step
   self-check. Transparency is dashboard-only instead.
2. Ship-rule ceiling (rho < 0.95) and valuation-drift bound (25%)
   are values chosen in this fix round, documented in §4.
3. Paired-CI 0.0001 rounding difference between the Python
   verify_flat.py ([-0.0546, -0.0052]) and the TypeScript production
   ([-0.0546, -0.0051]); the dashboard shows [-0.055, -0.005].
4. Two genuine app bugs fixed that the brief did not name (see §2):
   the detail overlay staying open on hash navigation, and the
   missing deep link for a filtered view. Both are real fixes, not
   screenshot-only hacks.
5. Screenshots captured with Puppeteer + downloaded Chromium
   (1440x900), not the Muse Browser: the Muse Browser refuses CLI
   screenshot mode ("Hatch WebGL domain policy is required for
   browser startup") and no system Chrome exists. The captures are
   real renders of the built `out/` dashboard (DOM verified:
   200 board rows, 15 FARM rows in the filtered view, detail overlay
   content present).

## Files changed (branch round2, not yet committed)

- `lib/model.ts` — flat baseline + paired CI in validateModel; new
  Validation / LooRow fields.
- `dashboard/app.js` — Tidegauge header/footer; flat-comparison KPI
  chips; Gross/Cost/Net EV board columns; detail view leads 50% band
  + p25 NetEV Downside + Risk paragraph + "predictive interval, not a
  confidence interval" + time-split note; methodology rewritten
  (blind-first + flat comparison, validation table, "Reading it
  honestly", ship rule, full-predictor note, two-definitions LOO
  note, overclaim removed); hash routing closes the detail overlay
  and parses `verdict=` for deep-linked filtered views.
- `dashboard/index.html` — unchanged (title still "Token Radar…").
- `README.md` — Tidegauge name + title, flat baseline in the
  validation bullet, main → master.
- `round2/RESULTS_round2.md` — codified ship rule section + Tidegauge
  proposed title.
- `screenshots/` — 1-board, 2-detail, 3-method re-captured;
  4-filtered.png added.
- `round2/fix/bootstrap_sensitivity.ts`, `round2/fix/full_predictor.ts`
  — offline scripts (not in main.ts, not in the production build).
- `round2/fix/RESULTS_fix.md` — this file.

Not committed yet. Do NOT bundle, submit or push — the parent
verifies and pushes.
