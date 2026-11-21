# Audit — Round 8: winsorized ridge + drop maturity/growth ("Tidegauge")
## Independent auditor, DeepSeek perspective — 2026-11-21

**Entry audited:** Tidegauge round 8, branch `round8-winsor`, commit `c29206a` (from round 7 commit `79395cd`). Model `radar-8-winsor`.
**Benchmark:** kiencx #1 "Launch Radar v4" (judge 966,767); europa-nova #10 (960,454, the bar).
**What I did:** read `round8/RESULTS_round8.md`, `benchmark/path-to-number-one.md`, `benchmark/how-to-beat-kiencx.md`, all three round-7 audits, `lib/model.ts` (winsor implementation, `valueTermTable`, `looRun`, `fitModel`, `attachPlaybooks`), `dashboard/app.js` (key sections), all four screenshots. Independently verified every headline number against `out/data.js` and `out/board.json` (node, not the build's code), hashed the dossier images against `screenshots/`, re-ran `round8/reconcile_round8.py` (Python) and `benchmark/value-terms-r8.ts` (node), re-ran the harness `~/workspace/makefun/shot-tool/r8_verify.mjs` (68/68), and verified byte-identical rebuilds (`diff -r out out2`). I did not modify any source file; this audit file is the only file I wrote.

---

## Verdict

### SUBMIT WITH FIXES

Round 8 is the strongest round yet and the first that **beats kiencx on the deciding criterion**: walk-forward ×2.19 vs ×2.53, LOO ×2.74 vs ×3.33. Every research expectation was hit exactly, every number I checked reconciles, the round-7 dossier blocker is fixed (dossier hashes match the round-8 screenshots 4/4), and all five playbooks reconcile to the cent. But one round-7 fix is **not actually done** despite RESULTS claiming it is: the 4th dossier image is not a board-table shot — it shows the accounting table, so the judge still cannot see the ranked board table, the TOKEN ODDS column, or the verdicts. That is the one required fix, and it is small (one harness line + retake + rebuild). Do not submit until it is fixed and re-verified.

- **Top-10 probability: 85%**
- **Top-5 probability: 40%**
- **#1 probability: 30%**

---

## 1. Model correctness

### 1a. Winsorized ridge — CORRECT, no leakage
`ridgeFit` (`lib/model.ts:831-905`): log10(mcap) is clipped at the train set's 5th/95th percentiles using the index rule `sorted[Math.floor(q * (n - 1))]` — the exact rule the research measured — before the ridge solve; Huber IRLS residuals are measured against the winsorized outcome; penalties λ=4 on category offsets only, intercept and slope unpenalised. Shipped fit (`out/data.js`): a = 3.9013, b = 0.4137, R² = 0.2448, residSd = 0.8126, winsor bounds [5.4578, 8.5026] (=$287K–$318M), λ = 4, Huber true, n = 95 — all confirmed, and the Python reconciliation (re-run by me, PASSED) reproduces a/b and the bounds independently.

No test-set leakage: `looRun` (`lib/model.ts:2310-2325`) refits `fitModel(train)` on the 94-peer train set for every fold, so the winsor bounds are per-fold train-set quantiles. The WF fit uses the 64-peer pre-2025 train set. The full 95-peer fit is used only for the board, not for validation. The winsorization is a fitting choice on the train set, not test-set manipulation — the research's justification holds.

### 1b. Huber vs OLS on the winsorized fit — the research's §4 claim was wrong, and the build caught it
I re-ran `benchmark/value-terms-r8.ts` (node) against the sealed snapshot, on the lib code path:

| Split (λ=4, winsor 5/95) | Huber (shipped) | OLS |
|---|---|---|
| LOO (n=95) | **×2.74 / 50.5% / ρ0.345** | ×2.76 / 51.6% / ρ0.336 |
| WF 2025-cutoff (n=31) | **×2.19 / 51.6% / ρ0.259** | ×2.28 / 51.6% / ρ0.259 |
| WF half/half (n=48) | **×2.59 / 54.2% / ρ0.313** | ×2.61 / 54.2% / ρ0.311 |
| Blind 80/20 ×5 | ×3.73 / 45.3% / ρ0.448 | **×3.48 / 47.4% / ρ0.446** |

The research report §4 claimed "Huber wins or ties on all four [splits]" — that is **wrong on the winsorized fit**: OLS wins blind (×3.48 vs ×3.73, and on within-3x 47.4% vs 45.3%). The build's RESULTS file states this correction explicitly, and the dashboard states it too (`dashboard/app.js:1042`: "loses the blind test (x3.73 vs x3.48 OLS); it is kept for the headline splits"). Keeping Huber is still the right call — it wins the two headline splits (LOO and the 2025-cutoff WF) and the half/half split the winsorization fixed — but the blind loss is real and is now disclosed, which is exactly what the round-7 audits asked for. Credit to the build for catching the research error rather than repeating it.

### 1c. Maturity + growth dropped — measured, and the board shows it
`MODEL` (`out/data.js`): `growthWeight: 0`, `maturityFloor: 1`, `maturityRange: 0`. Spot-checked on the board: Steakhouse `model.growth_multiplier: 1`, `model.maturity_multiplier: 1`. The research measured maturity as actively harmful to WF-cutoff (×2.65 → ×3.05 when applied) and growth as roughly neutral; dropping both is the measured call, and the board is now "the fitted model, no priors". The FARM count rose 5 → 8 and the watchlist $346.5M → $402.0M, matching the research's predicted $402.0M exactly.

### 1d. Token-odds logistic — unchanged, still validated, still behind kiencx
Odds fit unchanged from round 7 (age + size): intercept −1.2486, age 0.6947, size 0.1657 — confirmed in `out/data.js`. Brier LOO 0.20846 / WF 0.22533 (base 0.24994 / 0.33160), called-right 67.9% / 65.9%, wfTestN 276. The odds term table is unchanged and correct (family improves LOO to 0.200 but ties WF at 0.22509 vs 0.22533 and lowers Steakhouse to 0.55 — correctly not kept). The odds gap vs kiencx (Brier 0.186/0.215; Steakhouse 0.58 vs 0.85) is structural and unclosed, as the research established. Nothing new to add, except that the odds model is now the binding constraint on the board's richness (see §4).

### 1e. Dead `ridgeHuber` flag — FIXED
`fitModel` (`lib/model.ts:982`) now passes `model.ridgeHuber` to `ridgeFit` (was hardcoded `true` in round 7), and the returned fit carries `ridgeHuber: model.ridgeHuber` (line 1016). The dashboard reads it from the fit. The round-7 bug is fixed.

---

## 2. Validation honesty — every headline number verified

All numbers below were read by me from `out/data.js` / `out/board.json` (node), not from the build's scripts:

| Metric | Claimed (RESULTS §2) | Shipped (`data.js` / `board.json`) | Match |
|---|---|---|---|
| LOO median max-ratio / within-3x / Spearman | ×2.74 / 50.5% / 0.345 | 2.7406 / 50.5263% / 0.3453 | Yes |
| Blind 80/20 ×5 median / within-3x / Spearman | ×3.73 / 45.3% / 0.448 | 3.7334 / 45.2632% / 0.4481 | Yes |
| WF 2025-cutoff median / within-3x / Spearman (n=31) | ×2.19 / 51.6% / 0.259 | 2.1949 / 51.6129% / 0.2593 | Yes |
| WF half/half median / within-3x / Spearman (n=48) | ×2.59 / 54.2% / 0.313 | 2.5858 / 54.1667% / 0.3127 | Yes |
| Odds Brier LOO / WF; base | 0.208 / 0.225; 0.250 / 0.332 | 0.20846 / 0.22533; 0.24994 / 0.33160 | Yes |
| Coherence | 0.8152 | 0.8152 | Yes |
| Band coverage blind 80% / 50%, time 80% / 50% | 0.811 / 0.463 / 0.742 / 0.484 | 0.8105 / 0.4632 / 0.7419 / 0.5161 | See note |
| Band width 80% / 50% | 106.8 / 9.6 | 106.77 / 9.60 | Yes |
| LOO on all 128 traded peers | ×3.64 / 44.5% | 3.642 / 44.53% | Yes |
| LOO P90 max-ratio | ×29.14 | 29.14 (from `adoptedP90MaxRatio`) | Yes |
| Watchlist odds-weighted / VIL / board total | $402.0M / $877.8M / $839.8M | $402.0M / $877.8M / $839.8M (recomputed from `board.json`) | Yes |

**Note on band coverage:** RESULTS §2 lists "80% band coverage (blind) 81.1%" and the time-split coverage is not separately claimed in the table; the shipped `timeCov50` is 0.5161 (round 7 was 0.4839) — an improvement, not a discrepancy. No number in RESULTS is wrong.

**No cherry-picking found.** All four splits are reported (LOO, blind, WF-cutoff, WF-half/half), including the blind loss to OLS and the LOO within-3x dip (51.6% → 50.5%) and Spearman dip (0.360 → 0.345) that winsorization caused. The KPI strip leads with WF ×2.19 (the headline) but also shows blind ×3.73 and the odds Brier — the weakest numbers are not hidden.

**Value-model two-test term table — verified, computed from the snapshot.** `valueTermTable` (`lib/model.ts:2227-2300`) refits per variant (LOO full refit per fold; WF on the 64/31 split) and the shipped table in `data.js` matches my re-run of `benchmark/value-terms-r8.ts` exactly:

| Terms | LOO | WF-cutoff | Status |
|---|---|---|---|
| size curve only | ×3.18 / 47.4% | ×2.77 / 51.6% | tested, not kept |
| size curve + category ridge | ×2.74 / 50.5% | ×2.19 / 51.6% | kept |
| adopted + family effect · ridge 16 | ×2.74 / 50.5% | ×2.19 / 51.6% | tested, not kept |
| adopted + 7-day TVL growth | ×2.96 / 50.5% | ×2.44 / 51.6% | tested, not kept |
| adopted + age, years listed | ×3.09 / 48.4% | ×3.64 / 35.5% | tested, not kept |
| adopted + chain count, ln | ×3.05 / 48.4% | ×2.23 / 51.6% | tested, not kept |
| adopted + control: growth of another row | ×2.71 / 50.5% | ×3.25 / 48.4% | must not help |

Two things I checked specifically. **First, the "size curve only" row is a genuine refit** (categories: false → intercept+slope only, Huber, winsorized), not the adopted fit's a/b without offsets — so the round-7 GLM label concern does not apply to this table. (The separate LOO variant table still labels its row "size curve only (ridge a/b, no offsets)" — honest as labelled.) **Second, the family row's identity to adopted is real:** I counted name stems among the fit peers from the snapshot — all 95 have distinct first-word stems (0 stems with ≥2 members; the 9 extra protocols in my first count all have mcap 0 and are correctly excluded by `isPeer`). With no stem reaching the ≥3 threshold, `familyStems()` returns [] and the family variant adds no columns. The dashboard states this explicitly (`app.js:1070`). Correct.

---

## 3. The board — verified, and the playbooks reconcile to the cent

From `out/board.json` (200 rows): verdicts **SKIP 156 / THIN 36 / P25-POSITIVE 2 / FARM 6 (FARM 8 total)**, ranks 1–200 in order, values never rise. Watchlist $402.0M odds-weighted ($877.8M value-if-launches), board total $839.8M. Top 10 match RESULTS exactly: #1 Steakhouse $37.3M (odds 0.58, SKIP), #2 Veda $30.5M (0.60), #3 Gauntlet $28.5M (0.56), #4 Upshift $18.7M (0.59), #5 Symbiotic $15.4M (0.64), #6 USDD $15.0M (0.58), #7 Lofty $15.0M (0.85, THIN), #8 OpenTrade $14.2M (0.56), #9 Hive $14.1M (0.65), #10 Plume Vaults $13.7M (0.57). All top 10 are still SKIP/THIN.

**Playbooks (5) — independently recomputed from `out/data.js` rows:**

| Row | Board NetEV | Extra fees | Fully costed NetEV | Board p25 | Fully costed p25 |
|---|---|---|---|---|---|
| Katana DEX | $76.61 | $9.55 (swaps $7.50 + bridge $2.00 + gas $0.05) | **$67.06** | $8.23 | **−$1.32** |
| Wrapped | $57.51 | $4.10 (bridges $4.00 + gas $0.10) | $53.41 | $1.15 | −$2.95 |
| Binaryx Platform | $53.74 | $2.05 (bridge $2.00 + gas $0.05) | $51.69 | −$3.41 | **−$5.46** |
| MetalX Swap | $74.13 | $9.55 | $64.58 | −$0.73 | −$10.28 |
| SyncSwap | $53.81 | $12.10 (swaps $7.50 + bridges $4.00 + gas $0.60) | $41.71 | −$3.96 | −$16.06 |

Every figure matches RESULTS. The fee logic is consistent: LP rows pay entry+exit swaps, mint rows (Binaryx) pay no swaps, multi-chain rows pay per-chain bridge+gas. **P25-FULL: 0** — both P25-positive rows go negative fully costed at p25 (Wrapped −$2.95, Katana −$1.32), and the board legend states "2 of 2 pre-fee P25-positive rows are negative once costs are counted". The P25-POSITIVE badge remains defined on board costs with the "(pre-fee)" qualifier — honest, and the fully costed floor is shown beside the badge. The harness (re-run by me, 68/68) confirms the Katana $67.06 and Binaryx −$5.46 text renders on the detail views.

**Accounting:** 9 groups sum to 758 (40/160/95/33/288/42/11/63/26) — verified from `data.js`. Integrity strip present. The "Live, no usable cap" label simplification noted in round 7 (the group also catches missing gecko/symbol or zero TVL) is still there; unchanged, still acceptable.

---

## 4. The gap to kiencx — round 8 reverses the deciding criterion

Comparison numbers for kiencx/europa-nova confirmed against `benchmark/how-to-beat-kiencx.md` (artifact reads):

| Dimension | Kiencx (#1, 966,767) | Round 8 | Who wins |
|---|---|---|---|
| Walk-forward miss (2025-cutoff) | ×2.53 | **×2.19** | Us, by 0.34 |
| WF within-3x | 55% | 51.6% | Kiencx |
| LOO median max-ratio / within-3x | ×3.33 / 45% | **×2.74 / 50.5%** | Us |
| Blind median max-ratio | (not reported) | ×3.73 | — |
| Odds Brier LOO / WF | **0.186 / 0.215** | 0.208 / 0.225 | Kiencx |
| FARM count | 14 | 8 | Kiencx |
| Top implied value (Steakhouse) | $68.7M | $37.3M | Kiencx |
| Board total | $1,521.8M | $839.8M | Kiencx |
| 758 accounting + integrity strip | Yes | Yes | Tie |
| Two-test term table (value) | Yes | Yes (now) | Tie |
| Worked example | No | Yes | Us |
| Legibility / density | Dense | Cleaner, larger type | Us |

Against europa-nova (#10, 960,454): we now beat them on WF (×2.19 vs ×2.45) and LOO (×2.74 vs ×3.96) decisively, but trail on odds Brier WF (0.225 vs 0.200) and FARM (8 vs 12).

**The accuracy lead is real and it is on the criterion that decides.** The blind test that motivated round 7 was won by kiencx 2–0, margin 3, on criterion 1 (model accuracy), when the WF gap was 0.90 against us. The gap is now 0.34 in our favour — a larger margin, reversed. That is the strongest single fact in this entry's favour.

**But the win is not clean.** Three things still trail, and the audit must state them plainly:
1. **WF within-3x still trails** (51.6% vs 55%) and LOO within-3x/Spearman dipped with winsorization (50.5%/0.345 vs round 7's 51.6%/0.360). If the judge weighs within-3x rather than the median miss, the accuracy lead narrows.
2. **Odds Brier trails on both tests** (0.208/0.225 vs 0.186/0.215). The WF gap (0.010) is likely within noise (n=276); the LOO gap (0.022) is real but small. The visible consequence is the board: our Steakhouse odds 0.58 vs kiencx 0.85.
3. **The board is still much thinner** (FARM 8 vs 14, top $37.3M vs $68.7M, board $0.84B vs $1.52B), and the top 10 rows are still all SKIP/THIN with negative NetEV. The winsorized ridge's flatter slope (0.414 vs 0.455) predicts better but prices the top lower — the validation win comes with a visible board cost, exactly as the research warned. Whether the judge weights the accuracy lead over the farm richness is the open question, and it can only be resolved by the blind test.

---

## 5. Presentation — all four screenshots viewed

- **1-board.png:** KPI strip leads with WF ×2.19 vs ×5.35 flat, WF within-3x 51.6% (n=31), LOO ×2.74, blind ×3.73, odds Brier 0.208/0.225, FARM 8. Bubble map + legend legible. The legend shows both watchlist totals ($402.0M expected; $877.8M value-if-launches) and the "2 of 2 negative" disclosure. No garbling.
- **2-detail.png (Katana):** playbook legible, cost lines sum exactly ($0.80 + $27.74 + $3.75 + $3.75 + $2.00 + $0.05 + $0.00 = $38.09; extra-fee split $7.50 + $2.00 + $0.05 = $9.55), NetEV board $76.61 → fully costed $67.06, p25 +$8.23 → −$1.32. Matches the built data.
- **3-calibration.png:** ridge section legible, winsor bounds [5.46, 8.50] stated, Huber/OLS disclosure present ("loses the blind test (x3.73 vs x3.48 OLS)... Without winsorization, Huber lost the half/half split to OLS (x3.01 vs x2.83 in round 7) — the winsorization is what fixed that split"). Fit peers 95 of 128, dateless exclusion (×2.19 → ×2.80) stated.
- **4-board-table.png: NOT a board-table shot — see Finding F1 below.** It shows the accounting table and the yardstick scatter. The ranked board table appears in **none** of the four dossier images.

**Round-7 audit fixes — status:**
- (a) Dossier rebuilt with round-8 shots: **FIXED.** Dossier image hashes == `screenshots/` hashes 4/4 (fceefb8c…, ae3511c1…, 50d98a44…, 8aa3cddc…), verified by me by decoding the base64 images. `out/` vs `out2/` byte-identical (verified by `diff -r`). The round-7 blocker does not recur.
- (b) Board-table dossier image: **NOT FIXED — Finding F1.**
- (c) False claims corrected: **FIXED.** RESULTS_round8.md states kiencx HAS a Brier-validated odds model better than ours (0.186/0.215 vs 0.208/0.225) and coherence 0.8152 (round 7: 0.778, not 0.879).
- (d) Huber/OLS disclosure: **FIXED** (`app.js:1042`, visible in screenshot 3).
- (e) Value-model two-test term table: **FIXED** (`app.js:1064`, computed in `lib/model.ts:2227`, harness-verified).
- (f) VIL total on board tab: **FIXED** (`app.js:864` legend).
- (g) Dead ridgeHuber flag: **FIXED** (`lib/model.ts:982`).
- (h) Ship-rule re-basing: **FIXED as a recorded decision** (`app.js:996, 1014`; RESULTS §"Ship-rule watchlist band"). See Finding F2 (governance note, not a blocker).
- Header-comment stale numbers (round-7 GLM fix #3): **FIXED** — slope 0.414, WF ×2.19/×2.59, LOO ×2.74, blind loss stated, size factor 0.075x, p90 ×29.1, band ~107x, FARM cap 8 (`lib/model.ts:232`).
- Odds censoring caveat: still present (`app.js:1086`).

---

## 6. Findings

### F1 — REQUIRED FIX: the 4th dossier image does not show the board table
**What:** `screenshots/4-board-table.png` — the image RESULTS claims is "a board-table shot (replacing anchors) — the judge can now see the ranked board table, the TOKEN ODDS column and the verdicts" — shows the **accounting table** ("Where every protocol went": Group / Protocols / Why they are there) and the yardstick scatter ("Where the market sits against the yardstick"). The ranked board table (200 rows, TOKEN ODDS column, verdicts) appears in **none** of the four dossier images. The claim in RESULTS §"What changed" item 5(b) is false, and the round-7 GLM fix #7 is not actually done.

**Cause:** `~/workspace/makefun/shot-tool/r8_verify.mjs:301-307` takes shot 4 by scrolling `document.querySelector('table')` — the **first** `<table>` in DOM order — into view. In `boardHtml()` (`dashboard/app.js:847-921`), the accounting table is rendered **before** the ranked board table (accounting appended at line 866; the ranked `<table>` is built at line 882, after the yardstick, formula box, worked example, playbooks, summary and filters). So the first table in the document is the accounting table, and that is what the shot captures.

**Why it matters:** the judge scores the images. The TOKEN ODDS column — the round-7 capability the top tier all share — and the verdicts are invisible to the judge from the dossier, exactly as in round 7. Kiencx's judged image shows its board. This is the same class of defect as the round-7 stale-dossier blocker (the judge sees something other than the entry's strongest evidence), though smaller in scope.

**Fix:** in `r8_verify.mjs`, scroll to the ranked board table specifically — e.g. select the table whose header contains "Token odds" (or the table following the `.filters` div) — retake `4-board-table.png`, rebuild `out/` and `out2/`, re-verify dossier hashes 4/4 and byte-identical rebuilds. **Also add a harness check** that the shot's target is the ranked table (e.g. assert the scrolled-to table's header text includes "Token odds" and "Verdict") — the harness currently passes 68/68 while the shot's intent fails, because nothing checks what shot 4 contains. Do not submit until the new shot visibly shows ranked rows with the Token odds column and verdicts.

### F2 — GOVERNANCE NOTE (not a blocker): the re-based ship-rule reference equals the current total
The re-based reference is set to the current value-if-launches total ($877.8M; band $0.66B–$1.10B). Round 8 therefore passes its own re-based band by construction; the band only binds future variants. The old-band miss is stated explicitly and honestly on the dashboard (`app.js:996`: "the round-8 total is 37.8% above it, outside the old band, because the maturity discount is gone") and in RESULTS, so this is disclosed, not deceptive. But the parent/user should confirm this convention — reference anchored at the new model's scale — is what they intend, rather than an independently chosen reference. No code change required; a recorded decision is enough, and RESULTS already records it.

### F3 — OBSERVATION (not a fix): the accuracy lead is median-miss, not within-3x
Winsorization improved every median max-ratio but not within-3x or Spearman on LOO (50.5%/0.345 vs round 7's 51.6%/0.360) and WF within-3x is flat at 51.6% vs kiencx's 55%. If the judge's criterion 1 weighs within-3x, the lead is thinner than the headline ×2.19 vs ×2.53 suggests. Nothing to change — the numbers are all disclosed — but the blind test should be read with this in mind: a win on median miss with a loss on within-3x would be a split criterion-1 verdict.

### F4 — MINOR: untracked tmp screenshots in `screenshots/`
`screenshots/tmp-accounting.png` and `tmp-playbooks-panel.png` are untracked (not in commit c29206a) — harmless leftovers from the build's harness run. Delete them before bundling so no stale inspection shot is ever copied into `out/`. (The round-7 `tmp-board-table.png` is gone; the harness no longer writes it.)

---

## Verdict restated

### SUBMIT WITH FIXES

**Top-10 probability: 85%. Top-5 probability: 40%. #1 probability: 30%.**

Round 8 is the first round that beats kiencx on the deciding criterion, and it does so by a margin (0.34) larger than the one that beat us in the round-6 blind test (0.12 the other way). The model work is correct, the validation is honest and complete, the numbers reconcile everywhere I checked, and the round-7 blocker is fixed. The probabilities reflect the remaining risk honestly: the board is still thinner (FARM 8 vs 14, top $37M vs $69M), the odds Brier still trails, and within-3x still trails — so #1 is a genuine contest, not a lock. The single required fix (F1) is small and mechanical; once the board-table shot actually shows the board and the hashes are re-verified, the entry is submittable. A blind pairwise re-test against kiencx (and europa-nova) with the fixed dossier is still recommended before spending the slot, since the accuracy-vs-richness weighting is the one thing no local measurement can settle.

### Required fix (before submitting)
1. **Fix the 4th dossier image (F1).** In `~/workspace/makefun/shot-tool/r8_verify.mjs`, change the shot-4 scroll target from `document.querySelector('table')` (the accounting table) to the ranked board table (the table whose header contains "Token odds"). Retake `screenshots/4-board-table.png`, rebuild `out/` and `out2/`, re-verify dossier hashes 4/4 and byte-identical rebuilds, and confirm by viewing the new shot that ranked rows with the Token odds column and verdicts are visible. Add a harness check that the shot-4 target table's header includes "Token odds" so this cannot silently regress again. Then correct RESULTS_round8.md item 5(b) only if the new shot differs from what it currently claims (it will then be true).

### Recommended (do if time permits; not blocking submission)
2. **Delete the untracked tmp screenshots** (`screenshots/tmp-accounting.png`, `tmp-playbooks-panel.png`) before bundling (F4).
3. **Record the ship-rule re-basing convention explicitly** with the user (F2): the reference is anchored at the round-8 VIL total ($0.878B) and binds future variants.
4. **Blind pairwise test vs kiencx and europa-nova with the FIXED dossier** before submitting — the accuracy-vs-richness weighting is unmeasurable locally.
5. **Do not chase the odds gap by refitting.** The survival/hazard model is the only untested lever and it is unmeasured; do not build it into a fix round without its own two-test validation.

### Single most important reason if this were DO NOT SUBMIT
Not applicable — the verdict is SUBMIT WITH FIXES. If forced to name the one thing that would flip it, it would be F1 combined with the board thinness: submitting a dossier whose images still hide the board table would repeat round 7's core failure (the judge scoring an artifact that does not show the entry's evidence), and the thin board would then carry the whole verdict with the accuracy lead invisible in the one place the judge looks first.
