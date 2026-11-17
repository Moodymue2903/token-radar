# Token-Radar Round 5 Audit — GLM (2026-11-17 ~10:23 IST)

Source: new GLM chat (Jacod Paul, Free, GLM-5.2) at https://chat.z.ai/c/9d8e88d4-7e90-4847-9411-6bab10eb08b4. Full reply received verbatim via browser task 4549e4f2. No code or files edited.

## Verdict: (b) SUBMIT WITH FIXES

"The build is solid: deterministic, reproducible, original, 8 features, calibration tab, anchors tab, parity with the leaders on the headline (50.5% LOO vs 46-50% top). It closes the presentation gap that motivated the round. The fixes are real but bounded. The honest one-line summary: the model is at parity with the leaders; the dashboard is close but not yet — submit after fixes 1-3, which together remove the three places a careful judge will dock points."

## 1. Model choice — ship the full model, but stop justifying it on the +2.1pp

- The +2.1pp within-3x (50.53 vs 48.42) and -0.019 Spearman (0.340 vs 0.359) are both inside the n=95 noise floor (±8pp / ±0.16). The headline-number argument is not a real argument — a coin flip that landed on the number you wanted. Shipping the full model "because 50.5 > 48.4" reads as multiple-comparisons bias: you tried two models and reported the one that maximised the headline. That loses a side-by-side.
- Still ship the full model — for a DIFFERENT reason: dispersion. The bare Huber size curve is a single log-log line: every protocol with the same TVL gets the same implied value. The full model adds shrunk category multiples, giving dispersion in implied value at fixed TVL. A dashboard that can't differentiate two protocols in the same TVL tier is a boring dashboard, and the board's ranking logic depends on that dispersion. The full model is the better dashboard model.
- Disclose both numbers on the board with the noise floor, and justify on dispersion grounds. Do not justify on the +2.1pp.

## 2. ROBUST redefinition — not defensible as shipped; weakest part of the build

- The original bar (net EV >= $40 at p25) was a profitability bar. The new bar (net EV >= $0 at p25) is a break-even bar. Different claims. "Robustly profitable at the low end" and "doesn't lose money at the low end" are not the same tier, and a human reviewer will notice the bar was lowered because the first yielded zero rows.
- The "structurally unreachable" fact is itself a finding, not a problem to solve by weakening the definition. It tells you the band is too wide to support a profitability claim at the low end — honest information about the model's confidence. Report that finding ("best p25 net EV is $8.76; no row is robustly profitable at the low end of its band") and either retire the ROBUST tier or replace it with a graduated disclosure: FARM+ at p25 (5 rows), FARM+ at p50 (n rows), FARM+ at p75 (m rows). Honest and still gives the dashboard a tier feature.
- As shipped, ROBUST = "FARM with non-negative p25", a tautology with FARM, not a robustness axis. A judge who reads the definition will see that.

## 3. Honesty of "50.5% within 3x (n=95)" — checkable yes, complete no

- The number is real and reproducible. Disclosure is incomplete in three ways: (1) omits the bare-model number (48.4%), so the model choice looks unmotivated; (2) omits the out-of-sample numbers 8pp lower (blind 42.11%, time-split 41.94%); (3) omits the noise floor ("50.5% (n=95)" without "±8pp" invites reading it as a hard 50.5%, not "somewhere between 42% and 58%").
- CORRECTION TO GLM'S CLAIM (Muse's verification): GLM says "LOO with nested refit on n=95 is still partly in-sample (the shrinkage targets are fit on all 95)". This is WRONG. I read lib/model.ts: `looRun` (line 1172) refits `fitModel(train)` on the 94 training peers for EACH held-out peer, and `fitModel` recomputes the winsor bounds, global median, category medians, and Huber slope/intercept from the training peers only. `validateModel` (line 1395) computes the adopted model via `looRun(peers, asOf, noGm, model)`. The shrinkage targets are NOT fit on all 95 in the LOO. The only selection effect is that the hyperparameters (shrinkK=5, minPeers=3, winsor 5%/95% percentiles, growth/maturity priors) are fixed constants chosen during round-4 experimentation on the full data — a mild, standard selection effect, not a leak in the LOO itself. The 50.5% is a genuine nested-refit LOO number.
- The n=95 peer definition: excluding 33 of 128 peers (26% of the universe) is a big cut. The criterion (traded-token peers with non-null listing date) is defensible — you need a listing date for any age-related feature — but 26% is large enough that a reviewer will ask "are the 33 excluded peers systematically different, and does including them change the number?" No sensitivity check exists. Run LOO on n=128 with dateless peers flagged (or imputed) and show the number doesn't move much. If it does move, disclose that too.
- Disclose on the board: "LOO 50.5% (n=95). Bare model 48.4%. 80/20 blind 42.1%. Time-split 41.9%. Noise floor ±8pp. 33 of 128 peers excluded for missing listing date; sensitivity: [run it]."

