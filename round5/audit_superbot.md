# Token-Radar Round 5 Audit — Superbot (2026-11-17 ~10:23 IST)

Source: new Superbot chat (zkazi2903@gmail.com, Free, 9,983 credits before sending) at https://app.superbot.gg/chat. Reply finished in 2m 08s after 1m 32s of thinking. Full reply received verbatim via browser task 4280fa19.

## Verdict: (b) SUBMIT WITH FIXES — "the work is sound, the disclosure is not"

"The modelling, calibration, determinism and arithmetic all held up under your verifier and the parent re-run. What has not been stress-tested is how the entry presents its peer set and its tiers, and those are exactly where a judge or reviewer pokes first."

## 1. Model choice — DIVERGES: ship the BARE curve as primary

- Neither difference is real. With n=95 the standard error on a proportion near 0.5 is about ±5.1pp, so a 2.1pp within-3x gap is a coin flip, as is 0.019 Spearman. "Which is better on the metric" cannot decide it. Pick on parsimony and on what survives scrutiny.
- The full model adds category multiples plus shrinkage (k=5, minPeers=3, winsor bounds) on 95 rows and buys a difference you cannot distinguish from zero. A judge who reads the calibration tab can count those hyperparameters against the rows and ask why.
- RECOMMENDATION: ship the bare Huber curve as primary and keep the shrunk category multiples as a labelled sensitivity, because a TVL-only two-parameter fit is far harder to attack than a four-knob fit on 95 observations.
- If you keep the full model, the deciding argument must be printed, not implied. "We chose the full model because the headline is within-3x" is metric-shopping. Printed as "we adopt the full model because within-3x is the board's headline; on rank correlation the simpler curve is fractionally ahead; at n=95 the two are indistinguishable", it becomes evidence of judgement instead of a smell.
- The comparison that actually holds is against the flat baselines: +12.6pp over global median, paired, on identical rows. That is the defensible lift and it is nowhere near the headline. Lead with it.

## 2. ROBUST — honest in substance, overclaimed in name, AND the counts are wrong

- The criterion is fine. "Net EV >= $0 at p25" is a real risk statement and arguably better than an arbitrary $40 floor. Three problems remain.
- (a) It was set after seeing the distribution. The first bar produced 0 rows out of 200 — textbook goalpost movement unless narrated. Narrate it on the Model tab: "our initial $40-at-p25 bar returned zero rows across 200; we replaced an arbitrary dollar floor with a sign test at the pessimistic end." Told, it reads as stress testing. Untold, it reads as a bar moved to manufacture a tier.
- (b) The name outruns the bar. An emerald "ROBUST" badge over a $0.47 floor (Bucket) and $0.53 (BounceBit) is rounding error dressed as a category. Two of five members clear the line by under a dollar.
- (c) THE COUNTS MISDESCRIBE THE TAXONOMY (new catch, not raised by the other four). ROBUST 5 / FARM 6 / THIN 72 / SKIP 117 sums to 200, which reads as four disjoint tiers. But ROBUST is a strict subset of FARM, so "FARM 6" is really "FARM-only 6". A presentation defect a reviewer will find in under a minute and it costs credibility on everything else on the board.
- Better definition: P(net EV > 0) >= 0.8 from the residual bootstrap, plus a dollar floor anchored to something real (gas plus hours at a stated rate). Report as "FARM 11, of which ROBUST 5". If you keep the p25 sign test, keep the name ROBUST but show P(loss) on the row so the tier's strength is visible rather than asserted.

## 3. Honest numbers — accurate, checkable, incomplete in the one way that matters

