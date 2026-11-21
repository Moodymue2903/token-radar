# Token-Radar Round 6 — GLM Audit (2026-11-17 ~14:29 IST)

**Verdict: SUBMIT WITH FIXES.** Score prediction with fixes: **955–960k. Top-10 (~957,219) ~55–65% likely. Top-5 (~958,843) ~25–35% likely.** As-is (no fixes): 952–958k. Better than round 5 on disclosure quality and top-10 odds; not a top-5 favorite without a model change next round.

Note: the original GLM audit chat URL redirected to the z.ai home page and did not appear in Recents, so the question was asked in a NEW GLM chat (https://chat.z.ai/c/25448421-9260-41e8-95f4-1446339edddf), GLM-5.2.

## Bottom line

SUBMIT WITH FIXES. The round closes a real disclosure gap but does not move the model-derived score, and it carries an honesty cost that is only partially handled. The quota block is the gating issue, not the audit.

## (1) Does the farm layer close the gap to top 5?

**The model is the binding constraint, not the farm execution layer.** Three load-bearing quantities are explicitly unchanged from round 5: Model (Huber IRLS, d=1.0, intercept 3.138, slope 0.508, n=95, radar-5-huber), Board (200 rows, watchlist $0.600B, LOO x2.96, 50.5% within-3x, verdicts 5/6/72/117 — and 5+6+72+117=200 checks out). The headline watchlist value ($0.600B) drives the absolute score and is unchanged. Round-5 audits predicted 952–958k with no model hitting top 5. Since the model and board are byte-identical to round 5, the model-derived score for round 6 is in the same 952–958k band by construction.

What round 6 adds is a disclosure layer. None of these move the watchlist number. They can only move the judge's perception of execution quality and honesty — a second-order effect, and it cuts both ways, because the disclosure also exposes that 3 of 5 P25-positive rows no longer break even at p25 once fees are counted.

The framing "closes the farm execution layer — the last gap the round-5 audits named that a dashboard change can fix" is half-true. It is the last dashboard-fixable gap. It does not close the gap to top 5. The gap to top 5 is ~958,843 − ~955k (midpoint of round-5 range) ≈ 4k, and a dashboard change does not manufacture 4k of model score.

**Score prediction: 953–960k.** Model alone ~952–958k; disclosure layer could add 1–3k if the judge weights execution completeness and honesty, and could subtract if the honesty cost is read as the badge being overstated. Top-5 ~25–35%. Top-10 ~50–60%. Meaningfully better than round 5 on top-10 odds, marginally better on top-5 odds, still not a top-5 favorite. If you need top-5, the model is what has to move next round.

## (2) Honesty cost: badge naming

The disclosure is handled well. The badge naming is not. Each playbook prints both the board-cost p25 and the fully-costed p25 and says plainly when a row no longer breaks even at p25. The numbers are internally consistent (Binaryx +$6.71 ✓, Theo +$1.40 ✓, BounceBit −$9.02 ✓, Bucket −$1.58 ✓, Defa −$1.93 ✓). So 3 of 5 P25-positive rows (60%) do not break even at p25 once all fees are counted. At p10 every playbook is negative (−$18.48 to −$36.17), also disclosed.

The problem is the badge name. "P25-POSITIVE" is a claim about p25 positivity. When 60% of the rows carrying that badge are negative at p25 under the submission's own fully-costed view, the badge name and the badge definition are in tension. A pairwise judge scanning the board sees "P25-POSITIVE" on BounceBit, then opens the playbook and sees −$9.02 at p25 fully costed. That is a visible inconsistency.

The defense — "P25-POSITIVE badge defined on board costs" — is defensible only if that definition is printed on the board next to the badge. The audit text does not say the definition is shown on the board. If it is not, the badge is misleading by name.

**Recommendation:** Do not change the badge tier (it would break comparability with round 5 and the verdict counts). Instead, annotate or rename the badge on the board so the basis is unambiguous. Two acceptable options: (a) rename to P25-POSITIVE (BOARD) or P25-POSITIVE · PRE-FEE, with the playbook showing the fully-costed figure alongside; (b) keep P25-POSITIVE but add a second marker P25-FULL for the 2 rows (Binaryx, Theo) that still break even fully costed. Either is fine. The current state — badge name implies p25 positivity, playbook says 60% are negative — is the one configuration a pairwise judge will flag.

## (3) Fee rules: reasonable, with three gaps and one possible mispricing

**Disclosed and reasonable:** Swaps 0.30% (standard AMM tier). LP rows $3.75+$3.75 = $7.50 total (arithmetically correct for half-capital-per-side at 0.30% of $2,500). Bridge $2.00 flat per non-Ethereum chain (within market range for $2,500 notional, typical 0.05–0.10% = $1.25–$2.50 plus gas, defensible). Exit gas 1 tx per chain at snapshot gasPerTx (directionally right). Hold 90d (clearly stated). Extra fees $2.05–$9.80 per farm (matches the playbook table).

**Gap 1 — Deposit/withdrawal $0 is optimistic and should be flagged harder.** Many yield-bearing protocols charge a deposit or withdrawal fee (often 0.5–1% on stablecoin yield products, sometimes more on wrapped/staked variants). $0 is a stated assumption, which is fine, but it should be labeled as optimistic, not just stated, and the playbook should say "deposit/withdrawal $0 (assumption; would be $X at 0.5%)" so the sensitivity is visible.

**Gap 2 — Exit gas "1 tx per chain" likely undercounts for some mechanisms.** Unstake + claim + withdraw + swap-back is a 3–4 tx exit on many chains, not 1. For LP rows, removing liquidity and swapping back is at least 2 tx. The rule should be "≥1 tx per chain, mechanism-specific" with the actual tx count per playbook shown. As stated, it systematically underprices exit gas for stake/LP rows.

**Gap 3 — Hold opportunity cost is not counted.** 90 days of capital lockup on $2,500 at even a 5% APY baseline is ~$30 of opportunity cost, which is larger than several rows' entire extra-fee line ($2.05–$9.80). A legitimate modeling choice, but it should be disclosed as a known omission, not silently omitted. Right now the hold appears free except for the fee line.

**Possible mispricing — the low-fee rows don't add up against the swap rule.** The swap rule says LP rows pay $3.75+$3.75 = $7.50 in swap fees. But the playbook table shows Binaryx Platform extra $2.05 and Bucket CDP extra $2.05 — both below the $7.50 LP swap floor. This means one of three things is true, and the submission does not say which: (a) Binaryx and Bucket are not LP rows (then what mechanism?); (b) Binaryx and Bucket are LP rows but the swap fee is not being counted in "extra" (then where is it counted?); (c) the swap fee is missing for these two rows (error). The other rows are consistent: BounceBit $9.55 ≈ LP $7.50 + bridge $2.00 + gas $0.05; Manifest $9.55 same; Manta $9.80 ≈ LP $7.50 + bridge $2.00 + gas $0.30; Theo $6.05 ≈ 3 bridges × $2.00 + gas $0.05 (no swap, so not LP?); Defa $4.10 ≈ 2 bridges × $2.00 + gas $0.10 (no swap, so not LP?). So the pattern suggests Manta, BounceBit, Manifest are LP rows with swap + 1 bridge + small gas; Theo and Defa appear non-LP with multiple bridges; Binaryx and Bucket at $2.05 look like 1 bridge ($2.00) + $0.05 gas with no swap (non-LP single-chain). That is plausible, but the submission needs to say so. The reconciliation script passes because it checks board − extra = fully costed, not because the extra line itself is decomposed correctly.

**Recommendation:** Add a fee decomposition column or footnote per playbook: swap $X, bridge $Y (N chains), gas $Z (N txs), total = extra. This is a 5-minute fix and removes the ambiguity.

## (4) Errors, inconsistencies, misleading claims

- **4a. "Top 5 FARM by NetEV, deduped" yields only 2 FARM rows — dedup rule is undisclosed.** Verdict counts say FARM 6. "Top 5 FARM by NetEV" should give 5 rows. The playbook table shows only 2 FARM rows (Manta, Manifest). That means 3 of the top-5 FARM-by-NetEV rows were deduped against something, but the submission does not say so. A reviewer reading "top 5 FARM by NetEV, deduped" cannot reproduce the count. Fix: state the dedup set explicitly (e.g. "top 5 FARM by NetEV, minus 3 rows already covered in round-5 submission 01a1e7fc, leaving Manta and Manifest"). [Note: the dedup is actually against the 5 P25-positive rows, since FARM 11 includes the 5 P25-positive as a subset — the fix is to state the dedup set explicitly, whichever it is.]
- **4b. "Closes the gap to top 5" overstates the effect.** The model and board are unchanged, so the headline score is unchanged. Reframe as "closes the last disclosure gap named in round-5 audits; model and board unchanged, so headline score is expected within the round-5 band."
- **4c. Scatter fix framed as improvement; it is a correctness fix that could look worse.** Out-of-fold implied values are typically more dispersed than in-sample, so the scatter may look noisier post-fix. Note that the visual may appear worse and that is the point — the previous visual was flattering.
- **4d. Median range claim checks out, p10 range not verifiable from given data.** "All 7 stay positive at the median, fully costed ($41.06–$79.23)" — table confirms (Bucket $41.06 low, Binaryx $79.23 high). ✓. "At p10 every playbook is negative (−$18.48 to −$36.17)" — not in the playbook table, cannot verify from the audit input. Make sure the p10 column is visible somewhere on the board or in the playbook, not just in the audit text.
- **4e. Break-even fully costed column is large and under-explained.** Values range $1,176,690 (Defa) to $5,615,574 (Manta). The watchlist total is $0.600B = $600M across 200 rows ≈ $3M average. Manta's break-even at $5.62M is above average; Defa's at $1.18M is well below. The unit (market cap? FDV?) and the basis (board-cost or fully-costed?) should be in the column header.
- **4f. Verification claims are strong but uncited.** "Rebuild deterministic (byte-identical twice), Python reconciliation exact (≤$0.01), 26/26 headless Chromium checks passed" — the right checks to claim. The reconciliation check (board − extra = fully costed, ≤$0.01) confirms internal arithmetic consistency but does not confirm that the "extra" line itself is correctly decomposed. The arithmetic can be exact and the fee composition still wrong.
- **4g. Quota block is material and not addressed in the audit text.** If the quota is not unblocked, none of the fixes matter. The first action item is resolving the quota block, not the audit findings.

## (5) Verdict: SUBMIT WITH FIXES

Technically sound (deterministic rebuild, exact reconciliation, 26/26 checks) and the disclosure layer is a genuine improvement over round 5. But three issues a pairwise judge will likely catch, and they are cheap to fix before the 2026-12-14T10:00Z deadline (27 days from today):

1. **Fee decomposition per playbook.** Add a per-row breakdown of the "Extra" column into swap / bridge (with chain count) / gas (with tx count). Specifically resolves the Binaryx $2.05 and Bucket $2.05 anomaly (show they are non-LP single-chain, or fix the missing swap if they are LP). Without this, the $2.05 rows are uninterpretable.
2. **Annotate or rename the P25-POSITIVE badge.** Rename to P25-POSITIVE (BOARD) or add a P25-FULL marker for Binaryx and Theo. The current configuration — badge says P25-positive, playbook says 3 of 5 are negative at p25 fully costed — is the single most exploitable inconsistency for a pairwise judge.
3. **State the dedup rule for "top 5 FARM by NetEV, deduped."** Disclose the dedup set explicitly. Without this, the count (5 declared, 2 shown) does not reconcile.
4. **Reframe the cover claim** from "closes the gap to top 5" to "closes the last disclosure gap; model and board unchanged, headline score expected within round-5 band."
5. **Disclose hold opportunity cost and exit-gas tx count as known omissions.** Add a one-line caveat: "Hold opportunity cost not counted (90d at baseline APY ≈ $X); exit gas assumes 1 tx/chain, actual 1–4 tx/chain by mechanism."
6. **(Advisory) Unpack the quota block first.** If the quota is still blocked at submission time, the round is lost regardless of audit findings. Resolve this before investing in fixes 1–5.

**Predicted outcome if submitted with fixes 1–5: 955–960k. Top-10 ~55–65% likely. Top-5 ~25–35% likely.** Better than round 5 on disclosure quality and top-10 odds; not a top-5 favorite without a model change next round.

**Predicted outcome if submitted as-is (no fixes): 952–958k.** The Binaryx/Bucket fee anomaly and the P25-POSITIVE badge inconsistency are both things a pairwise judge can score against. As-is submission is meaningfully worse than fixed submission for the same model.