## 4. Dashboard vs top entries — single most important improvement is per-row comps

- Top entries put comps on each row: "BounceBit Prime — nearest peers by TVL and category: X, Y, Z, with their actual market caps and your implied value." That makes the value claim checkable in place, without leaving the row. The "traded anchors" tab lists all 95 fit peers globally, but a judge looking at BounceBit Prime can't see which of those 95 are its comps without cross-referencing.
- Secondary gaps: out-of-sample numbers are in a tab, not on the board (top entries put them on the board); no netted farm plan (a portfolio that nets negative-EV rows against positive-EV rows); the watchlist $0.600B is a point estimate, not a range.
- Single most important: per-row comps (3-5 nearest peers by TVL and category) on each watchlist row.

## 5. Risks — things that don't hold up

- The +2.1pp framing. Noise, not signal. Drop it from the justification.
- The ROBUST bar. Lowered until it had members. A careful reviewer will catch this.
- The "50% band" label — NEW CATCH. Coverage is 45.3%, not 50%. Either tighten the band construction or rename it "central band (45% coverage)". As shipped it is a mislabel.
- The 80/20 and time-split numbers (~42%) being off-board. A judge who only reads the board thinks the model is 50.5%; a judge who clicks sees 42%. That is the same presentation gap this round was supposed to close.
- The watchlist $0.600B with no band. Sum of point estimates; should be a range.
- The "Best return on your time — $33.95/h" callout. Strong claim; needs the assumption set (capital, hours, odds) disclosed at the callout, not just in a tab.
- R² = 0.166. Honest to disclose, but the board should foreground "this model explains 17% of variance" — otherwise users will read implied values as more precise than they are.
- Numbers that don't hold up: +2.1pp (noise), ROBUST bar (lowered), 50% band (45.3%), $0.600B (point estimate with no band).

## Top 3 fixes (priority order)

1. Fix ROBUST. Either keep the original $40-at-p25 bar and report "0 rows clear it; best is $8.76" as a finding (ship no ROBUST tier), or replace it with a graduated disclosure (FARM+ at p25 / p50 / p75). Do not ship a tier that was lowered until it had members.
2. Put the out-of-sample numbers and the noise floor on the board, not in a tab. On the formula box: "Full model 50.5% within-3x, Spearman 0.340. Bare size curve 48.4%, 0.359. 80/20 blind 42.1%. Time-split 41.9%. Noise floor ±8pp / ±0.16. We ship the full model for category dispersion, not for the headline." A Bradley-Terry judge comparing side by side sees all of this without clicking.
3. Add per-row comps and fix the band label. For each watchlist row, show 3-5 nearest peers by TVL and category with their actual market cap and your implied value. Rename "50% band" to "central band (45% coverage)" or tighten the construction to actually cover 50%.
- Optional but recommended: (4) show the n=95 exclusion sensitivity (LOO on n=128 with dateless peers flagged); (5) put a range on the watchlist implied value; (6) disclose the $/hour assumption set at the callout.

## Convergence/divergence vs Gemini + DeepSeek + ChatGPT + Superbot

- UNANIMOUS (5/5 so far): submit with fixes, not as-is; ROBUST name is the biggest problem; n=95 needs upfront disclosure + the 128-peer sensitivity; blind/time-split must be visible on the board; do not claim the full model is statistically superior.
- GLM's new contributions: the DISPERSION justification for the full model (best reason yet for shipping it — the bare curve gives every same-TVL protocol the same implied value); the "50% band" mislabel (45.3% coverage, not 50%); the graduated-disclosure alternative for ROBUST (FARM+ at p25/p50/p75); the multiple-comparisons-bias framing of the +2.1pp justification.
- GLM's one error: "shrinkage targets are fit on all 95" in the LOO — refuted by the code (looRun refits per fold on 94 peers). Corrected above.
