# Token-Radar Round 6 — 3-Model Audit Synthesis (2026-11-17 ~14:29 IST)

**Unanimous verdict: (b) SUBMIT WITH FIXES — all three (Gemini, DeepSeek, GLM).**

## Score predictions (all three)

| Auditor | Prediction | Top-10 odds | Top-5 odds |
|---|---|---|---|
| DeepSeek | 954–959k | top-15 to top-10 | coin-flip at best |
| Gemini | 956,500–958,500 | solidly Top 10 | 25–35% |
| GLM (with fixes) | 955–960k | 55–65% | 25–35% |
| GLM (as-is) | 952–958k | — | — |

**Consensus:** round 6 is the strongest round yet, solidly top-10, top-5 a coin-flip (25–35%). The model ceiling — not the farm layer — is the binding constraint on top-5. All three agree the farm layer is the right build and the reconciliation is exact, but the as-is submission is meaningfully worse than the fixed submission for the same model.

## Consensus fixes (all three agree — implement all)

### 1. Badge contradiction — CRITICAL, the single biggest pairwise risk (all three name it)

The P25-POSITIVE badge (defined on board costs) disagrees with the fully costed p25 for 3 of 5 rows (BounceBit −$9.02, Bucket −$1.58, Defa −$1.93). A pairwise judge sees the badge, opens the playbook, and reads a negative p25 — that is a one-line dismissal of the tier.

**Resolution (consensus): RENAME, do not re-tier.** All three accept renaming; GLM explicitly says do NOT change the badge tier (breaks comparability with round 5 and the verdict counts). Gemini's unified-cost-basis alternative (tier counts → P25-POSITIVE 2 / FARM 9 / THIN 72 / SKIP 117) is stronger in principle but changes the verdict rule and the counts — rejected for this round in favour of the rename, which all three endorse.
- Rename the badge to **"Board P25-positive (pre-fee)"** (DeepSeek's wording; GLM's "P25-POSITIVE (BOARD)" is equivalent — pick one and use it consistently).
- Add the fully costed p25 inline on the board next to it (e.g. pre-fee p25 + · fully costed p25 −$9.02).
- Add one legend line: "Fully costed p25 nets all fees; 3 of 5 pre-fee P25-positive rows are negative once costs are counted (see playbooks)."
- Optionally add a P25-FULL marker for the 2 rows (Binaryx, Theo) that still break even fully costed (GLM's option b).

### 2. Fee disclosures (all three)

Add to every playbook header / methodology, in one place:
- "Deposit/withdrawal assumed $0 (not verified per-protocol; would be $X at 0.5%)" — label as optimistic, not just stated.
- "Slippage not modeled (0.30% = pool fee only)."
- "Bridge $2.00 flat per non-ETH chain (point estimate)."
- "Gas snapshot <date>." (state the snapshot date)
- "Excludes 90d risk-free opportunity cost (~$25 at 4% APY)."
- "Counts 1 entry + 1 exit tx per chain (assumes pre-approved spend); actual exit is 1–4 tx/chain by mechanism."

### 3. Fee decomposition per playbook (GLM fix 1; Gemini's Binaryx/Bucket note)

Add a per-row breakdown of the "Extra" column into swap $X / bridge $Y (N chains) / gas $Z (N txs), total = extra. This specifically resolves the Binaryx $2.05 and Bucket $2.05 anomaly (they are non-LP single-chain rows: $0 swap + $2.00 bridge + $0.05 gas — state the mechanism explicitly per row so a reviewer can tell "no swap because non-LP" from "swap fee missing"). The reconciliation script checks board − extra = fully costed, not that the extra line itself is decomposed correctly — the decomposition is the fix.

### 4. Break-even / implied pairing (Gemini fix 2; GLM 4e)

Show Break-even FDV / Implied FDV side-by-side in each of the 7 playbooks (e.g. $1.38M / $14.2M), so high absolute break-evens like Manta's $5.62M are contextualized by their implied valuation cushion (e.g. "Break-even: $5.62M vs. Implied: $38.4M — 6.8x safety margin"). State the unit (market cap / FDV) and the basis (fully-costed) in the column header.

### 5. State the dedup rule (GLM fix 3; DeepSeek)

State the playbook selection rule on the board: "all 5 P25-positive + top-5 FARM by NetEV, deduped" — and state the dedup set explicitly. The dedup is against the 5 P25-positive rows (FARM 11 includes the 5 P25-positive as a subset, so the top-5 FARM by NetEV includes 3 P25-positive rows, leaving 2 pure FARM rows: Manta, Manifest). Verify this from the data and state it correctly; do not repeat GLM's (incorrect) inference that the dedup was against round-5 covered rows.

### 6. Reframe the cover claim (GLM fix 4; DeepSeek)

Drop any "closes the gap" / "closes the gap to top 5" language from the board itself. Reframe as: "closes the last disclosure gap named in round-5 audits; model and board unchanged, headline score expected within the round-5 band." Put the numbers and let the judge conclude.

### 7. Define the $0.600B watchlist (DeepSeek; GLM)

One line on the board defining the watchlist total (sum of implied values).

### 8. Scatter note (GLM 4c)

Note that the out-of-fold scatter may look noisier than round 5's in-sample scatter and that is the point — the previous visual was flattering. Do not let a judge comparing to round 5 assume regression.

### 9. p10 column visible (GLM 4d)

Make sure the p10 NetEV column is visible on the board or in the playbook, not just in the audit text. "At p10 every playbook is negative (−$18.48 to −$36.17)" must be checkable from the dashboard itself.

## What the audits agree is already right (do not change)

- The farm layer is the right build; the reconciliation is exact (Python ≤$0.01, 26/26 Chromium, byte-identical rebuilds).
- The scatter fix (OOF basis) is correct and important — cite it as "points and band now share an out-of-fold basis."
- p10 negative everywhere is honest and should stay visible — it is what makes the p25/p50 positives credible.
- Do NOT touch the radar-5-huber model.
- The model is at its ceiling (50.5% within-3x already beats #1's 48% and #5's 50%; the noise floor is irreducible) — no model change can be justified for this round.

## What remains

1. Implement fixes 1–9 above on `round6-farm` (fix subagent).
2. Rebuild, re-verify (determinism, reconciliation, 26/26 checks), retake screenshots.
3. Quota is BLOCKED (verified 2026-11-17 ~14:05 IST) — re-verify `makefun status --competition token-radar-01` before any submit. If still blocked, hold. (GLM fix 6 advisory.)
4. Show to the user, then on their go-ahead: push the branch, bundle, `makefun check`, submit.

## Audit files

- `round6/audit_gemini.md` — Gemini, (b) SUBMIT WITH FIXES, 956,500–958,500.
- `round6/audit_deepseek.md` — DeepSeek, (b) SUBMIT WITH FIXES, 954–959k.
- `round6/audit_glm.md` — GLM, SUBMIT WITH FIXES, 955–960k with fixes / 952–958k as-is. (Asked in a new GLM chat — the original audit-chat URL redirected to the home page.)
