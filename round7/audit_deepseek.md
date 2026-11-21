# Audit — Round 7: ridge model + token odds ("Tidegauge")
## Independent auditor, DeepSeek perspective — 2026-11-21

**Entry audited:** Tidegauge round 7, branch `round7-ridge` (from round 6 commit `614e294`). Model `radar-7-ridge`.
**Benchmark:** kiencx #1 "Launch Radar v4" (judge 966,767); europa-nova #10 (960,454, the bar).
**What I did:** read `round7/RESULTS_round7.md`, `benchmark/how-to-beat-kiencx.md`, `lib/model.ts` (2,455 lines, in full for the ridge/odds/validation/accounting sections), `dashboard/app.js` (1,403 lines, key sections), all four screenshots, the kiencx and europa-nova artifacts. Independently verified the numbers against `out/data.js` and `out/board.json`, re-ran `benchmark/ridge-test.ts` and `benchmark/ridge-sweep.ts` (node), and re-ran `round7/reconcile_round7.py` (Python). I did not modify any source file; this audit file is the only file I wrote.

---

## 1. Model correctness

### 1a. Ridge regression — CORRECT
`ridgeFit` (`lib/model.ts`, ~line 780): log10(mcap) = a + b·log10(TVL) + offset[category], jointly fit. The penalty λ is added only to the diagonal entries for j ≥ 2 (the category offsets) in the normal-equations solve — intercept (0) and slope (1) are unpenalised, as specified. Categories with fewer than `minPeers` (3) peers are excluded from the offset list and get offset 0 via `ridgeOffsetFor`. Huber IRLS: 20 iterations from the OLS start, weights min(1, δ/|r|) with δ = 1.0 in log10 units, convergence break at change < 1e-12. Shipped fit (`out/data.js`): a = 3.5936, b = 0.4550, R² = 0.2467, residSd = 0.8116, λ = 4, Huber true — matches `RESULTS_round7.md` §1a and the Python reconciliation (independently re-run, PASSED).

One structural note: `fitModel` hardcodes `ridgeFit(peers, model.ridgeLambda, true, ...)` and `ridgeHuber: true` in the returned fit — Huber is not switchable through `ModelConstants` in the shipped path. That is fine for the shipped model (the Huber/OLS comparison lives in the benchmark scripts, where it belongs), but it means the dashboard's in-page recomputation and the validation always use Huber. No defect; noting it so nobody "toggles" Huber expecting the shipped fit to change.

### 1b. Huber vs OLS — Huber is JUSTIFIED, and I verified it myself
I re-ran `benchmark/ridge-test.ts` and `benchmark/ridge-sweep.ts` (node v24.22.1, type stripping) against the sealed snapshot. Results at λ = 4:

| Test | Huber | OLS |
|---|---|---|
| LOO median max-ratio (n=95) | **×2.77** / 51.6% / ρ 0.360 | ×2.98 / 50.5% / ρ 0.333 |
| WF 2025-cutoff (train 64, test 31) | **×2.65** / 51.6% / ρ 0.248 | ×2.79 / 51.6% / ρ 0.244 |
| WF half/half (train 47, test 48) | ×3.01 / 47.9% / ρ 0.302 | **×2.83** / 54.2% / ρ 0.295 |

Huber wins LOO, wins the 2025-cutoff walk-forward, and wins Spearman on **every** split (0.360 vs 0.333; 0.248 vs 0.244; 0.302 vs 0.295). It loses half/half at every λ (1: 3.01 vs 2.99; 4: 3.01 vs 2.83; 16: 3.05 vs 2.85; 64: 3.03 vs 2.96) — the `RESULTS_round7.md` §5 flag 1 claim is confirmed exactly. λ = 4 is the best Huber choice on the two primary tests (LOO 2.77 and WF-cutoff 2.65 are the best Huber values across λ = 1/4/16/64); it is not cherry-picked.

