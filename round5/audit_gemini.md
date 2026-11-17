# Token-Radar Round 5 Audit — Gemini (2026-11-17 ~10:22 IST)

Source: new Gemini chat (Zeeshan Kazi, Pro) at https://gemini.google.com/app/1ffd29ef4c1d523f. Full reply received verbatim via browser task e006680b.

## Verdict: (b) SUBMIT WITH FIXES

Model (radar-5-huber), determinism, arithmetic verification, and the 8-feature dashboard are solid and close the presentation gap that held round 3 at #1392. Do NOT rebuild the model or alter the 50.53% pipeline — only tighten disclosure and row-level explainability before submitting.

## 1. Model choice: ship the FULL model (50.53% / 0.340), with one caveat

- +2.1pp (48/95 vs 46/95 hits) is literally 2 protocols flipping across the 3x boundary; neither +2.1pp nor -0.019 Spearman is statistically distinguishable from zero. Not a "better" model statistically — a choice of which bias-variance profile aligns with the dashboard's narrative.
- Full model wins for the board: domain legibility (ignoring category looks naive to a judge), headline alignment (50.5% puts us fractionally ahead of #5's 50% and above #1's 48% on the metric competitors highlight).
- CAVEAT: do not let the formula box imply the model is just the bare size curve (log10(value) = 3.138 + 0.508 x log10(TVL)) while quoting the full model's 50.5% next to it — internal contradiction if someone checks the equation against a row's implied value.

## 2. ROBUST redefinition (net EV >= $0 at P25)

- Mathematically honest, practically defensible, semantically misnamed if left unexplained.
- A 0.24x-0.40x P25 haircut is a 60-76% downside haircut; expecting a farm to clear +$40 net EV after a 70% valuation haircut was an unrealistic initial spec. Downside break-even (EV P25 >= 0) is standard EV risk management: FARM = positive EV at point estimate; ROBUST = positive EV even in the lower quartile of model error.
- Weak spot: calling $0.47 (Bucket) or $0.53 (BounceBit Prime) P25 "ROBUST" without framing invites skepticism from a sharp reviewer.
- Fix: keep the threshold and the 5/6/72/117 split, explicitly label the tier in legend/tooltip as "Downside-safe (EV P25 >= $0)".

## 3. Honesty of reported numbers (50.5% within 3x, n=95)

- Verifiable and internally consistent, but the n=95 filter is a subtle vulnerability needing upfront disclosure.
- n=95 is defensible if explained (no listed_at = no temporal/time-split validation, no maturity check).
- Risk: undated tokens are disproportionately older/illiquid/messy; silent 128 -> 95 drop reads like sample filtering.
- Fix: state the exclusion rule in the Calibration tab and scatter caption ("Fitted on 95/128 traded peers with verified listing dates (listed_at != null); 33 undated peers excluded so time-split and LOO cohorts share an identical universe"). Show blind 80/20 (42.1%) and time-split (41.9%) alongside LOO (50.5%) in the calibration tab.

## 4. Dashboard vs top entries

- Structural gap is closed (comps anchors, netted farm plans, OOS tests, uncertainty bands, break-even economics).
- Weak/missing: (a) formula box mismatch (univariate line + 50.5% from the category-shrunk model); (b) per-row comps visibility — anchors tab is a 95-row lookup, rows need their top 2-3 closest peers in the detail drawer; (c) time-split visibility — showing 41.9% turns a gotcha into proof the model survives out-of-time testing.
- SINGLE MOST IMPORTANT IMPROVEMENT: surface the top 3 nearest traded comps (category + log-TVL distance) inside each protocol's detail view, with actual mcap, TVL, and implied multiple.

## 5. Risks

- HIGH: formula box contradiction — an evaluator plugging log10(TVL) into the box and getting a different implied value (category shrinkage shifted the intercept) makes the dashboard look buggy. Fix the copy to note the category shrinkage adjustment (+ category offset (k=5)).
- MEDIUM: "ROBUST" sticker shock on $0.47 P25 EV — make the P25 EV badge read "P25 EV: +$0.53 (break-even floor: $0)".
- MEDIUM: silent 128 -> 95 sample drop — one sentence of disclosure neutralises it.
- Watchlist implied value ($0.600B): label clearly as the sum of point-estimate implied values across the 40 watchlist protocols (with its P25-P75 aggregate range), not expected user capture.

## Top 3 fixes (priority order)

1. Reconcile the formula box & tier copy: formula box = "log10(value) = 3.138 + 0.508 x log10(TVL) + shrunk category offset (k=5)"; clarify ROBUST = Net EV P25 >= $0 (downside break-even at the 25th percentile).
2. Add nearest-3 traded comps to the row detail view (from the existing n=95 anchors; category first, then nearest log10(TVL)).
3. Disclose the n=95 filter & OOS splits upfront (calibration tab + scatter subtitle): why 33 undated peers were excluded; blind 80/20 42.1% / 1.90x and time-split 41.9% / 1.83x alongside the 50.5% LOO headline.
