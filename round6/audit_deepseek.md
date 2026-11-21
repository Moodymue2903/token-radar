# Token-Radar Round 6 — DeepSeek Audit (2026-11-17 ~14:25 IST)

**Verdict: (b) SUBMIT WITH FIXES.** Score prediction: **954–959k, top-15 to top-10, top-5 a coin-flip at best.** The model ceiling — not the farm layer — remains the binding constraint on top-5.

## 1. Does the farm layer close the gap to top 5?

It closes the gap the audits named; it does not close the gap to top 5. Two separate constraints:

- **Model ceiling.** Board unchanged: 50.5% within-3x / Spearman 0.340 at n=95, against #1's 48% and #5's 50%. At parity on the model. The top-5 bar (958,843) vs round-5 audit band (952–958k, top-20 borderline) means the model is not what's holding you at ~top-20 — if it were, a farm layer couldn't move you. The farm layer is a dashboard/execution improvement, which is exactly the axis the top-5 gap was diagnosed on. Good.
- **What the layer adds that the top-5 don't obviously have:** fully costed p10/p25/p50/p75 NetEV per row, every fee the board omits ($2.05–$9.80 extra), break-even in fully costed dollars, and an out-of-fold scatter basis. A real, checkable, first-order improvement — more netted than the peers, not less.
- **Prediction 954–959k:** (a) judge is pairwise and the top-5 cluster (958.8k+) is separated by a few hundred points — a single new column and 7 playbooks can plausibly cross 958.8k, so top-5 is not excluded, just not favored; (b) the honesty cost (3/5 P25-positive rows going negative at p25 fully costed) is a self-inflicted pairwise liability if a judge reads it as "your badge was wrong" rather than "your fee accounting is more complete than peers"; (c) the model ceiling caps you — you cannot out-model #5, so you can only out-present, and presentation is a smaller score lever than model. Net: submit, expect top-15/top-10, top-5 is a coin-flip at best. Narrows top-20-borderline to top-15-solid.

## 2. Honesty cost: 3 of 5 P25-positive rows negative at p25 fully costed

Handled well in the playbooks; **the badge is the problem.** The playbooks are honest — they print both figures and say plainly when a row stops breaking even. The issue is the P25-POSITIVE badge, defined on board costs, which now visibly disagrees with the fully costed number for 3 of 5 rows. A sharp judge will ask: "positive at p25 — by whose accounting?" That is a one-line dismissal of the tier.

Should the badge change? **Yes, minimally.** Two options, in order of preference:
- (a) Keep the badge, rename it **"Board P25-positive (pre-fee)"** and put the fully costed p25 next to it on the board column (e.g. pre-fee p25 + · fully costed p25 −$9.02). Add one legend line: "Fully costed p25 nets all fees; 3 of 5 pre-fee P25-positive rows are negative once costs are counted (see playbooks)." Converts the liability into a disclosure. Cheapest fix and most honest.
- (b) Redefine the badge to fully costed p25 ≥ $0 and accept the tier drops to 2 rows (Binaryx +$6.71, Theo +$1.40). Stronger board but shrinks a headline feature.

DeepSeek would do (a). **Do not leave the bare P25-POSITIVE badge with the fully costed numbers disagreeing and no note — that is the single biggest pairwise risk in this round.**

## 3. Fee rules: reasonable and disclosed?

Reasonable and mostly complete; two soft spots. Rules are defensible and, importantly, stated. Extra fees $2.05–$9.80 per farm reconcile exactly against the board (≤$0.01). That reconciliation is the strongest thing in this round; keep the reconciliation output visible.

Soft spots a fee-savvy judge could poke:
- **$0 deposit/withdrawal is an assumption, not a fact.** State it as an assumption in the playbook header, not just in the methodology tab. One sentence: "Deposit/withdrawal assumed $0; not verified per-protocol."
- **$2.00 flat bridge per non-ETH chain is a point estimate with no band.** Either give it a range in the playbook or note it as a point estimate.
- **Slippage is not a fee line.** 0.30% swap is the swap fee; on $2,500 entries into thin pools, slippage can exceed it. Say so: "Slippage not modeled; 0.30% is pool fee only." This is the fee most likely to be named by a top-5 reviewer as missing.
- **Gas snapshot staleness** — gasPerTx at a snapshot is fine, but say when the snapshot was taken.

None are mispriced in a way that breaks the reconciliation; they are disclosure gaps. Fix the $0-deposit assumption and the slippage line, and the fee section is clean.

## 4. Errors, inconsistencies, misleading claims

- The scatter fix is correct and important — out-of-fold implied values so points and the LOO residual band share a basis. Cite it as such ("points and band now share an out-of-fold basis") rather than as a bug fix.
- p10 negative everywhere (−$18.48 to −$36.17) is honest and should stay visible. Do not bury it.
- No number fails reconciliation (Python exact ≤$0.01; 26/26 Chromium; byte-identical twice). The 7-row table is internally consistent.
- One inconsistency to check: Manta CeDeFi and Manifest Trade are FARM (not P25-positive) but have the largest extra fees ($9.80/$9.55) and negative p25 — state the "top 5 FARM by NetEV" selection rule explicitly on the board.
- Misleading-claim risk: "closes the farm execution layer — the last gap" is a builder claim, not a board claim. Do not put "closes the gap" language on the board.
- Watchlist $0.600B still unexplained on the board (carried over from round 5) — define it (sum/median of implied values) in one line.

## 5. Verdict

**(b) SUBMIT WITH FIXES.** The farm layer is the right build, the reconciliation is exact, and the honesty disclosures are strong — but the bare P25-POSITIVE badge disagreeing with the fully costed p25 is a self-inflicted pairwise liability, and two fee-disclosure gaps (slippage, $0-deposit assumption) are cheap to close. Do not submit as-is; do not withhold. Quota being blocked is the gating issue, not correctness.

**Fixes, priority order:**
1. Badge: rename "P25-POSITIVE" → "Board P25-positive (pre-fee)" and add the fully costed p25 inline on the board, plus one legend line stating 3 of 5 go negative fully costed. (Alternatively redefine to fully costed p25 ≥ $0 — 2 rows — but do not leave the bare badge with no reconciliation note.)
2. Add fee-disclosure lines to every playbook header: "Deposit/withdrawal assumed $0 (not verified per-protocol); slippage not modeled (0.30% = pool fee only); bridge $2.00 flat per non-ETH chain (point estimate); gas snapshot <date>."
3. State the playbook selection rule on the board (all P25-positive + top-5 FARM by NetEV, deduped) and define the $0.600B watchlist (sum vs median of implied values) in one line; drop any "closes the gap" copy from the board itself.

With those three, this is a clean submit and the strongest round yet. Honest score prediction: 954–959k, top-15 to top-10, top-5 a coin-flip at best.