**Is keeping Huber acceptable despite losing half/half? Yes.** The two-test rule as defined in the research is LOO + walk-forward, where walk-forward is the 2025-cutoff time split — the same 31 newest tokens europa-nova scores its WF on. Huber wins both of those tests. The half/half split is a secondary robustness check (smaller train set, 47 vs 64), and Huber loses it by 0.18 while winning the primary WF by 0.14 and LOO by 0.21. Switching to OLS would trade a better headline (WF-cutoff 2.65, LOO 2.77) for a better secondary split (half/half 2.83) — the wrong trade for the judge's criterion 1, whose headline comparison is the 2025-cutoff WF. **However:** the dashboard does NOT disclose this. See §5, finding F2 — the OLS comparison (×2.83) appears nowhere in `dashboard/app.js` (grep: "2.83" 0 hits, "OLS" 0 hits), so `RESULTS_round7.md` §5's claim that "the caveat is stated in the method/calibration tabs" is inaccurate. The dashboard states the half/half number (×3.01) and the improvement from ×4.05, but not that an alternative weighting beats it on that split. That must be fixed (one sentence), because the entry's credibility rests on showing it tested the alternative.

### 1c. Token-odds logistic — CORRECTLY SPECIFIED AND VALIDATED, with two caveats
`fitOdds` (`lib/model.ts`, line 1469): logistic regression for P(protocol ever records a token), training set = rankable-type protocols (category ≠ CEX, not versioned-name) with a listing date, n = 532, base rate 0.492. I verified the training-set size and base rate independently from the snapshot (532; 262/532 = 0.4925). Kept terms age + size only: intercept −1.249, age +0.695, size +0.166 — matches `out/data.js` exactly (intercept −1.2486, age 0.6947, size 0.1657).

Brier (from `out/data.js`, verified): LOO 0.208 (base 0.250), WF 0.225 (base 0.332), called-right 68% / 66%, wfTestN 276. The term table (verified row by row from `data.js`):
- base rate: 0.250 / 0.332.
- age: 0.211 / 0.227.
- age + size (kept): 0.208 / 0.225.
- + growth: 0.208 / 0.226 — does not lower WF. Correctly rejected.
- + family: 0.200 / 0.225 — improves LOO, WF 0.22509 vs kept 0.22533.
- + chain: 0.209 / 0.226 — does not help. Correctly rejected.
- + control: 0.209 / 0.225 — must not help, does not. Correctly rejected.

**Caveat 1 — the family call is borderline.** Family technically lowers WF Brier by 0.00024 (0.22509 vs 0.22533). The build treats this as a tie, which I endorse: the gain is 0.1% relative, within noise, while family adds 12+ parameters with large offsets (±3: binance −3.05, kinetiq +3.05, jupiter +2.88 — a clear small-family overfitting signature) and improves LOO by 0.008. Rejecting it is the right call, but the two-test rule as literally stated ("lowers Brier in both") is satisfied by family on WF by a hair. The dashboard should say "ties walk-forward" (which it does, `app.js` line 1083) — and ideally quantify it. Not a blocker; a wording precision point.

**Caveat 2 — the odds-level gap vs the top tier is real and unexplained.** Our odds for the big watchlist names are far below the top entries' for the same protocols: Steakhouse 0.58 (ours) vs 0.85 (kiencx) vs 0.79 (europa-nova); Veda 0.60 vs 0.84; Gauntlet 0.56 vs 0.83. Our odds model is validated (beats base in both tests), but kiencx's Brier is better than ours (0.186/0.215 vs 0.208/0.225), so we cannot claim our odds are "more right". The level gap is the main reason our top 10 are all SKIP/THIN and our watchlist total is $346.5M. I cannot settle from the artifacts whether our odds are too conservative for large established protocols or kiencx's are over-confident — but the gap is visible to the judge and it is the single biggest driver of the thin board. See §3.

The `fitOdds` bug fix (the `rankableType` check replacing `isRankable`, which had excluded all y=1 examples) is correct and the training set is now properly mixed. The LOO for the odds model refits inside `fitLogit` with family stems computed from the passed (training) set, so the LOO is clean. The control term ("growth of another row") is a genuine placebo and does not help. Good.

---

## 2. Validation honesty

All headline numbers verified against the shipped `out/data.js` and `out/board.json` — **no cherry-picking found**:

