# Round 12, Phase 1 — diagnostics results

Branch `round12-phase01`, from round 8 (`2e63d57`). Date: 2026-11-25.
Frozen baselines: `baselines.json`. Metric script: `phase1.ts`
(independent replication — it re-fits the odds logistic itself rather than
reading lib's aggregates). Full log: `phase1-results.md` /
`phase1-results.json`.

## Phase 0 — freeze: PASS

Round-8 pipeline reproduced byte-identically twice (`diff -r` clean):
- `board.json` sha256 `51f26dc7…` — matches the round-8 baseline hash.
- `data.js` sha256 `9b5df74b…` — matches the fix-round-3 baseline hash.
- Output: 758 protocols, watchlist $0.402B, LOO ×2.74 / 50.5%, FARM 8.
- Snapshot frozen: as_of 2026-11-14, sha256 `42a71213…`, 758 protocols,
  40 watchlist, $50M floor. Seeds frozen: blind splits [11, 23, 37, 41, 53],
  LOO band seed 555000+i, per-row band seed 4242000+row, mulberry32.

## 1. Brier skill gate: PASS — no recalibration

Independently replicated (my own IRLS logistic, age+size):
- LOO Brier **0.2085** (lib 0.2085 — exact match), climatology 0.2499
  → skill **+0.166**.
- WF Brier **0.2253** (lib 0.2253 — exact match), climatology 0.3316
  → skill **+0.321**.
- Bar was skill ≥ +0.05 on both splits: **passed on both, so per the
  plan no recalibration is run.**

Finding to carry forward (not a gate failure): calibration is uneven.
ECE (10 equal-count bins) is 0.035 on LOO but **0.110 on WF** — on the
2025+ time split the predicted probabilities do not match observed
frequencies (the c3 reliability table shows the same: WF decile 5
predicted 0.217, observed 0.536; decile 8 predicted 0.319, observed
0.556). The model is skillful against climatology but its WF
probabilities are not calibrated. That is a live weakness for the
EV/h sort (odds × value) and a reason the odds work in Direction C
should be judged on Brier skill AND ECE.

## 2. LOO-vs-WF inversion: tail folds dominate — evidence FOR Direction A

- LOO median max-ratio ×2.74 (n=95), P90 ×29.14, max ×531.4.
- Worst 5 folds: Rain ×531.4, Gravity Bridge ×168.7, Concentrator
  ×140.3, Nexo ×136.3, Bitway Earn ×99.9.
- Share of squared log-error: top-5 folds **36.6%**, top-10 **55.5%**,
  top-19 (20%) **74.2%**.
- Median max-ratio excluding the worst 5: ×2.68; excluding worst 10:
  ×2.47; excluding worst 19: **×2.22 — essentially the WF ×2.19**.
- Verdict: the LOO/WF gap is a tail story, not a broad one. A few
  extreme peers drag LOO. That is exactly what a quantile / nonlinear
  estimator (Direction A) is built to handle, and it is evidence for
  testing A — it does not prove A will pass its bar (WF ≤ ×2.08, LOO
  no worse than ×2.74, 80% coverage 76–84%).

## 3. Split-conformal 80% intervals: FAIL on the letter of the bar

Bar: empirical 80% coverage within 76–84% on the WF folds (n=31).
- Variant A (fit oldest 48 of pre-2025 train, calibrate newest 16):
  q80 = 1.52 dex (×33.1), coverage **90.3% (28/31)** — overcovers.
  The 16-peer calibration set is small and tail-heavy, so the band
  is very wide.
- Variant B (calibrate on LOO residuals of the 64 train peers):
  q80 = 0.90 dex (×7.96), coverage **74.2% (23/31)** — one peer short
  of the 76% floor. This matches the implemented band's timeCov80
  exactly (74.2%, 23/31), a consistency check on the band code.
- Honest reading: at n=31 the bar is a ±1-peer test (76–84% is
  24–26 of 31 covered); 23/31 sits inside the binomial 95% interval
  (~56–87%). The intervals are not demonstrably broken, but the
  pre-registered bar is **not met** by either variant, so no
  conformal-interval claim is shipped on this evidence. Do not
  present the bands as 80% calibrated on the time split — the
  dashboard already states the 74.2% time-split coverage honestly.

## 4. Reconciliation + baseline-delta headline: PASS

Accounting (from the frozen rebuild, sums verified in-script):
758 = Ranked watchlist 40 + Ranked early 160 + Live fit peer 95 +
Live set aside 33 + Live no usable cap 288 + Pre-token CEX 42 +
Pre-token versioned/wrapped 11 + Pre-token rankable ≥ floor 63 +
Pre-token rankable below early cap 26. **Sums to 758 exactly.**

Board totals: implied **$839.8M** = watchlist $402.0M + early $437.8M.
Value-if-launches **$2,037.9M** = watchlist $877.8M + early $1,160.1M.
Verdicts: SKIP 156 / THIN 36 / FARM 6 / P25-POSITIVE 2 (FARM total 8).
Top-20 by net EV/h are 20/20 positive-EV (top: Katana DEX $29.66/h).

**Baseline-delta headline (TVL-only naive = flat 0.25× constant multiple):**
- The ridge beats the TVL-only naive model by **59% on walk-forward
  error (×2.19 vs ×5.35)**, **33% on LOO (×2.74 vs ×4.11)**,
  and 21% on blind (×3.73 vs ×4.70). Within-3×: 50.5% vs 35.8% LOO.
- One-sentence version for the dashboard: "The ridge cuts the
  walk-forward error by 59% against a TVL-only model (×2.19 vs ×5.35)."

## Negative-results appendix (measured numbers, already on file)

- **Survival/hazard cure odds model — REJECTED, both splits**
  (`benchmark/odds-survival-validation/results.md`, 2026-11-22):
  cure LOO Brier 0.2213 vs baseline 0.2085 (+0.0128); WF 0.2481 vs
  0.2253 (+0.0227). Board mean odds under cure 0.999 (degenerate cure
  fraction, pi ≈ 0) — not credible against a 0.492 base rate. Weibull
  shape unstable across splits (k=0.603 full fit vs 1.58 WF-only).
  Do not ship; appendix only.
- **Raw smearing (Duan retransformation) — REJECTED**
  (`benchmark/c3-validation/results.md`, Stage 2a): WF smearing factor
  Ŝ=4.086, LOO mean Ŝ=9.480 — unstable across folds. Median error
  regresses WF ×2.19→×3.81 (within-3× 51.6%→38.7%) and LOO
  ×2.74→×9.20 (within-3× 50.5%→20.0%). Calibration ratio WF
  0.084→0.345 (target 1.0), LOO 0.163→1.546 (overshoots). Board under
  raw Ŝ: total $7,958M, top Steakhouse $353.79M, FARM 163 — absurd.
  Winsorised smearing (Ŝ90=1.984): WF median ×3.76, within-3× 41.9%,
  calibration 0.168 — still fails the calibration gate; EV-only use
  is a judgement call, not a clean pass.
- **Labour double-count — DOES NOT EXIST** (c3 Stage 0): the verdict
  charges gas + opportunity cost only; $25/h is a display ratio.
  Adding a $25/h labour charge would give FARM 0.
- **Top-decile bias correction — SKIPPED**: LOO top-decile median
  realised/pred 1.425 vs WF top-quintile 0.516 — the splits disagree,
  so the correction would fit noise.

## Phase 1 gates — summary

| Check | Bar | Result | Verdict |
|---|---|---|---|
| Brier skill LOO | ≥ +0.05 | +0.166 | PASS |
| Brier skill WF | ≥ +0.05 | +0.321 | PASS |
| Split-conformal 80% coverage (WF, n=31) | 76–84% | A 90.3%, B 74.2% | FAIL (both) |
| Reconciliation 758 | exact | 758 | PASS |
| Baseline-delta headline | measured | 59% WF, 33% LOO | PASS |

No recalibration run (gate passed). No model, fit, board or validation
number changed in this phase — diagnostics + write-only artifacts only.
Next step (separate task): Direction C, then A, per the Arena plan.
