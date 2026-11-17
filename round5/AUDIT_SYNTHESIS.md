# Token-Radar Round 5 — 6-Model Audit Synthesis (2026-11-17 ~10:30 IST)

Auditors: Gemini, DeepSeek, GLM, ChatGPT, Qwen, Superbot. All six briefed identically, all six replied in full. Files: `round5/audit_{gemini,deepseek,glm,chatgpt,qwen,superbot}.md`. Supporting verification: `round5/sensitivity128.md` (all-128 LOO), `round5/reconcile_median.ts` + notes in `audit_qwen.md` (median-error reconciliation).

## UNANIMOUS VERDICT (6/6): (b) SUBMIT WITH FIXES

None said submit as-is. None said do not submit. The model is at parity; do NOT rebuild it. Every fix is presentational, disclosure, or a small dashboard addition — no model rebuild, no re-tuning.

## Convergent findings (all six agree)

1. **ROBUST name is the biggest problem (6/6).** All six want it renamed/relabelled to something criterion-literal. Gemini: keep ROBUST but label "Downside-safe (EV P25 ≥ $0)". DeepSeek: rename to "Downside-safe (P25 ≥ $0)" outright — the word ROBUST is the problem. ChatGPT: rename to P25-POSITIVE. Superbot: rename + fix the tier-count partition bug. GLM: retire it or use graduated disclosure (FARM+ at p25/p50/p75). Qwen: rename to P25-POSITIVE or a "floor ≥ $0" chip on FARM.
2. **n=95 needs disclosure + the 128-peer sensitivity (6/6).** All six asked for it. RUN AND ANSWERED (round5/sensitivity128.md): all-128 LOO is 46.09% (adopted) vs 50.53% on n=95 — the 33 dateless peers ARE systematically harder (−4.43pp). Both numbers must be published.
3. **Blind/time-split must be visible on the board, not buried in a tab (6/6).** 42.1% blind, 41.9% time-split next to the 50.5% LOO.
4. **Do not claim the full model is statistically superior (6/6).** The +2.1pp is noise (2 rows out of 95). Reframe: declare within-3x the primary metric, show both models, flag the difference as within noise. GLM's dispersion justification is the strongest reason to ship the full model (the bare curve gives every same-TVL protocol the same implied value). Superbot alone (1/6) wants the bare curve as primary (parsimony).
5. **Per-row comps / candidate-level evidence (4/6: Gemini, ChatGPT, GLM, Qwen).** Nearest 3–5 traded peers in each detail view, with actual mcap, TVL, implied multiple. The #1 improvement for Gemini, ChatGPT, GLM.
6. **Formula box must reconcile with the full model (5/6).** The box shows the bare-curve equation but quotes the full model's 50.5%. Add "+ shrunk category offset (k=5)".

## Unique findings (each caught by one auditor, all verified by Muse)

