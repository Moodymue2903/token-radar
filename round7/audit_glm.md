# Audit — Round 7 "Tidegauge" (GLM perspective, independent)

**Auditor:** independent (GLM perspective). **Date:** 2026-11-21. **Branch:** `round7-ridge`.
**Scope:** `round7/RESULTS_round7.md`, `benchmark/how-to-beat-kiencx.md`,
`lib/model.ts`, `dashboard/app.js`, `screenshots/1–4-board.png`, `out/data.js`,
`out/board.json`, `out/dossier.json`, `top10/r01-kiencx.webp`, `top10/r10-europa-nova.webp`.
**Method:** read the code; re-ran `benchmark/ridge-test.ts` and `benchmark/ridge-sweep.ts`;
verified every reported number independently against the built `out/data.js` and
`out/board.json` (Python); viewed all 4 screenshots and the 3 inspection images;
extracted and viewed the dossier's embedded images. No files modified except this report.

## Verdict: SUBMIT WITH FIXES

- **Top-5 probability: 20%**
- **Top-10 probability: 55%**
- **Blocking fix:** the dossier embeds round 6 screenshots (fix #1). Do NOT submit until
  the dossier is rebuilt with the round 7 images and re-verified.

Round 7 is a real, measured improvement on the deciding criterion and it closes most of
the gap to kiencx — but it does not beat kiencx, and the shipped dossier as it stands
would show the judge round 6's dashboard, not round 7's.

---

## 1. Model correctness

### 1a. Ridge regression — CORRECT
`ridgeFit` (`lib/model.ts:752–825`): design matrix is intercept + log10(TVL) + one-hot
category offsets; the penalty is added only to diagonal entries j ≥ 2
(`for (let j = 2; j < d; j++) A[j]![j]! += lambda`), so the intercept and slope are
unpenalised. Categories with fewer than `minPeers` (3) are excluded from the design, so
they get offset 0. Huber IRLS is 20 iterations, weights min(1, δ/|r|), δ = 1.0 in log10
units, starting from OLS. `fitModel` (line 867) calls it with λ = 4, Huber on.
Independent Python reconciliation (`round7/reconcile_round7.py`, which passes) confirms
a = 3.5936, b = 0.4550. I re-ran `benchmark/ridge-test.ts` and `benchmark/ridge-sweep.ts`
and the numbers reproduce exactly (see §1b).

### 1b. Huber vs OLS — justified by the stated rule, with a real undisclosed caveat
Re-ran both scripts (node v24.22.1, sealed snapshot, n = 95):

| λ | Huber LOO | OLS LOO | Huber WF 2025 | OLS WF 2025 | Huber WF half/half | OLS WF half/half |
|---|---|---|---|---|---|---|
| 1 | ×3.17 | ×3.28 | ×2.78 | ×2.99 | ×3.01 | ×2.99 |
| 4 | **×2.77** | ×2.98 | **×2.65** | ×2.79 | ×3.01 | **×2.83** |
| 16 | ×3.01 | ×3.09 | ×2.80 | ×2.80 | ×3.05 | ×2.85 |
| 64 | ×3.04 | ×3.26 | ×2.89 | ×2.99 | ×3.03 | ×2.96 |

Huber wins LOO (×2.77 vs ×2.98 at λ = 4) and the 2025-cutoff walk-forward (×2.65 vs
×2.79), and wins Spearman on every split (LOO 0.360 vs 0.333; WF-cutoff 0.248 vs 0.244;
half/half 0.302 vs 0.295). It **loses the half/half walk-forward to OLS at every λ**
(λ = 4: ×3.01 vs ×2.83; λ = 16: ×3.05 vs ×2.85; λ = 64: ×3.03 vs ×2.96; λ = 1: ×3.01
vs ×2.99). Under the two-test rule as defined in the research (LOO + 2025-cutoff WF),
Huber is the correct choice — it wins both deciding tests. But note the rule as applied
uses only ONE of the two reported WF splits as the deciding test. Across the three
reported tests Huber wins 2 (LOO, WF-cutoff) and loses 1 (WF-half/half); OLS wins 1 and
loses 2. Keeping Huber is defensible, but the half/half loss is a real caveat and it is
**not disclosed on the dashboard** (there is no "OLS" in `dashboard/app.js` at all; see
fix #5). `RESULTS_round7.md` §5 flag 1 claims the caveat is "stated in the
method/calibration tabs" — that claim is inaccurate: the half/half number (×3.01) is
stated, the OLS comparison (×2.83) is not.

Minor inconsistency: `ModelConstants` has no `ridgeHuber` field; `fitModel`
(`lib/model.ts:867`) hardcodes `true` for Huber and hardcodes `ridgeHuber: true` in the
returned fit (line 901). The model cannot be re-run with OLS without a code change.
Cosmetic, but the "Huber is a choice" framing in the code is not literally true.

### 1c. Token-odds logistic — CORRECTLY specified and validated
`fitOdds` (`lib/model.ts:1469–1610`): training set = rankable-type protocols
(category ≠ CEX and not a versioned name) with a listing date, n = 532, base rate 0.492;
y = 1 if the protocol records a token, 0 if pre-token. Kept terms age + size:
intercept −1.249, age +0.695, size +0.166. Brier **LOO 0.208 / WF 0.225** vs base-rate
0.250 / 0.332; called-right 68% / 66%; wfTestN 276. The term table is computed inside
`fitOdds` every build and matches `benchmark/odds-test.ts`. Terms tested and correctly
rejected by the two-test rule: growth (0.208 / 0.226 — does not lower WF), family
(0.200 / 0.225 — improves LOO only, WF ties), chain count (0.209 / 0.226), control
"growth of another row" (0.209 / 0.225 — must not help, and does not). The placebo
design is correct (next protocol in listing order). The `isRankable` bug (training set
all y = 0) was found and fixed with the `rankableType` check. The family offsets in the
full fit are large (±3) — correctly read as small-family overfitting, which is why the
two-test rule rejects it.

Two notes. First, the odds training set excludes protocols without a listing date, and
dateless board rows get the age = 1.0-year prior in `oddsFor` — consistent with the
value model's treatment of dateless peers, and stated. Second, the outcome is "records
a token *by the snapshot date*", so the odds are a lower bound on the eventual
probability (censoring). That caveat IS stated in the calibration tab
(`dashboard/app.js:1076`) but NOT on the board tab itself; the board says "expected
value", which is honest. Acceptable, but the caveat would carry more weight on the
board tab.

---

## 2. Validation honesty

Every reported number reconciles with the built `out/data.js` and `out/board.json`,
verified independently (Python, not the build's own code):

| Metric | RESULTS_round7.md | Built data (verified) |
|---|---|---|
| LOO median max-ratio / within-3x / Spearman | ×2.77 / 51.6% / 0.360 | ×2.7696 / 51.58% / 0.3603 |
| Blind 80/20 ×5 median max-ratio / within-3x | ×3.78 / 45.3% | ×3.7786 / 45.26% |
| WF 2025-cutoff median max-ratio / within-3x / Spearman (n = 31) | ×2.65 / 51.6% / 0.248 | ×2.6472 / 51.61% / 0.2484 |
| WF half/half median max-ratio / within-3x / Spearman | ×3.01 / 47.9% / 0.302 | ×3.0063 / 47.92% / 0.3018 |
| Flat baselines LOO / blind / WF-2025 / WF-half | ×4.11 / ×4.70 / ×5.35 / ×5.29 | ×4.1071 / ×4.6963 / ×5.3519 / ×5.2937 |
| Odds Brier LOO / WF (base) | 0.208 / 0.225 (0.250 / 0.332) | 0.208 / 0.225 (0.250 / 0.332) |
| Odds called-right LOO / WF, wfTestN | 68% / 66%, 276 | 0.68 / 0.66, 276 |
| Band coverage blind 80% / 50%, time 80% / 50% | 0.811 / 0.463 / 0.742 / 0.484 | 0.811 / 0.463 / 0.742 / 0.484 |
| Board width 80% / 50% | 100.5 / 9.6 | 100.5 / 9.6 |
| LOO128 within-3x / Spearman / medianMax (n = 128) | 43.8% / 0.412 / ×3.63 | 43.8% / 0.412 / ×3.63 |
| Bias dex / p90 / chainEth / chainSol | −0.0345 / ×28.59 / +0.060 / −0.611 | −0.0345 / 28.5881 / 0.0598 / −0.6114 |
| LOO hits (peers within-3x out-of-fold) | 49/95 | 49 of 95 |

Board: 200 rows, ranks 1–200 in order, values never rise. Verdicts FARM 2 +
P25-POSITIVE 3 = 5, THIN 26, SKIP 169 — matches RESULTS. Watchlist implied total
$346.5M (odds-weighted) and value-if-launches $727.0M — match. Board implied total
$693.1M. All 5 FARM/P25 rows' net-EV arithmetic reconciles exactly to
pool = 8% × implied, share = pool × capital / TVL, netEv = share − totalCost, and
netEvRatio = netEv / totalCost (e.g. MetalX: pool $287,310.24, share $99.83, netEv
+$71.29, ratio 2.50). P25 net EVs match (MetalX +$1.68, Katana +$1.97, Binaryx +$7.50).
Implied = value-if-launches × odds to within rounding on all 200 rows.

The walk-forward improvement is real, not cherry-picked: BOTH WF splits are reported
(2025 cutoff ×2.65 and half/half ×3.01), and the half/half is the worse one. The
headline WF is the 2025 cutoff, the split the model has always used — stated, not
hidden.

**Two numbers in RESULTS_round7.md are wrong:**

1. **Coherence 0.879 (§2) is incorrect.** The built value is **0.7775** (`data.js`
   `validation.coherence`), verified independently from `board.json`:
   Spearman(TVL, implied) over the 40 watchlist rows = 0.7775. The 0.879 in RESULTS
   does not match any computed value (whole-board Spearman is 0.6775). It reads as a
   stale round-6 figure carried over.
2. **The claim that kiencx "does not have" a Brier-validated odds model is FALSE.**
   It appears twice (§2 and §5 flag 6). Kiencx's artifact shows a token-odds logistic
   with its own two-test term table: **Brier 0.215 walk-forward / 0.186 leave-one-out**
   (base 0.320 / 0.248), and its definition is "Implied value = TVL × fitted multiple
   × token odds". Kiencx not only has a Brier-validated odds model, its Brier is
   **better than ours on both tests** (0.215 vs our 0.225 WF; 0.186 vs our 0.208 LOO).
   Our odds model is validated and real, but it is not a capability kiencx lacks and it
   is not better than kiencx's. Both claims must be retracted (fix #4).

---

## 3. Board re-ranking

| | Round 6 | Round 7 |
|---|---|---|
| Watchlist total | $0.600B | **$0.347B** odds-weighted ($0.727B value-if-launches) |
| FARM total (incl. P25-POSITIVE) | 11 | **5** (2 FARM + 3 P25-POSITIVE) |
| THIN / SKIP | 72 / 117 | **26 / 169** |
| Playbooks | 7 | **5** |

Top 10 are all SKIP/THIN: #1 Steakhouse $35.6M (odds 0.58, netEv −$37.96), #2 Veda
$28.6M, #3 Gauntlet $27.6M, #4 Upshift $18.8M, #5 Lofty $15.4M (THIN), #6 Symbiotic,
#7 USDD, #8 Hive, #9 OpenTrade, #10 Plume Vaults. FARM rows: #18 Wrapped $6.9M
(netEv +$47.81, 1.67×), #42 WEMIX.FI $4.2M (+$46.46, 1.63×), #58 MetalX $3.6M
(+$71.29, 2.50×), #59 Katana $3.6M (+$66.52, 2.33×), #63 Binaryx $3.4M (+$46.10,
1.62×). P25-positive: MetalX, Katana, Binaryx. P25-FULL: 1 (Binaryx, fully costed p25
+$5.45); P25-negative fully costed: 2 (MetalX −$7.87, Katana −$7.58).

**FARM 5 is a competitive problem, not a honesty problem.** Kiencx has 14 FARM,
europa-nova 12. A board whose top 10 are all SKIP/THIN and only 5 rows farm looks
thin, and the judge compares FARM counts directly. It is the honest consequence of the
validated odds model — the verdict rule (NetEV ≥ $40 and ≥ 1.5× cost) was correctly
left unchanged, and the biggest rows have tiny pool shares because their TVL is large.
The farm layer itself is still deep (5 fully costed playbooks with fee splits). But the
thinness will cost judge points against entries with 12–14 FARM rows.

**Ship-rule flag — real, and the dashboard handles it by re-interpretation, not by
re-basing.** The standing ship rule requires the watchlist total within 25% of $0.637B
($0.478B–$0.796B). The odds-weighted watchlist total is **$346.5M — outside that
band**. The value-if-launches total ($727M) is inside it. The method tab
(`dashboard/app.js:994`) says the value-if-launches total "is within 25% of the
$0.637B reference the ship rule uses" and that "the odds weighting lowers the expected
total by construction". But the rule as codified (`dashboard/app.js:1012`) says "the
watchlist total" — and the board's watchlist total is the odds-weighted $346.5M. The
dashboard therefore implies the rule is satisfied when its literal clause (on the
board's own total) is not. The odds-weighted total is not wrong — it is the correct
expected value — but the rule text must be formally re-based to say which total it
applies to (fix #2). `RESULTS_round7.md` flag #4 discloses this honestly as a judgment
call; the dashboard text does not go as far.

---

## 4. Gap to kiencx — round 7 narrows it, does not close it

| Dimension | Kiencx (#1, 966,767) | Round 7 | Who wins |
|---|---|---|---|
| Walk-forward 2025-cutoff miss | ×2.53 | ×2.65 | Kiencx (by 0.12) |
| Walk-forward within-3x | 55% | 51.6% | Kiencx |
| LOO miss | ×3.33 | ×2.77 | **Us** |
| LOO within-3x | 45% | 51.6% | **Us** |
| Token-odds Brier WF / LOO | 0.215 / 0.186 | 0.225 / 0.208 | Kiencx (both) |
| Range within-×3 LOO / WF | 45% / 55% | 51.6% / 51.6% | Us LOO, kiencx WF |
| Range P25–P75 LOO / WF | 49% / 57% | 46.3% blind / 48.4% time | Kiencx |
| Range P10–P90 LOO / WF | 78% / 76% | 81.1% blind / 74.2% time | Mixed |
| FARM count | 14 | 5 | Kiencx |
| Farm playbook depth | per-row net/hour | 5 fully costed playbooks, fee splits, honest p25 | **Us** (depth) |
| 758 accounting + integrity strip | Yes | Yes | Tie |
| Presentation / legibility | Dense | Cleaner, larger type | **Us** |

The WF gap — the deciding criterion, and the one the blind test (kiencx won 2–0,
margin 3) turned on — narrowed from 0.90 (×3.43 vs ×2.53) to **0.12** (×2.65 vs
×2.53). That is a large, real improvement. But round 7 still loses on walk-forward,
loses on odds Brier, and loses on FARM count. It wins on LOO, on playbook depth, and
on legibility. On balance round 7 does **not** beat kiencx overall. Against europa-nova
(#10, 960,454, the bar) the picture is closer: we win LOO (×2.77 vs ×3.96) but lose WF
(×2.65 vs ×2.45), lose odds Brier (0.225 vs 0.200 WF), and lose FARM count (5 vs 12).
Top 10 is therefore a close call, not a comfortable win.

Do not inflate this: round 7 is a materially stronger entry than round 6, and it is
the first round whose walk-forward sits inside the top-10 range (2.30–2.60). It is not
a #1-beating entry on the numbers.

---

## 5. Presentation

- **758-protocol accounting bar: present and correct.** "Where every protocol went"
  (`dashboard/app.js:773–780`): 9 groups summing to 758 (40 + 160 + 95 + 33 + 288 +
  42 + 11 + 63 + 26), each with a reason. Verified against `computeAccounting`
  (`lib/model.ts:2398`) and the built data.
- **Integrity strip: present and correct.** "200 of 200 implied values recomputed here
  and matched the board's data · ranks 1–200 in order, values never rise: yes ·
  accounting totals equal: 758 of 758 · watchlist 40 of 40 ranked · ledger 758 of 758
  protocols · built by main.ts from snapshot 2026-11-14". All true (verified).
- **KPI strip leads with walk-forward: yes** (`dashboard/app.js:1265`): "Walk-forward
  median error ×2.65 vs ×5.35 flat", "Walk-forward within-3x 51.6% (n=31)", then LOO,
  blind, and "Token odds Brier 0.208 LOO / 0.225 WF vs 0.250 / 0.332 base". All numbers
  match the built data.
- **Two-test term table: present for odds only.** "Two-test term table (token odds)"
  (`dashboard/app.js:1077`) with LOO/WF Brier and kept/tested-not-kept/must-not-help
  statuses. The **value-model** two-test term table (research change #4b — each
  candidate value term with LOO and WF miss and its status) is **not built**. The
  dashboard has the LOO variant table (flat / global / size-only / damped / ridge) but
  no per-term LOO + WF table for value terms and no statement of which value terms were
  tested and rejected (family, growth, age, chain count). Gap (fix #6).
- **Worked example: present and real.** "Worked example: row 1, Steakhouse Financial"
  (`dashboard/app.js:795`), computed in-page from the row's own data (TVL × category
  multiple × size factor × growth × maturity × odds → implied value), with the
  value-if-launches figure and the farm verdict explained.
- **TOKEN ODDS column: present** on the board table (`dashboard/app.js:881`), sortable,
  alongside P10–P90, P25–P75, Multiple, Gross, Cost, Net EV, BE odds, Net $/h,
  Fees·Hold, Verdict.
- **Nothing garbled or unreadable** at 1024px in the 4 shipped screenshots
  (1-board, 2-detail/playbook, 3-calibration, 4-anchors) or the 3 inspection images.
  The MetalX playbook (screenshot 2) is clean: fully costed $38.09, Net EV +$61.74
  median, p25 −$7.87 — matches the built board.
- **But: none of the 4 dossier images shows the ranked board table.** Image 0 is the
  KPI strip + bubble map; image 1 is the playbook modal; image 2 is calibration;
  image 3 is anchors. The board table (the 200 ranked rows with the TOKEN ODDS column
  and verdicts) is below the fold and is not captured in any of the 4 images.
  Kiencx's judged image DOES show its board. The judge therefore cannot see our board
  rows from the images. `SCREENSHOT_MAX` is 4 (`main.ts:33`), so one image must be
  swapped, not added (fix #7).
- **CRITICAL — the dossier embeds round 6 screenshots, not round 7.** I extracted
  `out/dossier.json`'s 4 images and viewed them: image 0 is the **round 6** board
  ("Blind median error ×3.97 vs ×4.70 flat", "LOO within-3x 50.5%", "FARM 11, incl. 5
  Board P25-positive (pre-fee)", "Watchlist total $599.8M"; md5
  `155bbcdbdfcdafed17e49e2ccf123348`). The same stale images are in `out2/dossier.json`.
  Timeline (UTC): `out/` built 14:09:35 and `out2/` built 14:12:11, both while
  `screenshots/` still held the round 6 images; the round 7 screenshots were taken at
  14:12:56–14:12:58, and `main.ts` was never re-run afterwards. So the shipped
  dossier's visual artifact is stale. If submitted as-is, the judge would score round
  6's dashboard and every round 7 improvement (ridge, odds, accounting, WF-first KPI)
  would be invisible. The dossier text is round 7 source (truncated), but the images
  — what the judge scores — are round 6. This is the blocking fix (#1).

---

## 6. Bugs, inconsistencies, and numbers that do not reconcile

1. **[CRITICAL] Stale dossier images** — `out/dossier.json` and `out2/dossier.json`
   embed round 6 screenshots (see §5). The build order is wrong: screenshots were
   retaken after the last `main.ts` run. Fix #1.
2. **RESULTS_round7.md coherence 0.879 is wrong** — correct value is 0.7775 (verified
   from `board.json` and `data.js`; see §2).
3. **RESULTS_round7.md's claim that kiencx lacks a Brier-validated odds model is
   false** — kiencx has one with better Brier than ours (see §2).
4. **`lib/model.ts` header comment carries stale/wrong numbers:** "The slope comes out
   at 0.516" — the shipped full-fit slope is **0.4550** (0.516 is the slope of the
   64-peer WF-train fit, not the shipped fit, and it coincidentally equals kiencx's
   slope — the comment asserts our slope matches kiencx's, which the shipped model
   does not); "50.5% within 3x on leave-one-out" — actual **51.6%**; "90th-percentile
   leave-one-out error is x21.2" — actual **×28.59**; band "typically ~130x" — actual
   board width 80% is **100.5×**. Comment-only (the dashboard itself states 0.455 and
   R² = 0.247 correctly), but the slope claim is misleading. The blind 1+MdAPE ×1.90
   and LOO median ×1.82 in the same comment ARE still correct (built values 1.8903 and
   1.8151).
5. **`MODEL.farmThreshold` comment is stale** (`lib/model.ts`, farmThreshold): "15 FARM
   (7.5%)" — the round 7 board has **5 FARM**.
6. **RESULTS_round7.md §5 flag 1 is inaccurate:** the Huber-vs-OLS half/half caveat is
   NOT "stated in the method/calibration tabs". The dashboard states the half/half
   number (×3.01) but never mentions OLS or that OLS beats Huber on half/half.
7. **`fitModel` hardcodes Huber** (`lib/model.ts:867` passes `true`; line 901 hardcodes
   `ridgeHuber: true`) while `ModelConstants` has no `ridgeHuber` field. Minor.
8. **Ship-rule text** (`dashboard/app.js:1012` vs `:994`) re-interprets the
   watchlist-total clause without formally re-basing it (see §3).
9. **Value-model two-test term table missing** (see §5).

What is NOT a bug (checked and cleared): the ridge implementation; the odds
specification and term table; all validation numbers; the accounting sum (758); the
board totals, verdict counts, ranks and order; all 5 FARM/P25 net-EV arithmetic; the
LOO 49/95 hit count; the playbook figures (MetalX $38.09 / +$61.74 / p25 −$7.87);
the "implied = value-if-launches × odds" identity on all 200 rows (to rounding);
the worked example (computed in-page); the "2 of 3 pre-fee P25-positive rows are
negative once costs are counted" legend (MetalX −$7.87, Katana −$7.58, Binaryx +$5.45).

---

## Verdict: SUBMIT WITH FIXES

**Top-5 probability: 20%. Top-10 probability: 55%.**

Round 7 is the strongest round yet on the deciding criterion, and the model work is
correct and honestly validated. But it does not beat kiencx, its FARM set is thin, and
— decisively for this verdict — the dossier as it stands would show the judge round 6.
Fix the dossier first; the rest are small, and the entry is submittable once they are
done. Do not submit the current `out/` or `out2/` as-is.

### Fixes required (numbered, with exact file and change)

1. **[BLOCKING] Rebuild the dossier with the round 7 screenshots.** Re-run `main.ts`
   (`node main.ts`, from the token-radar directory, as in RESULTS §4) to regenerate
   `out/` (and `out2/`) now that the round 7 screenshots are in `screenshots/`.
   Then re-verify byte-identical rebuilds (out vs out2) and confirm `dossier.json`'s
   4 images match `screenshots/` by md5 — in particular image 0 must be the round 7
   board (WF-first ×2.65, FARM 5, $346.5M watchlist), not the round 6 board
   (blind-first ×3.97, FARM 11, $599.8M; md5 `155bbcdb…`). Do NOT submit until this
   is confirmed.
2. **Re-base the ship rule in `dashboard/app.js`.** Amend the ship-rule text (~line
   1012) and the watchlist-total note (~line 994) to state explicitly that the
   watchlist-total clause is evaluated on the **value-if-launches** total ($727M) for
   an odds-weighted board, and that the odds-weighted total ($346.5M) sits outside the
   old $478M–$796M band by construction. Do not imply the old clause is satisfied by
   the odds-weighted total. Rebuild the dashboard and the dossier after the change
   (see fix #1).
3. **Fix the stale numbers in `lib/model.ts`.** Header comment: slope 0.516 → 0.4550;
   LOO within-3x 50.5% → 51.6%; p90 ×21.2 → ×28.59; band "~130x" → "~100x".
   `MODEL.farmThreshold` comment: "15 FARM (7.5%)" → "5 FARM". Comment-only, but the
   slope claim currently misstates the shipped model.
4. **Correct `round7/RESULTS_round7.md`.** Coherence 0.879 → **0.7775**. Retract the
   claim (in §2 and §5 flag 6) that kiencx lacks a Brier-validated odds model; state
   instead that kiencx has one with Brier 0.215 WF / 0.186 LOO, better than ours on
   both tests, and that our odds model matches the top tier's structure without beating
   it. Correct §5 flag 1: the Huber half/half caveat is NOT stated on the dashboard.
5. **Disclose the Huber-vs-OLS half/half result on the dashboard.** In the ridge
   section of the calibration tab (`dashboard/app.js`, ~line 1040, next to the
   "improves walk-forward from x3.43 to x2.65 (2025 cutoff) and x4.05 to x3.01
   (half/half)" sentence), add one or two sentences: OLS ridge beats Huber on the
   half/half walk-forward (×2.83 vs ×3.01 at λ = 4, at every λ = 1/4/16/64) and Huber
   is kept because it wins leave-one-out and the 2025-cutoff walk-forward. Rebuild the
   dashboard and the dossier after the change (see fix #1).
6. **Add the value-model two-test term table to the calibration tab**
   (`dashboard/app.js`, next to the odds term table ~line 1077). For each candidate
   value term (size curve, category ridge, family, 7-day growth, age, chain count,
   control), show its leave-one-out and walk-forward miss and its status (kept /
   tested, not kept / must not help), computed from the snapshot in `lib/model.ts`
   (the numbers exist in `benchmark/ridge-test.ts` and the research; they need to be
   computed in the model and rendered, not hardcoded). Rebuild the dashboard and the
   dossier after the change (see fix #1).
7. **[Recommended, not blocking] Show the board table in the dossier.** Replace
   `screenshots/4-anchors.png` with a screenshot of the ranked board table (rows with
   the TOKEN ODDS column and verdicts visible) and rebuild the dossier (fix #1). The
   anchors count (49/95 within-3x) is already stated in the KPI strip and the
   calibration text, so the loss is small; the gain is that the judge can actually see
   the board. `SCREENSHOT_MAX` is 4 (`main.ts:33`), so this is a swap, not an addition.
8. **[Recommended, not blocking] Re-run the blind pairwise test vs kiencx with the
   FIXED dossier images before submitting.** The previous blind test (kiencx won 2–0,
   margin 3, deciding criterion 1) used round 6 images and is not evidence for round 7.
   A re-run with the correct round 7 images is the only blind evidence for whether
   round 7 beats the #1 bar.
