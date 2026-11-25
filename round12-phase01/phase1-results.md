=== 1. BRIER SKILL GATE (independent replication of lib fitOdds) ===
odds train n=532 baseRate=0.4925 | WF train=256 test=276 baseWf=0.6641
replicated LOO Brier=0.2085 (lib 0.2085) | WF Brier=0.2253 (lib 0.2253)
climatology Brier: LOO=0.2499 (lib baseBrierLoo 0.2499) | WF=0.3316 (lib baseBrierWf 0.3316)
Brier skill: LOO=0.1660 | WF=0.3205  (bar: skill >= +0.05 on BOTH splits)
ECE (10 equal-count bins): LOO=0.0345 | WF=0.1103  (bar if recalibrating: worse split Brier <= 0.215 and ECE <= 0.03)
GATE: PASS — no recalibration indicated

=== 2. LOO-vs-WF INVERSION (per-fold LOO residuals, n=95) ===
LOO median max-ratio=2.74 | P90=29.14 | max=531.42
worst 5 folds: Rain x531.4, Gravity Bridge x168.7, Concentrator x140.3, Nexo x136.3, Bitway Earn x99.9
share of sum of squared log-errors: top-5 folds=36.6% | top-10=55.5% | top-19 (20%)=74.2%
median max-ratio excluding worst 5=2.68 | excluding worst 10=2.47 | excluding worst 19=2.22
WF-cutoff (n=31) median x2.19 vs LOO (n=95) median x2.74: LOO is WORSE than WF despite the larger, easier-looking pool.
tail verdict: a few tail folds dominate LOO (top-10 >= 50% of squared log-error) — evidence FOR Direction A (nonlinear/quantile)

=== 3. SPLIT-CONFORMAL 80% INTERVALS (WF folds, n=31 test) ===
variant A (fit oldest 48, calibrate newest 16): q80=1.5194 dex (x33.07) coverage=90.3% (28/31)
variant B (calibrate on LOO residuals of 64 train peers): q80=0.9011 dex (x7.96) coverage=74.2% (23/31)
bar: 80% coverage within 76-84% on WF folds. Cross-check: implemented band timeCov80=74.2% (23/31).
GATE A: FAIL | GATE B: FAIL

=== 4. RECONCILIATION + BASELINE-DELTA HEADLINE ===
accounting groups sum=758 (snapshot total 758) — groups: Ranked watchlist 40 | Ranked early 160 | Live, fit peer 95 | Live, set aside 33 | Live, no usable cap 288 | Pre-token, CEX 42 | Pre-token, versioned/wrapped 11 | Pre-token, rankable, TVL at/above floor 63 | Pre-token, rankable, below early cap 26
board rows=200 (watchlist 40 + early 160)
implied totals: board $839.8M = watchlist $402.0M + early $437.8M
value-if-launches totals: board $2037.9M = watchlist $877.8M + early $1160.1M
verdicts: {"SKIP":156,"THIN":36,"P25-POSITIVE":2,"FARM":6} (FARM total incl. P25-POSITIVE = 8)
TVL-only naive (flat 0.25x constant multiple): LOO x4.11 within-3x 35.8% | WF-cutoff x5.35 | WF-half x5.29 | blind x4.70
adopted ridge: LOO x2.74 within-3x 50.5% | WF-cutoff x2.19 | WF-half x2.59 | blind x3.73
HEADLINE: the ridge beats the TVL-only naive model by 59% on walk-forward error (x2.19 vs x5.35), 33% on LOO (x2.74 vs x4.11).