| Test | Claimed (RESULTS §2) | Shipped (`data.js`) | Match |
|---|---|---|---|
| LOO median max-ratio / within-3x / Spearman | ×2.77 / 51.6% / 0.360 | 2.7696 / 51.5789 / 0.3603 | Yes |
| Blind 80/20 ×5 median max-ratio / within-3x | ×3.78 / 45.3% | 3.7786 / 45.2632 | Yes |
| WF 2025-cutoff median max-ratio / within-3x / Spearman | ×2.65 / 51.6% / 0.248 | 2.6472 / 51.6129 / 0.2484 | Yes |
| WF half/half median max-ratio / within-3x / Spearman | ×3.01 / 47.9% / 0.302 | 3.0063 / 47.9167 / 0.3018 | Yes |
| Flat baselines (LOO / blind / WF-cutoff / half-half) | ×4.11 / ×4.70 / ×5.35 / ×5.29 | 4.1071 / 4.6963 / 5.3519 / 5.2937 | Yes |
| Odds Brier LOO / WF; base | 0.208 / 0.225; 0.250 / 0.332 | 0.20846 / 0.22533; 0.24994 / 0.33160 | Yes |
| Band calibration blindCov80/50, timeCov80/50, widths | 0.811 / 0.463 / 0.742 / 0.484; 100.5 / 9.6 | 0.8105 / 0.4632 / 0.7419 / 0.4839; 100.50 / 9.63 | Yes |
| LOO128 within-3x / Spearman / medianMax | 43.8% / 0.412 / ×3.63 | 43.75 / 0.412 / 3.6295 | Yes |
| Bias dex / p90 / chainEth / chainSol | −0.0345 / ×28.59 / +0.060 / −0.611 | −0.0345 / 28.5881 / 0.0598 / −0.6114 | Yes |

The walk-forward improvement is real: the WF numbers are the pre-registered time split (fit listed before 2025-01-01, test on/after, n=31) and the half/half split, both reported — not the best of many splits. The LOO variant table (`data.js`) is consistent: flat 0.25x ×4.11/35.8%, global median ×5.00/37.9%, size-only ×3.17/48.4%, damped ×3.29/46.3%, ridge λ=4 ×2.77/51.6%.

**One number does NOT reconcile — F1 (documentation, not the entry):** `RESULTS_round7.md` §2 lists "coherence 0.879". The shipped `data.js` coherence is **0.7775**, and I computed it independently from `out/board.json`: Spearman(TVL, implied) over the 40 watchlist rows = 0.7775. The 0.879 figure is Spearman(TVL, value_if_launches) = 0.8795 — the pre-odds coherence. `validateModel` (`lib/model.ts` line 2292) correctly passes the odds fit to its internal `buildBoard`, so the shipped coherence (0.7775) is the odds-weighted one, and the dashboard displays 0.778 (`app.js` lines 1014, 1278). The dashboard is right; the RESULTS file is wrong. Fix the RESULTS file.