- "50.5% within 3x (n=95)" is true, reproducible, backed by a shipped LOO table. It is not complete: the board has 200 rows, the universe is 128, and the fit sees 95. A reader will assume a larger n than you used. Put the exclusion in the headline itself: "50.5% within 3x on 95 of 128 tokens with a listing date (33 without a date excluded from all fitting and validation)".
- SHARP POINT (new): the printed formula is TVL-only: log10(value) = 3.138 + 0.508 x log10(TVL). Listing date is NOT a term. So if the model never consumes listed_at, excluding 33 peers for lacking one has no modelling justification on its face, and it will read as a peer set chosen until the number looked right. Either the date does work somewhere in the pipeline (say where, explicitly), or it does not, in which case those 33 peers have TVL and mcap like everyone else and belong in the fit and the validation.
- ANSWER (Muse's verification): listed_at DOES work in the pipeline — it drives the maturity multiplier (age in days from listed_at) used in the board's implied values (withGm=true), and it defines the time-split validation. BUT the LOO number itself uses the no-gm predictor (predicts without growth/maturity), so listed_at is NOT consumed in the LOO validation. Superbot's criticism is therefore valid for the LOO headline specifically. The fix stands: publish the all-128 LOO next to the n=95 LOO.
- Cheap fix, kills the whole line of attack: publish the all-128 result next to the n=95 result. If they are close, the criticism evaporates and you look rigorous. If 128 is materially worse, then n=95 was selection and you want to be the one who says so.
- Disclose R-squared 0.166 (the model explains about 17% of log-value variance, a caveat, not a footnote) and the time-split Spearman of 0.184 on n=31. Both survivable in print; the first is unmissable, and its absence converts an honest 0.166 into an apparent 0.9.
- What to lead with instead: the band calibration. An 80% nominal band holding 82.1% and a 50% band holding 45.3% is genuinely good out-of-sample calibration and the most credible evidence in this entry. Right now it is buried under a within-3x headline that is inside the noise of a flat baseline.

## 4. Dashboard — the band needs segment calibration on the board

- The band is 0.40x to 3.39x, an 8.5x spread. On its own that is close to uninformative, and top entries that show comps anchors and out-of-sample tests on the board will look sharper beside it.
- SINGLE MOST IMPORTANT IMPROVEMENT: a within-3x-by-TVL-decile calibration table, plus a per-row segment tag, so a user knows where the band is tight and where it is noise. A reviewer comparing two dashboards will reward the board that tells them which of its own 200 rows the model can actually predict. That one table converts the weakest visual (a very wide band) into a credibility asset — the gap between "we validated the model" and "we validated it where you are looking".
- Two secondary gaps: the time-split results live in the audit, not the dashboard. And "net EV" never shows its cost line; top entries net their farm plans line by line, so a judge will ask what "net" subtracts. Show it.

## 5. Risks

- The "best return on your time" callout is the weakest thing on the board. BounceBit Prime at $33.95/h is a single top-tail row from a fit with R-squared 0.166 and Spearman 0.34. Either drop it or reframe as "highest expected, widest band" with the p25/h figure printed beside the $33.95.
- The 5/6/72/117 partition bug (above). Fix before submission; it is the kind of arithmetic inconsistency that makes a reviewer distrust the farm maths too.
- Headline n without the exclusion count. Largest single exposure.
- 200 board rows against a 128-token universe is unreconciled in this brief. A judge will ask what the other 72 rows are. Have the answer on the page rather than in your head. (ANSWER: the board is 40 watchlist + 160 early/pre-token protocols below the watchlist floor; the 128 is the traded-token peer universe, not the board universe. The board and the peer universe are different sets.)
- Nothing in the arithmetic looks wrong. Farm recompute matched to the cent on three rows, determinism byte-identical across three runs, no top-5 phrase or coefficient copied, 62% appears nowhere. That part is clean and should be said plainly in the submission note.

## Verdict: (b) SUBMIT WITH FIXES — priority order

1. Publish all-128 results beside n=95, and put "95 of 128, 33 without a listing date" in every headline number and on the calibration tab. If the date is not a model feature, include all 128 in the fit and validation.
2. Make the tiers a true partition and re-base ROBUST. Report FARM 11 with ROBUST 5 inside it, replace the p25 sign test with P(net EV > 0) >= 0.8 or a cost-anchored dollar floor, and narrate the abandoned $40 bar as the stress test it was.
3. Add the TVL-decile calibration table and its per-row segment tag, and drop or reframe the $33.95/h callout.
4. If room: switch the primary fit to the bare Huber curve and carry category shrinkage as a labelled sensitivity. It costs nothing measurable and removes a knob a reviewer can use against you.

## Convergence/divergence vs Gemini + DeepSeek + ChatGPT

- UNANIMOUS (4/4 so far): ship with fixes, not as-is; ROBUST name is the biggest problem; n=95 needs upfront disclosure; blind/time-split must be visible; do not claim the full model is statistically superior.
- Superbot DIVERGES on the model: it is the only one recommending the BARE curve as primary (the other three ship the full model). Its reasoning (parsimony, 4-knob fit on 95 rows, ±5.1pp SE) is the strongest version of the bare-curve case.
- Superbot's NEW catches: the tier-count partition bug (FARM 6 is really FARM-only 6); the listed_at-not-in-the-formula challenge to the n=95 exclusion; lead with the +12.6pp lift over the flat baseline; the TVL-decile calibration table; the 200-rows-vs-128-universe reconciliation; the $33.95/h callout as the weakest thing on the board.