- **QWEN — median-error/within-3x inconsistency (MOST IMPORTANT, no other auditor caught it).** The reported "median error x1.82" is median1p = 1 + median(|p−act|/act) = 1.8154×, NOT the median max-ratio. The median max-ratio IS 2.9623× — exactly what Qwen predicted. A numerate judge catches this in one line of arithmetic. FIX (blocking): report the median max-ratio (2.96× LOO, ~3.8× blind, 3.43× time-split) as the headline "median error", or relabel the 1.815 figure precisely. Also: the model underpredicts by ~14% at the median (median log10 residual −0.0668 dex) — real but modest and CONSERVATIVE (implied values low, EVs understated, not inflated). Qwen's "median among within-3x hits" explanation is WRONG (median1p is over all 95); Qwen's "underpredicts by 1.8×" is WRONG in magnitude/direction (it's 0.86×, i.e. −14%). The blind numbers are the MEAN across the five seeds (each n=19), not a pooled rate or a median — must be stated.
- **QWEN — Huber δ scale.** REFUTED by Muse: σ is 0.867 dex (not 0.4–0.7), δ=1.0 is ~1.15σ, and 20% of peers are downweighted. The Huber is doing real work, not cosmetic.
- **GLM — "50% band" mislabel.** Coverage is 45.3%, not 50%. Rename to "central band (45% coverage)" or tighten the construction.
- **GLM — LOO "partly in-sample" claim.** WRONG, refuted by code: `looRun` refits `fitModel` on the 94 training peers per fold. The only selection effect is that hyperparameters (k=5, minPeers=3, winsor percentiles) are fixed constants chosen during round-4 experimentation — mild and standard.
- **SUPERBOT — tier-count partition bug.** ROBUST 5 / FARM 6 / THIN 72 / SKIP 117 sums to 200 and reads as four disjoint tiers, but ROBUST ⊂ FARM, so "FARM 6" is really "FARM-only 6". Report "FARM 11, of which ROBUST 5".
- **SUPERBOT — listed_at not in the formula.** The LOO uses the noGm predictor, so listed_at is not consumed in the LOO. The 128 sensitivity (46.09%) answers this. (Listed_at DOES work in the board via the maturity multiplier and defines the time-split.)
- **SUPERBOT — lead with the +12.6pp lift over the flat baseline** (paired, identical rows). The defensible lift.
- **SUPERBOT — TVL-decile calibration table** as the single most important improvement (alternative to per-row comps).
- **CHATGPT — nested-refit leak check.** VERIFIED: `looRun` refits per fold; winsor bounds, global median, category medians, and Huber coefficients are all recomputed from training peers only. No leak.
- **QWEN — first-view recomposition.** 6 of 8 features live behind tabs; a screenshot judge never sees them. Calibration strip above the fold.
- **QWEN — aggregate session plan.** Five P25-positive farms ≈ +$345 expected / +$19 at p25 plus total hours.
- **QWEN — as-of timestamp / source provenance missing; $0.600B is a vanity aggregate** (pair with current-mcap sum and the gap).
- **CHATGPT — economics assumption disclosure.** $33.95/h false precision — disclose hours, costs, liquidity, vesting, mcap definition, dilution.

## Synthesised fix list (priority order)

1. **Fix the median error (Qwen — BLOCKING).** Headline "median error" becomes the median max-ratio (2.96× LOO, ~3.8× blind, 3.43× time-split). Disclose the −0.067 dex (~14%) underprediction bias. State the blind aggregation (mean of five n=19 splits).
2. **Rename ROBUST → P25-POSITIVE (or Downside-safe) + fix tier counts.** Display "FARM 11, incl. 5 P25-positive". Disclose on-board: "No row clears $40 at P25; the strongest P25 case is BinaryX at +$8.76." Show p25 EV beside every badge and in the BounceBit callout. "25th percentile, 1-in-4 worse" phrasing. Define THIN/SKIP with exact numeric criteria in the legend.
3. **Publish the 128-peer sensitivity + disclose n=95.** "LOO within-3x 50.5% on the 95 peers with listing dates; 46.1% on all 128 traded peers." Put the exclusion in the headline. Add the 128-vs-95 reconciliation table to the calibration tab.
4. **First-view calibration panel (above the fold).** LOO 50.5% (48/95, Wilson CI ~41–60%) · blind 42.1% · time-split 41.9% · baselines 35.8%/37.9% (+12.6pp lift) · band coverage 82.1%/80%, 45.3%/50% · noise floor ±8pp/±0.16 · bare model 48.4%/0.359 alongside full model 50.5%/0.340.
5. **Fix the formula box.** "log10(value) = 3.138 + 0.508 × log10(TVL) + shrunk category offset (k=5)". State the rationale: "within-3x is the declared primary metric; the two models are statistically indistinguishable; the full model is shipped for category dispersion and headline alignment, not because it is proven better."
6. **Add per-row comps (nearest 3–5 traded peers) to the detail view.** Category first, then nearest log10(TVL), with actual mcap, TVL, implied multiple.
7. **Fix the "50% band" label.** Rename to "central band (45% coverage)" or tighten the construction. Draw exact 1/3× and 3× scatter lines distinct from the 0.40×–3.39× residual band.
8. **First-view recomposition.** Calibration strip + best-farm callout (with p25) + tier counts + as-of date above the fold. Tabs for depth, never for primary evidence. Add the aggregate session plan (+$345 expected / +$19 at p25).
9. **Economics disclosure.** Show the cost line behind "net EV". Disclose the $33.95/h assumptions at the callout (or reframe/drop it). Pair the $0.600B watchlist value with the current-mcap sum, the gap, and a P25–P75 range.
10. **Anchors tab out-of-fold.** Each peer's out-of-fold implied value + within-3x flag, so 48/95 is countable.

## Model decision (for the user)

- 5/6 auditors ship the FULL model (Gemini, DeepSeek, GLM, ChatGPT, Qwen). Superbot alone wants the BARE curve as primary (parsimony, 4-knob fit on 95 rows). GLM's dispersion justification + Qwen's "declare the primary metric" framing are the strongest defences of the full model. RECOMMENDATION: keep the full model, with the reframed justification (fix #5).
- The 128-peer sensitivity (46.09%) does NOT change the model choice — the full model still beats the bare curve on within-3x on both peer sets (+2.34pp on n=128, +2.11pp on n=95), and the lift over flat baselines survives (+10.94pp on n=128).

## Status

Audit complete (6/6). Sensitivity run (128-peer LOO) complete. Median-error reconciliation complete (Qwen's finding confirmed as a labeling problem + a real ~14% conservative bias; Qwen's two sub-claims corrected). NEXT: user approves the fix list (and the model decision), then implement fixes, re-verify, re-screenshot, and submit only if the user approves. Deadline 2026-12-14T10:00Z, 8 submissions left. Live round-3 entry (Tidegauge, 914,351) untouched.