**Honesty notes (to the build's credit):** the dashboard states plainly that the blind paired 95% CI crosses zero (flatBlindCiLo −0.6315, flatBlindCiHi +0.393 in `data.js`; `app.js` line 977), that flat out-ranks the model on Spearman (blind and time-split), and that the LOO within-3x advantage over size-only (51.6% vs 48.4%) is within the noise floor (±8pp at n=95; `app.js` line 653). The odds censoring caveat is stated clearly in the calibration tab (`app.js` line 1076): "the odds are a lower bound on the eventual probability, most of all for young protocols". The P25-POSITIVE redefinition is disclosed (`app.js` line 1018: "The original $40-at-p25 bar returned zero rows, so the tier is defined by the break-even floor instead — a disclosed change, not a hidden one"). This is a genuinely honest dashboard; the two disclosure gaps I found (F2, F3) are specific, not systemic.

---

## 3. The board re-ranking — FARM 5 and the ship-rule flag

Verified from `out/board.json` (200 rows): verdicts SKIP 169 / THIN 26 / P25-POSITIVE 3 / FARM 2 — FARM total 5. Top 10 are all SKIP except #5 Lofty (THIN, netEv +$2). Watchlist total $346,534,737 (odds-weighted) / $726,956,905 (value-if-launches). Board total $693,113,665. Ranks 1–200 in order, values never rise. Top 10 and all 5 FARM rows match `RESULTS_round7.md` §3 exactly (Steakhouse $35.6M odds 0.58 netEv −$37.96; MetalX $71.29/2.50x; Katana $66.52/2.33x; Binaryx $46.10/1.62x; Wrapped $47.81/1.67x; WEMIX $46.46/1.63x).

### Is FARM 5 a problem for the judge? Yes — it is the main competitive weakness.
It is the honest consequence of the validated odds model (the verdict rule was deliberately unchanged), not a tuning choice, and I do not recommend changing the rule to inflate the count. But the judge compares boards side by side, and the visible counts are: kiencx 14 FARM (top rows MARGINAL, net +$15 to +$58), europa-nova 12 FARM (top rows THIN, net +$2.51 to +$6.52), nyx77 12 FARM, ours **5 FARM with the top 10 all SKIP/THIN and netEv −$25 to −$104**. A board whose ten largest rows all "lose money" reads as a thin farm layer, however deep the 5 playbooks are. The farm layer itself is excellent (5 fully costed playbooks; every figure reconciles — see §6), but the headline count is a visible disadvantage. Do not "fix" it by loosening the verdict rule; that would be dishonest tuning. The honest path is the one the build took — but the audit must say plainly that FARM 5 is a liability in a pairwise comparison.

Two compounding causes, both real: (a) the odds level gap (§1c caveat 2 — our Steakhouse odds 0.58 vs kiencx 0.85), and (b) the maturity factor (§4, finding F5), which discounts young protocols' board values by up to 40% while the top tier applies no such discount to value. Together they push the top rows' NetEV negative.

### The watchlist-total ship-rule flag — a real issue, handled honestly, but incompletely presented
The standing ship rule requires the watchlist total within 25% of $0.637B ($0.478B–$0.796B). The odds-weighted total ($346.5M) is outside it; the value-if-launches total ($727M) is inside it. The dashboard addresses this explicitly in the method tab (`app.js` line 994): "the value-if-launches watchlist total is $727M, within 25% of the $0.637B reference the ship rule uses. The odds weighting lowers the expected total by construction — the odds are a validated model (Brier 0.208 / 0.225 against base-rate 0.250 / 0.332), not a board error." That is the right argument and it is stated. **But** the board-tab footnote (the place the judge actually reads) shows only the $346.5M expected total; the $727M figure appears only in the method tab. **Recommendation (fix F4):** show the value-if-launches total alongside the expected total in the board-tab footnote. The rule itself needs a re-basing decision for an odds-weighted board (a governance call, not a code change) — the odds-weighted total is not "wrong", it is a different quantity than the rule was written for. Do not silently override the rule; the dashboard's explicit statement is the correct approach, and surfacing both totals on the board tab completes it.

---

## 4. The gap to kiencx — round 7 narrows it, does NOT beat kiencx

| Dimension | Kiencx (#1, 966,767) | Round 7 | Who wins |
|---|---|---|---|
| Walk-forward miss (2025-cutoff) | ×2.53 | ×2.65 | Kiencx, by 0.12 |
| WF within-3x | 55% | 51.6% | Kiencx |
| LOO median max-ratio / within-3x | ×3.33 / 45% | **×2.77 / 51.6%** | Ours |
| Blind median max-ratio / within-3x | (not reported) | ×3.78 / 45.3% | — |
| Odds Brier LOO / WF | **0.186 / 0.215** | 0.208 / 0.225 | Kiencx |
| Odds called-right | 72% LOO / 65% WF | 68% / 66% | Mixed |
| FARM count | 14 | 5 | Kiencx |
| Top-10 rows' verdicts | MARGINAL (net +$15…+$58) | SKIP/THIN (net −$25…−$104) | Kiencx |
| 758-protocol accounting + integrity strip | Yes | Yes (now) | Tie |
| Two-test term table (value) | Yes | **No** (odds only) | Kiencx |
| Worked example | No (formula in one line) | Yes (row 1, computed in-page) | Ours |
| Legibility / density | Dense, small table text | Larger type, cleaner | Ours |

The blind test that motivated round 7 had kiencx winning 2–0, margin 3, deciding criterion 1 (model accuracy), with a WF gap of 0.90 (×3.43 vs ×2.53). Round 7 closes that gap to 0.12 (×2.65 vs ×2.53) and flips LOO decisively in our favour. But criterion 1 is decided by the headline walk-forward number, and kiencx still leads it — and kiencx also leads on odds Brier and on farm depth. We now match on completeness and lead on legibility and the worked example, but those are later criteria. **Honest assessment: round 7 does not beat kiencx overall; it narrows the gap from a clear loss to a close loss.** Against europa-nova (#10, 960,454) the picture is similar: we beat them on LOO (×2.77 vs ×3.96) but trail on WF (×2.65 vs ×2.45), on odds Brier WF (0.225 vs 0.200), and on FARM (5 vs 12). Round 7 is roughly at the #10 bar, not clearly above it.

**Finding F5 — the maturity factor (recommendation, not a blocker).** The maturity factor (0.6–1.0 over 1095 days) is applied to board values but excluded from headline validation (the `noGm` predictor). Kiencx and europa-nova both tested age/years-listed for the value model and did NOT keep it — they put age only in the odds model. Our maturity discount pulls Steakhouse from ~$77M to $61M (−20%) and young protocols by up to −40%, and it is a material contributor to our low top-row values. It is a pre-existing (round 6) design, not a round-7 invention, and the research endorsed keeping it as a board multiplier — but it has never been validated in the two-test framework. Recommendation: test the maturity factor as a headline term (does including it lower LOO *and* WF?) or drop it from board values to align with the top tier. Either way, do it as a measured experiment, not a silent change. I am not making this a submission blocker because the headline validation is honest about excluding it — but it is the largest unexamined contributor to the gap, and the next round should address it.

---

## 5. Presentation

Verified present and correct at 1024px (screenshots 1–4, all legible, no garbling, no overlap):
- **758-protocol accounting bar:** yes (`app.js` `accountingHtml`, line 759; screenshot `tmp-accounting.png`). 9 groups sum to 758 (40/160/95/33/288/42/11/63/26 — independently summed from `data.js`). One note imprecision: the "Live, no usable cap" group (288) is defined as `!isPreToken && !isPeer`, which also catches protocols missing gecko/symbol or with zero TVL, not only those with no usable market cap. The label is a simplification; acceptable, but the note could say "no usable market cap or identifiers".
- **Integrity strip:** yes (line 780): "200 of 200 implied values recomputed here and matched the board's data · ranks 1–200 in order, values never rise: yes · accounting totals equal: 758 of 758 · watchlist 40 of 40 ranked · ledger 758 of 758 protocols · built by main.ts from snapshot 2026-11-14". The in-page recomputation (`breakdownOf`, `app.js` lines 175–199) is algebraically identical to the ridge prediction — I checked the decomposition (TVL × ridge-anchor multiple × size factor × growth × maturity × odds = 10^(a + b·log10(TVL) + offset) × growth × maturity × odds) — and `__CHECKS__` reports 0 mismatches. The harness (62/62, per RESULTS) corroborates this; I verified the numbers directly rather than re-running the harness.
- **KPI strip leads with walk-forward:** yes (screenshot 1: "Walk-forward median error ×2.65 vs ×5.35 flat" first, then "Walk-forward within-3x 51.6% (n=31)", then LOO, blind, odds Brier, 200 protocols, FARM 5). The strip is honest — it shows the blind ×3.78 (our worst number) rather than hiding it.
- **Two-test term table:** present for **token odds only** (`app.js` line 1077). **Finding F3 — the value-model term table is missing.** The research's change #4(b) asked for a term table in the method/calibration tab for the value model; `RESULTS_round7.md` §1d claims the calibration tab adds "the two-test term table" (singular — the odds one). There is no per-term LOO + WF table for the value model, and no on-dashboard record that family/growth/age/chain-count were tested for value and rejected. Kiencx shows this table prominently. The LOO variant table (flat/global/size-only/damped/ridge) and the prose ("the ridge replaces the round-6 two-stage term…") partially cover it, but the judge cannot see the value-term discipline. Fix: add the table (or a compact paragraph with the tested-and-rejected value terms and their LOO/WF numbers).
- **Worked example:** yes (`app.js` line 795, "Worked example: row 1, Steakhouse Financial"), computed in-page, including the odds step (line 803) and the note that the biggest implied value is not the best farm.
- **Odds censoring caveat:** yes, clearly stated (`app.js` line 1076).
- **Detail view / playbook (screenshot 2, MetalX):** fully consistent — cost lines sum exactly ($0.80 + $27.74 + $3.75 + $3.75 + $2.00 + $0.05 + $0.00 = $38.09; extra-fee split $7.50 + $2.00 + $0.05 = $9.55), Net EV board $71.29 → fully costed $61.74, p25 +$1.68 → −$7.87, break-even $1.4M / $3.6M = 2.62x (fully-costed break-even $1,026,681 × 38.09/28.54 = $1.37M — reconciles). No garbling.
- **Anchors tab (screenshot 4):** honest — "49 of 95 peers land within 3x out-of-fold", table sorted worst-first (Rain 581x, Nexo 114x shown, not hidden). Legible.

**Finding F2 (disclosure gap, see §1b):** the dashboard never mentions OLS or the ×2.83 half/half figure. `RESULTS_round7.md` §5's claim that the Huber caveat "is stated in the method/calibration tabs" is inaccurate. One sentence fixes it.

**Minor wording:** `app.js` line 1040 says "while leave-one-out stays ×2.77" — LOO actually improved from ×2.96 (round 6) to ×2.77; "stays" is loose. Suggest "while leave-one-out improves to ×2.77". Trivial; fold into any edit pass.

---

## 6. Bugs, inconsistencies, reconciliation

Independently checked and **all reconcile**, except F1 (documentation):
- Board: 200 rows, verdicts 169/26/3/2, ranks in order, values never rise, watchlist $346.5M / VIL $727M, board $693M. ✓
- Playbooks (5): fee splits sum to extraTotal; boardTotal = gas + opp; netEvFull = board NetEV − extraTotal; netEvP25Full = board p25 − extraTotal. P25-FULL only Binaryx (+$5.45); top fully-costed NetEV MetalX $61.74; MetalX/Katana fully-costed p25 −$7.87/−$7.58. All cross-checks pass. ✓
- Python reconciliation (`round7/reconcile_round7.py`): re-ran, PASSED — ridge a/b, odds coefficients, all 200 implied/odds/multiples/ranks/verdicts/net EVs, playbook totals, accounting. ✓
- Byte-identical rebuilds and the 62/62 harness: reported in RESULTS; I did not re-run the harness, but I verified the underlying numbers directly from `out/data.js` and `out/board.json`, which is the stronger check for the numeric claims. The two rebuilds' outputs are the ones I checked.
- **F1:** `RESULTS_round7.md` §2 "coherence 0.879" vs shipped 0.7775. Documentation error only; the dashboard shows 0.778. Fix the RESULTS file.
- No other numeric inconsistencies found. The `topScalar` 1.00 no-op loop and the `shrinkK` removal are clean. The `isRankable`/`rankableType` odds-training bug is fixed and the fix is correct.

---

## Verdict

### SUBMIT WITH FIXES

Round 7 is a real, measured improvement over round 6 and a structurally complete entry: the ridge model is correctly implemented and validated, the odds model is a genuine capability the top tier all share, the accounting/integrity/worked-example gaps from the research are closed, and the dashboard is honest about its limits (blind CI crossing zero, flat out-ranking on Spearman, the LOO noise floor, the odds censoring, the P25 redefinition). The numbers reconcile — I verified them independently, including re-running the ridge scripts and the Python reconciliation.

But it does **not** beat kiencx, and the two disclosure gaps (F2, F3) plus the RESULTS typo (F1) should be fixed before the slot is spent. The fixes are cheap and they strengthen exactly the credibility the judge rewards. Do not submit as-is with an inaccurate RESULTS claim and an undisclosed OLS comparison sitting in the repo.

**Top-5 probability: 20%. Top-10 probability: 50%.** Round 7 is roughly at the #10 bar (960,454): it beats europa-nova decisively on LOO (×2.77 vs ×3.96) but trails on the headline walk-forward (×2.65 vs ×2.45), on odds Brier WF (0.225 vs 0.200), and on FARM count (5 vs 12). The round-6 audits predicted 954–960k for a materially weaker entry; round 7 should land above that, but the FARM thinning and the still-behind WF keep it a coin flip for top 10, and top 5 would require beating entries at 962k+ that still lead on the deciding criterion.

### Required fixes (before submitting)
1. **`round7/RESULTS_round7.md` §2 — correct the coherence figure.** Change "coherence 0.879" to "coherence 0.778" (the shipped, odds-weighted value in `out/data.js`; 0.879 is the value-if-launches coherence). The dashboard is already correct; only the RESULTS file is wrong.
2. **`dashboard/app.js` — add the OLS half/half disclosure to the calibration tab (ridge section, near line 1040).** Add one sentence: "Plain OLS ridge wins the half/half walk-forward (×2.83 vs ×3.01) at every λ; Huber is kept because it wins leave-one-out (×2.77 vs ×2.98), the 2025-cutoff walk-forward (×2.65 vs ×2.79), and Spearman on all three splits." Also correct `RESULTS_round7.md` §5 flag 1 to say this disclosure is being added (it was not previously on the dashboard).
3. **`dashboard/app.js` — show the value-if-launches watchlist total on the board tab.** In the board-tab footnote/legend (near line 862), add the value-if-launches total ($727M) alongside the odds-weighted total ($346.5M), so the judge sees both without opening the method tab. One line; the method tab (line 994) already states it.
4. **`dashboard/app.js` — add a value-model two-test term table to the calibration tab.** Add a compact table (or paragraph) listing the value-model terms tested — size curve (kept), category ridge (kept), family effect, 7-day growth, age/years listed, chain count, control — with their LOO and walk-forward misses and kept/tested-not-kept status, from the research/benchmark measurements. Kiencx shows this prominently; we currently show it only for the odds model.

### Recommended (do if time permits; not blocking submission)
5. **Test or drop the maturity factor.** Run the maturity factor through the two-test framework as a headline term (does including it lower LOO *and* WF?), or remove it from board values. It discounts young protocols by up to 40%, is excluded from headline validation, and both kiencx and europa-nova rejected age for the value model. It is the largest unexamined contributor to our low top-row values.
6. **Investigate the odds-level gap for large established protocols.** Steakhouse odds 0.58 (ours) vs 0.85 (kiencx) vs 0.79 (europa-nova) drive the top-10 SKIP/THIN and the $346.5M watchlist total. Check whether the odds model is under-dispersed for big/old protocols (e.g. whether the family term, which improves LOO Brier to 0.200, should be revisited with a stronger WF criterion rather than rejected on a 0.00024 tie).
7. **Minor:** `app.js` line 1040, change "while leave-one-out stays ×2.77" to "while leave-one-out improves to ×2.77" (it was ×2.96 in round 6). And in the accounting table, the "Live, no usable cap" note could say "no usable market cap or identifiers" (the group is `!isPreToken && !isPeer`, which also catches missing gecko/symbol or zero TVL).

### Single most important reason if this were DO NOT SUBMIT
Not applicable — the verdict is SUBMIT WITH FIXES, not DO NOT SUBMIT. If forced to name the one thing that would flip it to DO NOT SUBMIT, it would be the FARM-5 thin board combined with still trailing kiencx on walk-forward: the entry narrows the gap but does not close it, so a submission now spends a slot on a coin-flip top-10 entry rather than a favourite. The fixes above do not change that judgement; they make the entry as strong and as honest as it can be before the slot is spent.
