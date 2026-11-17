# Token-Radar Round 5 — Audit Fixes (2026-11-17 ~10:48 IST)

All 10 audit fixes implemented, independently verified by Muse, screenshots retaken. Branch `round5-dashboard`, NOT yet committed/pushed/bundled/submitted.

## Model layer (lib/model.ts, main.ts — done by Muse)

- Verdict `ROBUST` renamed to `P25-POSITIVE` (type, promotion, console output). Board data unchanged in count: P25-POSITIVE 5 / FARM 6 / THIN 72 / SKIP 117.
- Median error now reports the median max-ratio: LOO x2.96 (was x1.82 median1p), blind x3.97, time-split x3.43. The 1.815 figure is retained in data.js as `adoptedMedian` but labelled "Median 1+|error|" wherever it appears — never as the headline "median error".
- Bias disclosed: median LOO log10 residual −0.067 dex (median pred/actual 0.86x, ~14% underprediction, conservative).
- 128-peer LOO added to validation: adopted 46.09% / Spearman 0.373 / medianMax 3.48 on n=128 (vs 50.53% / 0.340 / 2.96 on n=95); size curve 43.75% / 0.410; flat 33.59%; global median 35.16%.
- Out-of-fold implied value + within-3x flag added to every PeerPoint (48/95 hits, countable from the anchors tab).
- Blind aggregation: the blind numbers are the MEAN across the five seeds (each n=19), not a pooled rate or a median — stated on the board.

## Dashboard layer (dashboard/app.js + app.css — coordinator 4adcb9e1, verified by Muse)

1. ROBUST → P25-POSITIVE everywhere (grep: 0 remaining in dashboard/).
2. Tier counts: "FARM 11, incl. 5 P25-positive · THIN 72 · SKIP 117"; legend states P25-POSITIVE is a subset of FARM (5 of 11), not a fourth tier.
3. Median error = max-ratio everywhere; bias disclosed; the 1.82 figure relabelled.
4. 128-peer sensitivity in the calibration tab (4-row within-3x table + denominators line "200 board rows → 128 universe → 95 scored peers → 31 time-split"); KPI chip "50.5% (n=95 of 128)".
5. First-view calibration panel above the fold: LOO 50.5% (48/95, Wilson 95% CI 41–60%, computed in-page), blind 42.1%, time-split 41.9%, baselines 35.8%/37.9% (lift +12.6pp), band coverage 82.1%/45.3%, noise floor ±8pp/±0.16, bare 48.4%/0.359 vs full 50.5%/0.340, as-of 2026-11-14 + DefiLlama source, blind aggregation note.
6. Formula box: "log10(value) = 3.138 + 0.508 × log10(TVL) + shrunk category offset (k=5)" + the model-choice rationale (within-3x declared primary; models statistically indistinguishable; full model shipped for category dispersion).
7. Per-row comps: "Nearest traded comps" in each detail view (3 nearest same-category peers by log-TVL, with TVL, actual mcap, out-of-fold implied, actual/implied ratio; falls back to all categories with a note).
8. "50% band" renamed "central band (45% coverage)" (grep: 0 remaining); scatter draws exact 1/3× and 3× solid gold lines, distinct from the 0.40×–3.39× residual shading, captioned as a residual band, not the scoring band.
9. Economics disclosure: best-hour callout shows p25 beside $/h (BounceBit Prime $33.95/h, +$0.53 at p25, 155 min) + assumptions note; watchlist total paired with its P25–P75 range ($0.600B, P25–P75 $197.9M–$2.11B), labelled "sum of point-estimate implied values, not expected capture".
10. Anchors tab out-of-fold: columns TVL, market cap, out-of-fold implied, actual/implied (OOF), Within-3x (✓/✗). Header: "48 of 95 peers land within 3x out-of-fold — count them here."
11. P25-POSITIVE disclosure: "No row on this board clears $40 at p25; the strongest p25 case is Binaryx Platform at +$8.76. The original $40-at-p25 bar returned zero rows, so the tier is defined by the break-even floor instead — a disclosed change, not a hidden one." THIN/SKIP defined with exact numeric criteria. "1 in 4 realisations is worse" phrasing for p25.
12. Aggregate session plan: five P25-positive farms ≈ +$344.76 expected / +$19.38 at p25, 805 hands-on minutes (~13.4h); "The floor is thin: 2 of the 5 clear break-even at p25 by less than a dollar."

## Extra honesty fix found during the work (not in the 12)

The old method text said the paired 95% interval [-0.581, 0.359] for the blind median advantage was "entirely below zero, so the advantage is real" — it crosses zero. Corrected to "it crosses zero, so the median advantage is not established on the blind splits; the advantage that holds up is on within-3x" (+5.26pp). The blind median advantage was never significant.

## Verification (Muse, independent of the coordinator)

- Rebuild: exit 0, 758 protocols, 200 rows, $0.600B, 50.5% within-3x, verdicts P25-POSITIVE 5 / FARM 6 / THIN 72 / SKIP 117. data.js md5 c635547e1a9e461751491671b059f01f, identical across rebuilds (deterministic).
- DOM-stub harness (Muse's own, /tmp/r5fix_verify3.js): all 5 tabs render (board 177,279 chars; live 7,470; anchors 20,311; method 21,959; calibration 6,978); 24/24 key-string probes pass (median error x2.96, blind x3.97, 46.1%, 42.1%, 41.9%, FARM 11, 48 of 95, 45% coverage, category offset, n=95 of 128, Wilson CI, blind mean across five, Binaryx +$8.76, bias −0.067 dex, 14%, aggregate $344, out-of-fold, 3x scoring lines, denominators, $40 disclosure, 1-in-4); ROBUST = 0 and "50% band" = 0 in the rendered output; anchors 48 ✓ / 47 ✗ (countable).
- Screenshots: fresh 1024×711, all under the 512KB cap (1-board 112,927 B; 2-detail 159,851 B; 3-calibration 121,002 B; 4-anchors 118,816 B); all four visually inspected by Muse — they render correctly and show the fixes.
- Known limitation (pre-existing, not in the 12): scatter points use in-sample fitted implied values while the band is the LOO residual band. Possible follow-up: switch scatter points to out-of-fold values so points and band share a basis.

## Status

Fixes complete and verified. NEXT: user reviews the fixed dashboard (screenshots attached), then commit + push + bundle + `makefun check` + submit (only on the user's go-ahead). Deadline 2026-12-14T10:00Z, 8 submissions left. Live round-3 entry (Tidegauge, 914,351) untouched.
