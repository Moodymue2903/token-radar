# Token-Radar Round 5 Audit — Qwen (2026-11-17 ~10:30 IST)

Source: new Qwen chat (Zeeshan Kazi, Free, model switched to Qwen4-Max) at https://chat.qwen.ai/c/c122ee64-61c4-4ce0-8656-b7393bfc1173. Full reply received verbatim via browser task 42db5a6e. Ran 10 minutes (longest of the six).

## Verdict: (b) SUBMIT WITH FIXES

"The model is at parity, the build verification is genuinely strong, and the 62% correction was the right call. But as reported, one pair of headline statistics is mathematically inconsistent, the ROBUST tier oversells cent-level margins, and your best honesty evidence is computed but not displayed. All of it is fixable well before the Dec 14 deadline (27 days out). Do not spend that time on more model tuning."

## 1. Model choice — ship the full model, with the trade-off disclosed

- The +2.1pp is 2 rows out of 95. The -0.019 Spearman is nothing. Both deep inside the paired noise floor (~±8pp / ~±0.10) — not a real trade-off, a coin flip between two statistically indistinguishable models. Neither number is an "improvement", and the board must never imply the category layer "added 2pp of accuracy".
- Choosing on within-3x is legitimate ONLY if within-3x is declared the primary metric before the comparison — coherent, since within-3x is the product's actual promise ("our number is within 3x of reality half the time"). Ship the full model, and on the calibration tab state the procedure explicitly — primary metric declared, both models shown side by side (48.4% / 0.359 vs 50.5% / 0.340), differences flagged as within noise. Converts a potential metric-shopping ding into a calibration-maturity signal.
- Two hard rules: never mix the full model's within-3x with the bare model's Spearman in one headline, and never present 50.5% as a stable property rather than an n=95 estimate.
- The full model also powers the category/anchors narrative; the bare curve would orphan the shrinkage content in feature (g). Ship full.
- MINOR BUT REAL (Huber delta scale): state the scale of Huber δ=1.0. Qwen's claim: "If residuals are in log10 (σ≈0.4–0.7 dex), δ=1.0 downweights almost nothing and Huber ≈ OLS — the robustness claim is cosmetic. Either scale δ to ~1.345·MAD or disclose that it's effectively OLS here."
- CORRECTION TO QWEN (Muse's verification, round5/reconcile_median.ts): Qwen's σ premise is WRONG. The actual LOO residual sd is 0.867 dex and the full-fit residSd is 0.854 dex, not 0.4–0.7. δ=1.0 is ~1.15σ (standard Huber tuning is 1.345σ for 95% efficiency — δ=1.0 is slightly MORE aggressive than standard). 19/95 peers (20.0%) have |log10 LOO resid| > 1.0 and are downweighted vs OLS. The Huber is doing real work, not cosmetic. Qwen's criticism is refuted by the data. (Caveat: the 20% is for out-of-sample LOO residuals; in-sample fit residuals are smaller, so the in-sample downweight fraction is lower — but δ=1.0 is not negligible relative to σ≈0.85.)

## 2. ROBUST redefinition — criterion defensible; name and margins are not

- Net EV >= $0 at p25 is simple, checkable, monotone. Keeping the criterion is fine. Three problems:
- (a) The bar moved after seeing the data ($40 → $0). Goalpost-moving unless disclosed on the board itself, not just in the commit message. Add one line: "No row on this board clears $40 at P25; the strongest P25 case is BinaryX at +$8.76." That sentence buys more trust than the tier itself.
- (b) Two of five rows clear by $0.47 and $0.53 — within cent-rounding, within a 5% gas move. Calling Bucket "ROBUST" when it breaks even to the cent is the board's weakest claim. Stress-test gas/time ±10–20% and demote or flag rows that flip sign.
- (c) "Low end of its band" is wrong phrasing. P25 is not the low end of outcomes — 1 in 4 realizations is worse. Say "25th percentile of the model's out-of-sample error."
- Rename the tier to something criterion-literal — "P25-POSITIVE" or a "floor ≥ $0" chip on FARM — and show the p25 EV beside every badge. The BounceBit callout must carry its +$0.53 p25 next to the $33.95/h, or the most prominent row is the most oversold one. Fix the labeling tension: counts show ROBUST 5 / FARM 6, but the legend says ROBUST ⊂ FARM (5 of 11). Display "FARM 11, incl. 5 P25-positive" or the judge will trip on 6 vs 11. Define THIN and SKIP with exact numeric criteria in the same legend.

## 3. Honesty of reported numbers — ONE PAIR DOES NOT RECONCILE (the audit's most important finding)

- Qwen's claim: "If 48/95 errors are ≤3×, the median error is the 48th order statistic — it must be ≈2.9–3.0×. It cannot be 1.815×. The same contradiction holds for blind (42.1% within-3x → median >3×, not 1.898) and time-split (41.9% → not 1.829). Three consistent contradictions means a definitional problem, not a typo."
- VERIFICATION (Muse, round5/reconcile_median.ts): Qwen's arithmetic is CORRECT for the median max-ratio, and the code confirms the two statistics are different things:
  - The reported "median error x1.82" is `adoptedMedian` = median1p = 1 + median(|p−act|/act) = 1.8154× (lib/model.ts: `looMetrics` line 1158, `validateModel` line 1556). It is computed over ALL 95 LOO predictions, NOT just the within-3x hits — so Qwen's "most likely benign explanation" (survivorship/median-among-hits) is WRONG.
  - The median max-ratio (median of max(p/act, act/p)) IS 2.9623× — exactly the ≈2.9–3.0× Qwen predicted. It is computed and stored as `adoptedMedianMaxRatio` but is NOT the headline "median error".
  - The two differ because APE = |p−act|/act is asymmetric: for underpredictions APE saturates at 1, while max-ratio is symmetric. The dashboard labels median1p as "median error", which a reader naturally reads as the median max-ratio. The numbers look inconsistent because they are different statistics sharing a label family.
  - Qwen's "worse possibility" (median signed ratio, model underpredicts by ~1.8×, every implied value systematically inflated) is WRONG in magnitude and direction. The median LOO log10 residual is −0.0668 dex → median pred/actual = 0.8575×. The model DOES systematically underpredict, but by only ~14% at the median (mean residual −0.0547 dex), not 1.8×. And underprediction makes the implied values CONSERVATIVE (low), not inflated — so the EVs are understated, not overstated. The bias is real but modest (14% vs a residual sd of 0.867 dex = 7.4× spread) and should be disclosed; recentering the intercept by +0.067 dex would remove it (a calibration fix, not a rebuild).
  - Blind: per-seed median1p 1.84/1.89/2.12/1.77/1.87 (mean 1.898, the reported figure); per-seed medianMax 2.35/3.83/5.28/3.77/4.59. Time-split: median1p 1.8293, medianMax 3.4262. Same labeling issue on all three.
  - AGGREGATION ANSWER (Qwen asked): the blind numbers are the MEAN across the five seeds (each n=19), not a pooled rate and not a median. Within-3x 42.11% = mean of 52.63/47.37/31.58/36.84/42.11. Median1p 1.898 = mean of the five per-seed medians. This must be stated on the board.
  - FIX: report the median max-ratio (2.96× LOO, ~3.8× blind, 3.43× time-split) as the headline "median error" (it reconciles with within-3x), OR relabel the 1.815 figure precisely ("median 1+|error|/actual"). Do NOT ship a "median error" that a numerate judge cannot reconcile with within-3x in one line of arithmetic.
- n=95 exclusion: the model's inputs are TVL and category — listing date is not a model input. Excluding 33 dateless peers from every fit, validation, and band is therefore a choice, not a necessity. Those peers are traded (gecko_id present) and scorable. Biggest cherry-pick attack surface. Fix: state the exclusion rationale, and report the all-128 within-3x as a sensitivity line next to the 95 number.
  - ANSWER (Muse, round5/sensitivity128.md): the all-128 LOO is 46.09% (adopted) / 43.75% (size curve) vs 50.53% / 48.42% on n=95. The 33 dateless peers ARE systematically harder (−4.43pp). The headline is flattered by ~4.4pp relative to the full universe. Both numbers must be published.
  - NUANCE: listed_at DOES work in the pipeline — it drives the maturity multiplier (age) used in the board's implied values (withGm=true) and defines the time-split. But the LOO headline uses the noGm predictor, so listed_at is NOT consumed in the LOO validation itself. Superbot's version of this challenge is valid for the LOO number specifically.
- Completeness: "50.5% (n=95)" needs a Wilson CI (≈41–60%), the blind 42.1% and time-split 41.9% beside it, the baselines (35.8% / 37.9%, +12.6pp lift framed modestly — ~1.6× the noise floor), and band coverage vs nominal (82.1%/80%, 45.3%/50% — "approximately calibrated, 50% band slightly narrow out-of-sample"). State how the ×5 blind results are aggregated (mean of five n=19 splits, not a pooled rate).
- Checkability: the anchors tab must show each peer's out-of-fold implied value plus a within-3x flag, so a reader can count 48/95 themselves. If it shows full-fit values, the count won't reproduce and the headline fails its own audit. The scatter must draw exact 1/3× and 3× lines: the 0.40×–3.39× shading is a residual-quantile band, not the scoring band — label them separately or a judge counting points "inside the band" gets the wrong number. Add one coverage line reconciling all four denominators: 200 board rows → 128 universe → 95 scored peers → 31 time-split.

## 4. Dashboard — the evidence exists; it's hidden

- Weak against the top entries: (i) "out-of-sample tests on the board" is LOO only — blind ×5 and time-split are computed but not listed among the displayed features, precisely the category the leaders emphasize; (ii) "netted farm plans" — per-row net EV and $/h but no aggregate plan; (iii) pairwise judging sees the default view, and 6 of 8 features live behind tabs — if the judge screenshots the landing state, the calibration and anchors tabs (the entire honesty story) are invisible; (iv) round-3's identity ranked ~1392 — keeping the palette is fine, but the first viewport must materially change.
- SINGLE MOST IMPORTANT IMPROVEMENT: a first-view calibration panel that makes the headline complete and self-proving — LOO 50.5% (48/95, CI ~41–60%) · blind 42.1% · forward 41.9% · baselines · band coverage — with the scatter's exact 3× lines and the anchors' out-of-fold column one click away. "You are at model parity; demonstrated honesty is the only lever left, and you are currently hiding your best evidence. A dashboard that shows its own weaker forward number reads as more trustworthy in pairwise comparison, not less."

## 5. Risks

- The median-error/within-3x inconsistency (§3) — fatal to credibility if a judge checks; worse if it's real underprediction bias inflating every EV. (Muse: the bias is real but only ~14% and conservative, not inflating. The labeling is the fatal part.)
- ROBUST cent-margins and the BounceBit callout juxtaposition (§2).
- The 33-peer exclusion without a sensitivity number (§3). (Muse: now have it — 46.09% on n=128.)
- 0.40×–3.39× shading conflated with the 3× scoring rule.
- "Watchlist implied value $0.600B" is a vanity aggregate unless paired with the current-mcap sum and the gap; as-is it's a meaningless big number.
- No visible as-of timestamp or source provenance — a sealed snapshot needs its date and sources on the board.
- Time-split ρ=0.184: forward ranking is weak. Do not imply 50.5% applies to new listings; the honest expectation for a fresh token is ~42%, and the callout should say so.
- Huber δ scale and pseudo-R² labeling (§1). (Muse: δ scale criticism refuted — see §1. R²=0.166 is the Huber fit's own R², correctly labeled.)
- Worth keeping and surfacing: byte-identical determinism, independent re-run, farm-arithmetic spot checks, originality check, bands built from out-of-sample residuals, flat baselines, and the verified 62% correction. That is real rigor — it currently lives in the verification log instead of on the board.

## Verdict: (b) SUBMIT WITH FIXES — top 3, in priority order

1. Reconcile and complete the evidence chain. Define within-3x and median error precisely; fix or relabel the 1.815/1.898/1.829 figures; add CI, blind, time-split, baselines, and coverage to the board; disclose the 33-peer exclusion with an all-128 sensitivity number; make the anchors tab out-of-fold with hit flags so 48/95 is countable; draw exact 1/3×/3× scatter lines distinct from the residual band.
2. ROBUST honesty pass. Criterion-literal name; on-board disclosure that the $40 bar was unreachable (best +$8.76); p25 EV beside every badge and in the BounceBit callout; "25th percentile, 1-in-4 worse" phrasing; gas/time stress test demoting cent-margin flippers; exact THIN/SKIP criteria.
3. First-view recomposition for pairwise judging. Calibration strip + best-farm callout (with p25) + tier counts + as-of date above the fold; an aggregate session plan (the five P25-positive farms ≈ +$345 expected / +$19 at p25 plus total hours — a real plan that honestly exposes the thin floor); tabs for depth, never for primary evidence.

"The model work is done. The remaining gap is exactly what the experiment-7 finding said it was — presentation and demonstrated honesty. Spend the 27 days there, not on noise-farming n=95."

## Convergence/divergence vs the other five

- UNANIMOUS (6/6): submit with fixes, not as-is. The model is at parity; do not rebuild it.
- Qwen's UNIQUE contribution (the audit's most important finding): the median-error/within-3x inconsistency — no other auditor caught it. Also unique: the Huber δ scale question (refuted by Muse's check), the as-of timestamp / source provenance gap, the "watchlist $0.600B is a vanity aggregate" point, the anchors-tab out-of-fold checkability requirement, the exact 1/3×/3× scatter lines, the first-view recomposition for pairwise judging (6 of 8 features behind tabs = invisible to a screenshot judge), and the aggregate session plan idea (+$345 expected / +$19 at p25).
- Qwen's two errors (corrected by Muse): (a) the "median among within-3x hits" explanation for 1.815 is wrong — it is median1p over all 95; (b) the Huber δ≈OLS claim is wrong — σ is 0.867 dex, δ=1.0 downweights 20% of peers.
