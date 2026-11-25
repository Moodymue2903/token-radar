# Direction C — verdict note

## Numbers (frozen folds, independent Python replication matches exactly)

| Split | C factor | Ridge baseline | Improvement | Within-3x (C / ridge) |
|---|---|---|---|---|
| LOO (primary, n=95) | x3.42 (median \|ln err\| 1.2287) | x2.74 | **-24.7%** | 44.2% / 50.5% |
| WF (secondary, train 64 / test 31) | x5.25 | x2.19 | **-139.6%** | 32.3% / 51.6% |

Bootstrap 95% CI (1000 resamples, mulberry32(555000), reporting only):
LOO factor [x2.46, x4.97], improvement [-81.5%, +10.3%]. The CI is wide
because n=95 with a heavy tail — but the point estimate is decisively
negative on both splits, and the WF result is catastrophic, not marginal.

Ridge LOO cross-check via lib on the same folds reproduces x2.74 exactly,
so the folds are right; the failure is C's, not the test's.

## Why C failed (measured, not guessed)

- **Walk-forward: tau2 = 0.** Between-category variance of log multiples
  (s2_btw = 2.1207) is smaller than the noise term
  (sigma2 * mean(1/n_c) = 4.2617 * 0.5740 = 2.446), so tau2 is floored at 0
  and lam = 0 for every test row: C collapses to the flat global multiple.
  Its WF factor x5.25 is essentially the flat TVL-only naive (x5.35).
  Category means fitted on older tokens carry no signal to newer tokens —
  the same failure the old two-stage model had (WF x3.43 vs LOO x2.96),
  now measured again in a different form.
- **Leave-one-out: thin, noisy peer sets.** Median nPeers 6, n_eff 3.75,
  lam median 0.79; within-category log multiples are extremely dispersed
  (sigma2 ≈ 3.66, sd ≈ 1.9 in ln ≈ 0.83 dex), so kernel-weighting by TVL
  size does not rescue the local mean. 11/95 LOO folds and 14/31 WF folds
  have an empty same-category peer set and fall back to the global mean.
- **The per-row "why" idea is not vindicated by this test.** C's peer
  display is still buildable as a display-only artefact, but that would be
  a separate display-only test under the Phase 5 blind gate (≥5–2 of 7),
  not a consequence of this result. Do not ship C's values on the strength
  of its explanations.

## Verdict — literal table vs substance

Recorded verdict (literal pre-registered table): **UNDECIDED**.
The table says KILL only if worse by >2% AND blind ≤3–2, and blind is
only a tie-breaker in the parity band, so it was not run here. On the
letter of the table, without a blind score, the KILL cell is not met.

Substance: **KILL is the only sensible reading.** The Arena plan states
that anything touching predictions needs the quant bar regardless of blind
outcome, and C fails it by -24.7% (LOO) and -139.6% (WF). No blind
outcome can move C to PASS: PASS clear needs ≥+5%, PASS parity needs
within ±2% plus blind ≥4–1, and C is outside both. A blind test here
could only confirm the kill, never rescue the model. Running one to
satisfy the letter of the table would spend judge votes on a model that
cannot pass.

Recommendation to the parent: record Direction C as **KILLED on the quant
bar** (do not re-run, do not re-draw, do not re-tune h), keep the peer-set
display idea only as a candidate for a separate display-only test, and
move on to Direction A next per the Arena plan order (C → A → B).
