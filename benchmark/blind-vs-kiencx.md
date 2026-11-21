# Blind pairwise judgement — two token-launch-radar dashboards

Judged blind, on the images alone, as "A" and "B" only. The same two dashboards were shown in opposite orders (Pair 1 and Pair 2) as a position-bias control.

Brief: build the best token launch radar — rank pre-token protocols by implied launch value (sealed snapshot of 758 protocols, 40-protocol watchlist, $50M floor), and give each row a farm plan costed to the dollar, netted to a FARM / THIN / SKIP verdict.

Criteria, in order of importance:
1. Model accuracy and honesty
2. Completeness and accounting
3. Farm verdicts and actionability
4. Clarity and craft

---

## Pair 1

### Criterion 1 — Model accuracy and honesty: B
B's headline is a walk-forward out-of-sample miss of x2.53 vs x4.37 flat, with a Brier score of 0.215 vs a 0.320 base rate, and it validates every term in two tests (leave-one-out and walk-forward) with a term-by-term kept / tested-not-kept table. A's headline is a blind median error of x3.97 vs x4.70 flat and a leave-one-out median error of x2.96 vs x5.00 flat; its leave-one-out within-3x rate of 50.5% is genuinely better than B's leave-one-out within-3x of 45%, but B's walk-forward within-3x is 55% and its headline miss is the lowest number on either board. B's validation story is fuller and its headline accuracy stronger.

### Criterion 2 — Completeness and accounting: B
B accounts for all 758 snapshot protocols in exactly one group (198 ranked, 416 already record a token, 144 left out by the house list's own rules) with a full breakdown, and carries an integrity strip: 198 of 198 rows recomputed, ranks 1–198 in order, values never rise, totals equal, checksum, watchlist 40 of 40 ranked, ledger 758 of 758. A shows 200 protocols and a 40/40 watchlist, but no accounting bar or recomputation proof is visible in the image provided.

### Criterion 3 — Farm verdicts and actionability: B
B shows the full board with a verdict on every visible row (MARGINAL / SKIP / FARM), net of fees and net per hour per row, P25–P75 ranges per row, and a stated rule (net beats a T-bill and $25 an hour; 14 of 198 worth farming). A states FARM 11 including 5 board P25-positive (pre-fee) and is admirably honest that 3 of those 5 go negative once costs are counted, but no board table or per-row farm plan is visible in the image provided, so its verdicts cannot be inspected.

### Criterion 4 — Clarity and craft: A
A is more legible: large type, generous spacing, and a clean scatter plot that reads at a glance. B is organised but very dense — three evidence tables plus accounting plus a full board — and its table text is small at this size, though still readable. A wins on legibility.

### Pair 1 verdict
**B wins, margin 3, deciding criterion 1.** B wins the three most important criteria; A's only edge is legibility. The deciding gap is model accuracy: B's walk-forward miss of x2.53 is the strongest headline number on either board, backed by a Brier score and two-test validation.

```json
{"pair": 1, "verdict": "B", "margin": 3, "deciding_criterion": 1, "criterion_winners": {"1": "B", "2": "B", "3": "B", "4": "A"}, "reason": "B's walk-forward miss of x2.53 beats A's blind x3.97 and LOO x2.96, it shows a Brier score and two-test term validation, it accounts for all 758 protocols with a checksum and recomputation proof, and its board shows costed per-row verdicts with net fees and net/hour. A is more legible and its 50.5% LOO within-3x is the best single accuracy figure, but that is not enough to overcome B on the top three criteria."}
```

---

## Pair 2 (order swapped)

### Criterion 1 — Model accuracy and honesty: A
A's walk-forward miss of x2.53 vs x4.37 flat, Brier 0.215 vs 0.320, and two-test term validation beat B's blind x3.97 and LOO x2.96. B's LOO within-3x of 50.5% beats A's LOO 45%, but A's walk-forward within-3x is 55% and its headline miss is lower.

### Criterion 2 — Completeness and accounting: A
A's 758-protocol accounting bar with full breakdown and its integrity strip (198/198 recomputed, checksum, ledger 758/758) are complete and reproducible. B shows 200 protocols and a 40/40 watchlist with no visible accounting or recomputation proof.

### Criterion 3 — Farm verdicts and actionability: A
A's board shows costed verdicts on every row with net of fees, net/hour, and P25–P75 ranges, under a stated rule. B's FARM 11 count and its honest note that 3 of 5 pre-fee P25-positive rows go negative after costs are good, but no board or per-row plan is visible in the image.

### Criterion 4 — Clarity and craft: B
B is the more legible of the two: large type, open layout, clean scatter. A is dense and its table text is small, though readable and well organised.

### Pair 2 verdict
**A wins, margin 3, deciding criterion 1.** Same dashboard wins as in Pair 1, in the opposite position — no position bias. The deciding gap is again model accuracy, with completeness and costed verdicts reinforcing it.

```json
{"pair": 2, "verdict": "A", "margin": 3, "deciding_criterion": 1, "criterion_winners": {"1": "A", "2": "A", "3": "A", "4": "B"}, "reason": "A's walk-forward miss of x2.53 beats B's blind x3.97 and LOO x2.96, it shows a Brier score and two-test term validation, it accounts for all 758 protocols with a checksum and recomputation proof, and its board shows costed per-row verdicts with net fees and net/hour. B is more legible and its 50.5% LOO within-3x is the best single accuracy figure, but that does not overcome A on the top three criteria."}
```

---

## Summary

Both pairs agree: the same dashboard wins in both orders, margin 3, deciding criterion 1 (model accuracy). The losing dashboard's strengths are real — the best single within-3x figure (50.5% LOO) and the most legible layout — but it loses on the headline accuracy number, on full 758-protocol accounting with recomputation proof, and on visible costed per-row verdicts. The winner's edge is not one number but the whole validation package: a lower headline miss, a Brier score, two-test term validation, complete accounting, and a board where every verdict is costed and netted.
