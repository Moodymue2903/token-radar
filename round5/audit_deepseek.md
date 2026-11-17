# Token-Radar Round 5 Audit — DeepSeek (2026-11-17 ~10:22 IST)

Source: new DeepSeek chat (Zeeshan Kazi, via Google) at https://chat.deepseek.com/a/chat/s/212d1de6-97d0-4696-a692-ca5a131159ac. Full reply received verbatim via browser task bb480565.

## Verdict: (b) SUBMIT WITH FIXES

Do not submit as-is (ROBUST naming and buried out-of-sample numbers are real pairwise-judge liabilities), and do not withhold (the artifact is sound, deterministic, original, at parity with the top-5's reported metric). Fixes are presentational/disclosure, not model rebuilds — low risk, high pairwise payoff.

## 1. Model choice: ship the FULL model, but fix the framing

- Statistically a coin flip: +2.1pp within-3x, -0.019 Spearman, both inside the ~8pp / ~0.16 noise floor at n=95. No statistically defensible reason to prefer either on predictive grounds.
- Tiebreaker is what the dashboard optimises for: within-3x, the field's common currency (46-50%). Matching the reported metric with the better number is the right call for a pairwise judge that reads the headline.
- PROBLEM is the stated reason ("chose the full model because the headline is within-3x") — reads as metric-selection. Defensible framing: "within-3x is the field's common currency, both models are statistically indistinguishable, and the full model is the one whose headline matches how peers report. We disclose the Spearman trade explicitly." Do not claim the full model is better; claim it is equal and aligned. Keep both numbers visible in the calibration tab. The -0.019 Spearman must stay visible.

## 2. ROBUST redefinition — STRONGER OBJECTION THAN GEMINI

- Honest, but a weakened bar, and must be said in exactly those words. "Net EV >= $0 at p25" = "does not lose money at the pessimistic end" — a SURVIVAL criterion, not a robustness criterion. Calling it ROBUST invites "this is the strong tier" when every ROBUST row is a subset of FARM and the original $40-at-p25 bar produced zero rows. A judge who sees ROBUST ⊂ FARM with the definition changed mid-build will ask why the tier exists at all.
- Two acceptable paths: (a) RENAME it — "P25-non-negative" or "Downside-safe" tier. Costs nothing, removes the overclaim. The emerald badge is fine; the word ROBUST is the problem. (b) Keep ROBUST but define it as the $40-at-p25 bar and show 0 rows, with a note the band is too wide for any row to clear it — more honest board, but kills a feature.
- DeepSeek takes (a): rename to "Downside-safe (P25 >= $0)" and add one legend line: "Original plan required $40 at p25; no row clears that bar because p25/implied is 0.24-0.40. This tier is the strict subset of FARM that still pays at the low end." Converts a weakness into a disclosed structural finding. Do not ship it as "ROBUST" with no note.

## 3. Honesty of "50.5% within 3x (n=95)"

- Honest and checkable; peer definition defensible but under-disclosed. n=95 = traded peers with non-null listing date is a reasonable, pre-registered-looking rule; excluding 33 dateless peers from every fit/validation/band (universe stays 128) is methodologically clean — not cherry-picking as long as it is said plainly. Risk: a reviewer sees n=95 next to a 128-row universe and assumes the hard cases were dropped. They were dropped by a rule, not by outcome — that distinction matters.
- Disclose in the calibration tab: "n=95 = traded peers with listing date. 33 peers lack listing dates and are excluded from fit, LOO, and bands (they still appear on the board with wider/no bands). Excluding them does not inflate within-3x because [show the number: does the 33-peer set validate at all? If you can compute within-3x on the 33 using a listing-date-free model, report it.] If you can't, say 'not validated; excluded.'"
- Formula box "50.5% within 3x (n=95)" is fine, but add "LOO, nested refit" — the headline box should carry it.
- Report flat baselines (35.8% / 37.9%) next to 50.5% in the box or immediately below it. A 50.5% with no baseline is less credible than 50.5% vs 37.9%.
- Blind 80/20 (42.1%) and time-split (41.9%) are lower — do not hide them; keep them in the tab, and consider putting the blind number on the board as the "out-of-sample" figure, since that is what top entries emphasise.

## 4. Dashboard vs top entries — single most important improvement

- Strong on bands, break-even, calibration tab; weak on out-of-sample evidence being visible on the board itself. Blind 80/20 (42.1%, median x1.898) and time-split (41.9%) are buried in a tab. The leader reports 48% and #5 50% — if a judge can't see your out-of-sample number without clicking, you lose the comparison.
- SINGLE MOST IMPORTANT IMPROVEMENT: put the blind 80/20 result on the board, next to the 50.5% LOO number, in the same visual weight. E.g. formula box: "In-sample LOO 50.5% within 3x (n=95) · Blind 80/20 42.1% (median x1.90) · Baseline 37.9%." That is the honesty move and the competitive move. Secondary (not top-3): a comps-anchor column (nearest 3 peers by TVL with actual/implied) would match the top entries' anchor emphasis, but that is a build, not a fix.

## 5. Risks

- ROBUST naming — biggest reviewer risk. A human will notice ROBUST ⊂ FARM and the mid-build redefinition.
- Metric-selection optics — the stated reason for the full model ("headline is within-3x") reads as choosing the metric that flatters. Reframe as "equal within noise; aligned with field reporting."
- n=95 vs 128 — under-disclosed; fix with one sentence + the 33-peer note.
- Blind/time-split buried — a judge comparing to #1/#5 will assume you don't have out-of-sample tests if they're not on the board. Presentation loss, not correctness loss, but costs pairwise points.
- Watchlist implied $0.600B — fine, but the board must say what it is (sum of implied values? median?); an unexplained aggregate is a soft target.
- Numbers that hold up: farm arithmetic (3 rows verified), determinism (byte-identical x3), DOM-stub render (0 mismatches), originality (no copied phrase/coefficient), the 62% correction (number appears nowhere). The 50.5/48.4/42.1/41.9 set is internally consistent. No number fails to hold up. Huber intercept/slope and R²=0.166 are plausible and disclosed.

## Top 3 fixes (priority order)

1. Rename ROBUST → "Downside-safe (P25 >= $0)" (or keep the name and add the explicit mid-build-redefinition note). Add the one-line legend explaining the original $40-at-p25 bar and why it is structurally unreachable. Single biggest credibility fix.
2. Put the blind 80/20 (42.1% within-3x, median x1.90) and the 37.9% baseline on the board, same visual weight as the 50.5% LOO headline. Out-of-sample visible on the board, not just in the tab.
3. Disclose n=95 vs 128 in the calibration tab in one sentence, including what happens to the 33 dateless peers (excluded from fit/LOO/bands; bandless on board), and reframe the model-choice rationale as "statistically indistinguishable; aligned with field-reported metric" rather than "because the headline is within-3x."

## Convergence/divergence vs Gemini

- AGREE: ship full model; formula box must reconcile with the full model; n=95 needs upfront disclosure; blind/time-split must be shown; ROBUST needs honesty.
- DIVERGE: Gemini says keep the ROBUST name with a "Downside-safe" tooltip label; DeepSeek says rename it outright — the word ROBUST is the problem. Gemini's #1 improvement is nearest-3 comps in the detail view; DeepSeek's #1 is blind 80/20 on the board. Both are cheap; both should be done.
