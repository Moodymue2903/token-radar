# Token-Radar Round 5 Audit — ChatGPT (2026-11-17 ~10:22 IST)

Source: new ChatGPT chat (Zeeshan Kazi, Free) at https://chatgpt.com/c/6afbdd51-bc70-83ec-aa73-cc194ea32810. Full reply received verbatim via browser task a12a8da5. "Worked for 37s". LIMITATION: ChatGPT could not independently retrieve commit 7440dab through the public GitHub page (branch is local, unpushed) — this is an audit of the supplied implementation and verification evidence, not a fresh source-code execution or screenshot inspection.

## Verdict: (b) SUBMIT WITH FIXES — "Conditional approval — not ready to submit as-is"

"Round 5 has largely solved the presentation gap, but it has not yet solved the evidence gap. The leading dashboards do not just show impressive model outputs. They give the judge reasons to believe the recommendations."

## 1. Model choice: ship the FULL model, provisionally

- Full model is a reasonable alternative with a slightly better observed headline metric; NOT a proven predictive gain. Within-3x is a legitimate primary metric (valuation accuracy, not ordering). Spearman 0.340 is positive and useful, not particularly strong.
- Keep the full model, report both metrics, do NOT claim superiority over bare Huber, retain the bare Huber result in the methodology tab.
- NEW CHECK (not raised by Gemini/DeepSeek): verify that category shrinkage and its hyperparameters were selected using ONLY training-fold information in every LOO iteration. The brief says "nested refit" — that implementation detail is essential. If k=5 / winsor bounds were chosen on the full data and reused inside LOO, the LOO is leaky. MUST verify in lib/model.ts before submission.

## 2. ROBUST redefinition — "the most problematic decision in the dashboard"

- Defensible threshold, questionable name. Changing a threshold because it produces no qualifying observations is not, by itself, a statistical justification.
- Non-negative is not the same as robust. BounceBit Prime: expected net EV $87.71, P25 net EV $0.53 — a strategy with 53 cents of downside margin is effectively at break-even. Calling this robust is too generous.
- Preferred: rename ROBUST to P25-POSITIVE. Do not invent a safety margin if the data cannot support one. Also make clear P25 is a valuation scenario, not a guarantee of 75% probability of making money.
- Suggested tiering: FARM = expected net EV meets minimum threshold; P25-positive = net EV at P25 >= $0; ROBUST = P25 net EV exceeds a meaningful positive safety margin (reserved, unused); THIN / SKIP as now.

## 3. Honesty of "50.5% within 3x (n=95)"

- 50.53% is legitimate as a reported LOO result (48/95 = 50.5263%), assuming the nested refit is implemented correctly.
- n=95: not automatically cherry-picking. It BECOMES cherry-picking if the listing-date requirement was introduced because those 33 observations made the model perform worse. There must be a substantive reason listing dates are necessary (maturity feature). Disclose as a table: traded-token peer universe 128 / included 95 / excluded missing listing date 33 / peer coverage 74.2%.
- NEW: add a sensitivity comparison using the 128-peer universe with a clearly documented treatment of missing dates — would eliminate much of the cherry-picking concern.
- LOO vs blind: two different stories (LOO 50.53%/0.340; blind 80/20 42.11%/0.371; time-split 41.94%/0.184). The time-split Spearman 0.184 suggests weak temporal ranking stability — important weakness, not fatal. Label 50.5% explicitly as nested LOO; put 42.1% blind beside it; show 41.9% time-split; show sample sizes and exact split methodology; report flat-baseline improvements; disclose R² = 0.166. Clarify whether the five 80/20 tests are repeated random holdouts, five disjoint folds, or another procedure, and how predictions are aggregated.
- Leaderboard comparison is not apples-to-apples (different peer universes, targets, validation procedures) — the dashboard should not imply 50.5% objectively beats a leader reporting 48%.

## 4. Dashboard vs top entries — single most important improvement

- Eight features are good, but the weakness is the CONNECTION between them. Leaders' strengths: comparable-token anchors, costed FARM plans, out-of-sample validation, uncertainty estimates, break-even economics. Tidegauge covers most categories; weak on connecting them.
- A. Traded anchors must become actual comparable evidence: per candidate show 3-5 nearest comparables (TVL, actual mcap, actual/implied ratios, category, chain, peer count, median comparable multiple, dispersion). A candidate must answer "Why is this protocol worth ~$X rather than $Y?" The formula alone cannot.
- B. FARM recommendations need individual validation — more important than another model metric. Candidate-level evidence panel: comparable sample size, historical prediction errors for comparable observations, lower-quartile and median valuation scenarios, break-even market cap, estimated execution costs, net expected return, downside economics. Where direct evidence is unavailable, say so explicitly.
- C. Economics need stronger assumption disclosure: $33.95/hour looks exceptionally actionable — how many hours assumed? What execution costs deducted? Are rewards liquid? Vesting/lockup assumption? Circulating mcap or another definition? Reward dilution? The snapshot has no fees/revenue/FDV/TVL history, so the dashboard must not imply it established protocol revenue quality or sustainable yield.
- SINGLE MOST IMPORTANT IMPROVEMENT (P1): build a candidate-level comparable evidence panel that connects the model to the actual FARM decision. "The dashboard currently tells me what the model predicts. It needs to show me why I should believe that prediction for each specific candidate."

## 5. Risks (table)

- Huber R² = 0.166: weak explanatory relationship — disclose prominently.
- 50.53% LOO: could be mistaken for blind accuracy — label explicitly.
- n=95: selection bias from missing dates — explain and test sensitivity.
- Spearman 0.340: modest ranking power — avoid strong ranking claims.
- Time-split Spearman 0.184: temporal instability — important weakness.
- P25-positive ROBUST: weak margin for some candidates — rename or strengthen.
- $33.95/hour: potential false precision — disclose assumptions.
- $0.600B watchlist value: could imply greater certainty than warranted — label as model-implied.
- 80% band coverage 82.1%: aggregate calibration only — include sample size.
- 50% band coverage 45.3%: slight undercoverage — disclose.
- BounceBit Prime is a particularly awkward ROBUST example ($0.53 P25, practically zero) — display the actual margin prominently, not just the badge. Do not visually communicate it has the same safety margin as a candidate with $8.76 P25 net EV.
- Uncertainty bands are not candidate-specific confidence intervals (derived from out-of-sample residuals; residual distributions may vary by category/size/maturity/regime). Aggregate 80% coverage does not establish every individual candidate has an 80% interval.
- Scatter band 0.40x-3.39x needs explanation: explicitly an empirical residual-derived range, not a guaranteed acceptable valuation interval; explain why asymmetric around 1x.
- R² = 0.166 must not be hidden: TVL alone explains relatively little variation in log market cap.
- Dashboard hierarchy: the judge does pairwise visual comparisons. First screen must immediately show what the radar discovered, which opportunities are worth investigating, why they are attractive, what could go wrong, how the model knows. If the first screen emphasises model coefficients and methodology over actionable discoveries, that is a missed opportunity. Keep the methodology tab, but let the board and its best opportunities do the selling.

## Top 3 fixes (priority order)

1. P1 — Fix the ROBUST classification: rename to P25-POSITIVE unless a meaningful safety-margin threshold is established. Give the $0.53 BounceBit Prime margin a visibly different treatment from candidates with materially larger downside margins. Prevents the dashboard looking like it weakened its standards to manufacture winners.
2. P2 — Strengthen validation disclosure: add the 128-vs-95 peer reconciliation and a missing-listing-date sensitivity analysis. Put LOO, blind and time-split together on the calibration tab with exact sample sizes and split methodology. Keep 50.5% as headline, never present it as blind accuracy.
3. P3 — Add candidate-level comparable evidence: for the 5 ROBUST/P25-positive and 6 FARM candidates, show closest traded anchors, peer dispersion, break-even economics and downside scenarios. Biggest opportunity to make Tidegauge competitive with the leading dashboards.

## What NOT to change

Do not replace Huber with another regression method to chase a higher score. Do not discard the category shrinkage model. Do not claim 50.5% is statistically superior to 48.4%. Do not remove uncertainty bands. Do not remove the calibration and traded-anchor tabs. Do not manufacture additional ROBUST candidates. Do not add dashboard complexity without improving decision quality.

## Competitive assessment

Statistical methodology Good; validation transparency Good, needs disclosure; comparable evidence Moderate; FARM economics Good concept, needs assumptions; uncertainty presentation Good; visual/product differentiation Promising; predictive reliability Moderate; overall competitive readiness "Strong contender, not proven top-tier". Would not assign a numerical Bradley-Terry score without seeing the actual artifact and competing screenshots.

## Convergence/divergence vs Gemini + DeepSeek

- UNANIMOUS (3/3): ship full model; ROBUST name is the biggest problem (all three want it renamed/relabelled — Gemini "Downside-safe" tooltip, DeepSeek "Downside-safe (P25 >= $0)" rename, ChatGPT "P25-POSITIVE" rename); n=95 needs upfront disclosure; blind/time-split must be visible, not buried; do not claim the full model is statistically superior.
- ChatGPT's new contributions: the nested-refit leak check (verify k=5/winsor chosen inside each LOO fold); the 128-peer sensitivity analysis; time-split Spearman 0.184 as a disclosed weakness; candidate-level evidence panel as the #1 improvement (Gemini also wanted nearest-3 comps; DeepSeek wanted blind-on-board); economics assumption disclosure ($33.95/h false precision); scatter band explanation; dashboard hierarchy (discoveries first, methodology second).
