# Audit — Round 8: winsorized ridge + dropped maturity/growth ("Tidegauge")

**Auditor:** independent (Gemini perspective). **Date:** 2026-11-21.
**Entry:** Tidegauge, round 8, branch `round8-winsor`, commit `c29206a` (from round 7 `79395cd`).
**Benchmark:** kiencx (#1, "Launch Radar v4", judge 966,767); bar europa-nova (#10, 960,454).
**Method:** read `round8/RESULTS_round8.md`, `benchmark/path-to-number-one.md`,
`benchmark/how-to-beat-kiencx.md`, `lib/model.ts`, `dashboard/app.js`, all four
screenshots, and the round-7 audits (Gemini/DeepSeek/GLM). Independently re-computed
every headline number from `out/data.js` and `out/board.json` (Python + node),
re-ran `benchmark/value-terms-r8.ts` (node v24.22.1), re-ran the harness
`~/workspace/makefun/shot-tool/r8_verify.mjs` myself into a temp shot dir (**68/68**),
hashed the dossier images against the screenshots, and ran a headless check of the
board tab's DOM table order. No files modified except this report.

## Verdict

**SUBMIT WITH FIXES** — not as-is. One fix is required and it is small: the 4th
dossier image is mislabeled — it shows the accounting table, not the ranked board
table, so the round-7 finding that the judge cannot see the board is **not** fixed
despite RESULTS claiming it is (see Issue 1). Everything else the round-7 audits
asked for is genuinely done, the model is correct, and the validation is honest.
Once the board-table shot is retaken and the dossier rebuilt, the entry is
submittable — and it is the first round that beats kiencx on the deciding metric.

- **Top-5 probability: 35%**
- **Top-10 probability: 80%**

Round 8 reverses the headline walk-forward gap (×2.19 vs kiencx ×2.53) and the LOO
gap (×2.74 vs ×3.33). The blind test that motivated this work was decided on
criterion 1 (model accuracy) by a 0.12 walk-forward margin; we now lead that
criterion by 0.34. The remaining risk is the board's thinness (FARM 8 vs 14, top
$37M vs ~$69M, board $0.84B vs $1.52B) and the still-behind odds Brier — whether
the judge weights accuracy over farm richness is unknowable locally, which is why
the probabilities are not higher. The #1 probability is ~25%.

---

## 1. Model correctness

### 1a. Winsorized ridge — correctly implemented
`ridgeFit` (`lib/model.ts`, winsor bounds on the fit): log10(mcap) is clipped to
the train set's 5th/95th percentiles using the index rule
(`sorted[Math.floor(q * (n - 1))]`, per the research) before the ridge solve.
Shipped fit (`out/data.js`): sizeA=3.9013, sizeB=0.4137, R²=0.2448,
residSd=0.8126, λ=4, Huber=true, winsor bounds [5.4578, 8.5026] in log10
(=$287K–$318M) — all confirmed in the built data, and reproduced exactly by
re-running `benchmark/value-terms-r8.ts` ("shipped fit: sizeA=3.9013 sizeB=0.4137
R²=0.2448 residSd=0.8126 ridgeHuber=true winsorY=[5.458, 8.503]").
`fitModel` (line 982) now passes `model.ridgeHuber` instead of hardcoding `true`,
and `validateModel` (line 2282) does the same — the dead-flag bug from round 7
is fixed. The header comment (lines 1–70) now carries the right numbers: slope
0.414 (shipped 0.4137), WF ×2.19/×2.59, LOO ×2.74/50.5%, Steakhouse size factor
0.075x / multiple 0.014x (board.json: 0.0753 / 0.0136), dateless peers worsen WF
×2.19→×2.80. The round-7 GLM stale-comment findings are fixed, with one
exception (Issue 3, comment-only).

### 1b. Huber vs OLS — the research report's claim was wrong, and the build corrected it honestly
I re-ran `benchmark/value-terms-r8.ts` (lib code path, winsorized fit, λ=4):

| Split | Huber (shipped) | OLS |
|---|---|---|
| LOO (n=95) | **×2.74 / 50.5% / ρ0.345** | ×2.76 / 51.6% / ρ0.336 |
| WF 2025-cutoff (n=31) | **×2.19 / 51.6%** | ×2.28 / 51.6% |
| WF half/half (n=48) | **×2.59 / 54.2%** | ×2.61 / 54.2% |
| Blind 80/20×5 | ×3.73 / 45.3% / ρ0.448 | **×3.48 / 47.4% / ρ0.446** |

Huber wins LOO and both walk-forward splits, but **loses the blind test to OLS**
(×3.73 vs ×3.48, and on within-3x 45.3% vs 47.4%; Huber wins blind Spearman by
a hair, 0.448 vs 0.446). The path-to-#1 report §4 claimed "Huber wins or ties
on all four splits" — that is wrong on the winsorized fit, and the build says
so plainly in RESULTS ("Correction to the path-to-#1 research report §4") and
on the dashboard (calibration tab, line 1042): "Huber weighting wins
leave-one-out (×2.74 vs ×2.76 OLS) and both walk-forward splits (×2.19 vs
×2.28; ×2.59 vs ×2.61) but loses the blind test (×3.73 vs ×3.48 OLS); it is
kept for the headline splits (leave-one-out + 2025-cutoff walk-forward).
Without winsorization, Huber lost the half/half split to OLS (×3.01 vs ×2.83
in round 7) — the winsorization is what fixed that split." I verified this
sentence renders in the shipped 3-calibration.png. **Keeping Huber is the
right call**: the judge-facing headline is the 2025-cutoff walk-forward and
LOO, both of which Huber wins; the blind split is our own internal validation,
and the loss is disclosed rather than hidden. The round-7 half/half loss is
genuinely fixed by the winsorization (Huber now wins half/half too).

Note the two-test rule as defined (LOO + 2025-cutoff WF) passes for Huber. Across
all four splits Huber wins 3, loses 1 (blind). That is a real caveat and it is
now disclosed — the round-7 Issue 4 (undisclosed loss) is fixed.

### 1c. Maturity and growth dropped — measured, and the board proves it
`MODEL`: `growthWeight: 0`, `maturityFloor: 1, maturityRange: 0`. Verified in
the built board: Steakhouse `growth_multiplier: 1`, `maturity_multiplier: 1`
(`out/board.json` row 1, `model` field). The header comment's justification
matches the research measurements (maturity worsens WF-cutoff ×2.65→×3.05;
growth neutral; dropping both raises FARM 6→8 with the winsor fit). The
`farmThreshold` comment's claim ("the net-EV ratio caps FARM at 8 rows however
low the threshold goes") is verified: exactly 8 rows have netEvRatio ≥ 1.5,
and exactly those 8 have netEv ≥ $40 — so $40 takes every row that passes the
ratio test. Correct.

### 1d. Token-odds logistic — unchanged, correctly specified
Odds model is the round-7 age+size logistic, unchanged: intercept −1.2486, age
+0.6947, size +0.1657, train n=532, base rate 0.4925 — confirmed in
`out/data.js`. Brier LOO **0.20846** / WF **0.22533** (base 0.24994 / 0.33160),
called-right 68% / 66%, wfTestN 276. The term table is unchanged and correct
(family: LOO 0.20002 / WF 0.22509 — technically lowers WF Brier by 0.00024,
treated as a tie, called-right WF drops 0.659→0.652; the rejection stands).
No family term was added; the two-test rule was applied consistently.

---

## 2. Validation honesty

Every headline number in RESULTS §2 was re-computed from `out/data.js` and
`out/board.json`. **All match.**

| Metric | RESULTS claim | Built data (verified) |
|---|---|---|
| LOO median max-ratio / within-3x / Spearman | ×2.74 / 50.5% / 0.345 | 2.7406 / 50.5263% / 0.3453 |
| LOO P90 max-ratio / bias | ×29.14 / — | 29.1351 / −0.0521 |
| Blind 80/20×5 median / within-3x / Spearman | ×3.73 / 45.3% / 0.448 | 3.7334 / 45.2632% / 0.4481 |
| WF 2025-cutoff median / within-3x / Spearman (n=31) | ×2.19 / 51.6% / 0.259 | 2.1949 / 51.6129% / 0.2593 |
| WF half/half median / within-3x / Spearman (n=48) | ×2.59 / 54.2% / 0.313 | 2.5858 / 54.1667% / 0.3127 |
| Flat baselines LOO / blind / WF-cutoff / WF-half | ×5.00 / ×4.70 / ×5.35 / ×5.29 | 4.9967 / 4.6963 / 5.3519 / 5.2937 |
| Odds Brier LOO / WF (base) | 0.208 / 0.225 (0.250 / 0.332) | 0.20846 / 0.22533 (0.24994 / 0.33160) |
| Coherence | 0.8152 | 0.8152 |
| Band coverage blind 80% / 50%, time 80% / 50% | 81.1% / — / — / — | 0.8105 / 0.4632 / 0.7419 / 0.5161 |
| Board width 80% / 50% | 106.8x / — | 106.77 / 9.60 |
| LOO128 median / within-3x / Spearman | ×3.64 / 44.5% / — | 3.642 / 44.53% / 0.4081 |
| Blind paired 95% CI (flat) | crosses zero | [−0.6651, +0.4528] |

Value-model two-test term table (`out/data.js` `validation.valueTermTable`,
reproduced exactly by re-running `value-terms-r8.ts`): size-only 3.1824/2.7672;
adopted ridge 2.7406/2.1949 (kept); +family 2.7406/2.1949 (identical —
verified independently: the 95 fit peers have **95 distinct name stems, zero
repeats**, so no family columns exist; the dashboard states this explicitly);
+growth 2.9594/2.4355; +age 3.094/3.6383; +chain 3.0454/2.2273; +control
2.7143/3.2538 (must not help — LOO edge is noise, WF much worse). The table
is computed in `lib/model.ts` `valueTermTable` (line 2227) with a full refit
per variant per fold — not hardcoded, and the "size curve only" row is a
genuine refit (3.1824), distinct from the LOO table's "ridge a/b, no offsets"
row (3.2781). The round-7 GLM label concern is resolved by the refit.

**No cherry-picking found.** Both WF splits are reported (the worse half/half
is now also a Huber win), the blind loss to OLS is disclosed on the dashboard,
and the blind CI crosses zero (stated). The KPI strip leads with walk-forward
(×2.19 vs ×5.35 flat), which is the split comparable to the top tier.

**Ship-rule re-basing — stated honestly, numbers check out.** VIL watchlist
total $877,783,442 (verified from `board.json`); $877.8M/$637M − 1 = **+37.8%**,
outside the old $478M–$796M band, exactly as RESULTS and the dashboard state.
Re-based band $0.66B–$1.10B = $877.8M × 0.75/1.25 (verified arithmetic). The
dashboard (method tab, lines 996/1014) states the re-basing, the reason (the
maturity discount is gone), and that the odds-weighted total sits below the
old band by construction. The board-tab legend shows the VIL total ($877.8M)
alongside the odds-weighted total ($402.0M) — confirmed in 1-board.png.

---

## 3. The board re-ranking

Verified from `out/board.json` (200 rows):

| | Round 7 | Round 8 (verified) |
|---|---|---|
| Watchlist total | $346.5M ($727M VIL) | **$401,987,452** ($877,783,442 VIL) |
| Board total | $693.1M | **$839,799,754** |
| P25-POSITIVE | 3 | **2** |
| FARM (excl. P25-positive) | 2 | **6** |
| FARM total | 5 | **8** |
| THIN / SKIP | 26 / 169 | **36 / 156** |
| Playbooks | 5 | **5** |

Top 10 (all SKIP except #7 Lofty THIN, values match RESULTS exactly):
#1 Steakhouse $37,331,332 (odds 0.5827, VIL $64,070,937, netEv −$37.83);
#2 Veda $30,459,812 (0.6009); #3 Gauntlet $28,496,840 (0.5601);
#4 Upshift $18,681,043 (0.591); #5 Symbiotic $15,381,335 (0.6436).
Ranks 1–200 in order, values never rise — verified.

FARM rows (all 8, NetEV/board NetEV reconcile): #21 Wrapped $57.51/2.01x
(P25-POSITIVE); #44 Steer $43.76/1.53x; #55 WEMIX.FI $53.00/1.86x;
#60 FstSwap $44.89/1.57x; #68 Katana $76.61/2.68x (P25-POSITIVE);
#74 Binaryx $53.74/1.88x; #75 MetalX $74.13/2.60x; #92 SyncSwap $53.81/1.62x.

Playbooks (5): fee splits sum exactly to extraTotal in every case
(Katana 3.75+3.75+2+0.05+0 = 9.55; Binaryx 2+0.05+0 = 2.05);
netEvFull = netEvBoard − extraTotal (Katana 76.61−9.55 = **$67.06**;
Binaryx 53.74−2.05 = **$51.69**; MetalX 74.13−9.55 = $64.58;
Wrapped 57.51−4.10 = $53.41; SyncSwap 53.81−12.10 = $41.71);
netEvP25Full = netEvP25Board − extraTotal (Katana 8.23−9.55 = **−$1.32**;
Binaryx −3.41−2.05 = **−$5.46**; Wrapped 1.15−4.10 = −$2.95;
MetalX −0.73−9.55 = −$10.28; SyncSwap −3.96−12.10 = −$16.06).
**P25-FULL: 0** — every playbook row goes negative fully costed at p25.
The legend states "2 of 2 pre-fee P25-positive rows are negative once costs
are counted" — confirmed in 1-board.png and computed in-page
(`p25FullyCostedNegative`, `app.js:85`).

**P25-FULL 0 is a small regression vs round 7** (which had 1, Binaryx +$5.45;
round-8 Binaryx is −$5.46). It is the honest consequence of the winsorized
fit's flatter slope (0.414 vs 0.455) pricing the top lower, not a bug — but
the farm layer is now slightly thinner at the p25 level even as the FARM
count rose 5→8. The entry is upfront about it ("The floor is thin" panel,
`app.js:684`).

**Playbook-rule wording (Issue 2, minor).** RESULTS says the 5 playbooks are
"every P25-POSITIVE row + top-5 FARM by NetEV, deduped". The code
(`lib/model.ts:1494-1506`) selects the **top 5 by NetEV among rows with
verdict FARM or P25-POSITIVE**, sorted by netEv desc, sliced to 5 — which
yields exactly Katana, MetalX, Wrapped, SyncSwap, Binaryx. Under the RESULTS
wording there would be 7 playbooks (2 P25 + 5 FARM). The shipped 5 are the
sensible rule and match the code comment at line 1494; the RESULTS sentence
(and the type comment at `lib/model.ts:322`) misdescribe it. Wording fix
only — the board itself is correct.

### Is FARM 8 a problem?
Less than round 7's 5, but still a visible gap: kiencx 14, europa-nova 12.
The top 10 rows are still all SKIP/THIN with negative NetEV (−$37.83 for
Steakhouse), and the odds gap (Steakhouse 0.58 vs kiencx 0.85) is unchanged
and structural. The FARM count rose because maturity/growth were dropped,
not because the odds improved. A judge comparing boards side by side will
still see a thinner farm layer. I do **not** recommend loosening the verdict
rule — that would be tuning to the count. Flagged as the main competitive
risk, not a required fix.

---

## 4. The gap to kiencx — round 8 reverses the deciding criterion

| Metric | Kiencx (#1) | Round 8 | Us |
|---|---|---|---|
| WF 2025-cutoff miss | ×2.53 | **×2.19** | ahead 0.34 |
| WF within-3x | 55% | 51.6% | behind 3.4pp |
| LOO miss | ×3.33 | **×2.74** | ahead 0.59 |
| LOO within-3x | 45% | 50.5% | ahead 5.5pp |
| Blind median miss | (not reported) | ×3.73 (OLS ×3.48) | — |
| Odds Brier LOO / WF | **0.186 / 0.215** | 0.208 / 0.225 | behind both |
| FARM count | 14 | 8 | behind |
| Top value / board total | ~$69M / $1.52B | $37.3M / $0.84B | behind |
| 758 accounting + integrity strip | Yes | Yes | parity |
| Value-model two-test term table | Yes | Yes (now) | parity |
| Worked example | No (formula in one line) | Yes (row 1, computed in-page) | ours |
| Board table visible in dossier images | Yes | **No (Issue 1)** | kiencx |

Against europa-nova (#10, the bar): we now beat them on WF (×2.19 vs ×2.45)
and LOO (×2.74 vs ×3.96), but trail on odds Brier WF (0.225 vs 0.200) and
FARM (8 vs 12). Round 8 is above the #10 bar on the deciding criterion and
is a genuine top-5 contender — but it does not beat kiencx overall: the
accuracy lead is real, the farm/odds/board-total gaps are also real, and the
outcome turns on which the judge weighs more. The blind pairwise re-test
against kiencx (with the fixed dossier) is the only way to resolve that,
and it must use the corrected 4th image.

**Correction to RESULTS §2 and the "Corrections to round-7 RESULTS" section —
verified done.** Kiencx's odds model is now correctly described as existing
and better than ours (Brier 0.186/0.215 vs 0.208/0.225); coherence is stated
as 0.8152 for round 8 and 0.778 for round 7 (verified: `data.js`
`validation.coherence` = 0.8152; round-7 shipped value was 0.7775). The
0.879 figure is gone from RESULTS. The false claims from round 7 are fully
retracted.

---

## 5. Presentation

Viewed all four screenshots at 1024px; all legible, no garbling:

- **1-board.png:** KPI strip leads with walk-forward (×2.19 vs ×5.35 flat;
  WF within-3x 51.6% (n=31); LOO ×2.74; blind ×3.73; odds Brier 0.208/0.225;
  FARM 8 incl. 2 Board P25-positive (pre-fee)). Legend shows the watchlist
  total $402.0M **and** the value-if-launches total $877.8M, plus the "2 of
  2 … negative once costs are counted" disclosure. Bubble map clean.
- **2-detail.png:** Katana DEX playbook modal — fully costed $38.09, Net EV
  board +$76.61 / fully costed +$67.06, p25 +$8.23 / −$1.32. Matches the
  built data exactly. Clean.
- **3-calibration.png:** "Model & calibration" tab — ridge section states
  the winsor bounds [5.46, 8.50], the Huber-vs-OLS blind loss, and the
  round-7 half/half loss fixed by winsorization. The value-model term table
  renders below (harness-confirmed, see §6).
- **4-board-table.png — see Issue 1.** It is not a board-table shot.

**758-protocol accounting bar + integrity strip:** present and correct
(9 groups summing to 758 — verified arithmetic 40+160+95+33+288+42+11+63+26;
"200 of 200 implied values recomputed here and matched the board's data ·
ranks 1–200 in order, values never rise: yes · accounting totals equal: 758
of 758 · watchlist 40 of 40 ranked · ledger 758 of 758 protocols"). The
accounting table itself is visible in 4-board-table.png — which is the
problem: it is there *instead of* the ranked table, not *in addition to* it.

**Worked example:** present on the board tab (row 1, Steakhouse Financial,
`app.js:795`), computed in-page, including the odds step (`app.js:803`:
"Token odds (P records a token) … 0.58 … $37,331,332" — matches the built
row). The anchors tab shows "48 of 95" within-3x out-of-fold (verified
independently from `data.js` peers: 48 of 95).

---

## 6. Bugs, inconsistencies, and reconciliation

### Issue 1 — REQUIRED: the 4th dossier image is the accounting table, not the ranked board table
`~/workspace/makefun/shot-tool/r8_verify.mjs` takes the 4th shot with
`document.querySelector('table')` followed by `scrollIntoView`. On the board
tab the tables in DOM order are (verified headless against the shipped `out/`):

| DOM index | Table | Rows | Page top |
|---|---|---|---|
| 0 | Accounting ("Group / Protocols / Why they are there") | 10 | 1035px |
| 1 | Worked example ("Step / Factor / Running value") | 7 | 2283px |
| 2 | Playbooks ("Farm / Entry / Board cost …") | 5 | 3257px |
| 3 | **Ranked board** ("Rank / Protocol / TVL / 7d / Age / Implied value / **Token odds** / … / Verdict") | 200 | 4569px |

`querySelector('table')` returns table 0 (accounting). The shipped
`4-board-table.png` shows the accounting table, the integrity strip, and the
yardstick scatter — **not one ranked board row**. I viewed the image: no
TOKEN ODDS column, no verdicts, no ranked rows are visible. The ranked table
is the *last* table in DOM order and appears in **none** of the four dossier
images.

RESULTS §5(b) claims the 4th image is "a board-table shot … the judge can
now see the ranked board table, the TOKEN ODDS column and the verdicts."
That claim is **false**. The round-7 GLM audit's fix #7 (show the board
table in the dossier) is **not implemented** — the attempt used the wrong
selector, and the filename (`4-board-table.png`) mislabels the content.

The dossier itself is fresh — `out/dossier.json` image hashes == `screenshots/`
hashes, 4/4 (fceefb8c…, ae3511c1…, 50d98a44…, 8aa3cddc…), verified
independently — so the round-7 blocker (stale round-6 images) is fixed. What
remains is *which* screenshot the 4th slot holds. The fix is one selector
change plus a rebuild; the harness needs an assertion that the scroll target
is the ranked table (it currently has none, which is how 68/68 passed with
the wrong image — see below).

### Issue 2 — Minor: RESULTS misdescribes the playbook rule
See §3. The rule is top-5 by NetEV among the 8 FARM/P25-POSITIVE rows
(`lib/model.ts:1494-1506`), not "every P25-POSITIVE row + top-5 FARM".
Fix the RESULTS sentence and the type comment at `lib/model.ts:322`
("for the P25-positive rows and the top-5 FARM rows").

### Issue 3 — Minor (comment-only): stale `topScalar` comment
`lib/model.ts` topScalar comment: "the watchlist total falls back to the
model's own ~$0.637B." In round 8 the totals are $402.0M odds-weighted /
$877.8M value-if-launches — neither is ~$0.637B (that was the round-6/7-era
reference). Same class as the round-7 GLM comment fix; update to the
round-8 numbers.

### Issue 4 — Minor (completeness): blind within-3x not in the OLS disclosure
The dashboard discloses the OLS blind *median* loss (×3.73 vs ×3.48) but not
that OLS also wins blind within-3x (47.4% vs 45.3%; verified by re-running
`value-terms-r8.ts`). One clause would complete it. The median disclosure is
already there, so this is optional.

### Not issues (checked and cleared)
- The dossier images are the round-8 screenshots (4/4 hashes) — the round-7
  blocker is fixed.
- Byte-identical rebuilds: `diff -r out out2` clean (verified).
- Harness: I re-ran `r8_verify.mjs` myself into a temp shot dir — **68/68
  passed**, including "calibration tab has value-model term table",
  "calibration tab discloses the Huber-vs-OLS blind loss", "calibration tab
  has the ridge-winsor settings row", "anchors tab shows 48 of 95". (But
  see the process note below: no harness check covers the 4th image's
  content.)
- Python reconciliation (`round8/reconcile_round8.py`): reported PASSED in
  RESULTS; I verified its inputs independently (ridge a/b, winsor bounds,
  odds coefficients, all 200 implied values/odds/ranks/verdicts, playbook
  arithmetic, accounting 758) rather than re-running it.
- The value term table's family row being identical to adopted is correct
  (95 distinct stems, verified).
- The `farmThreshold` ratio-cap comment is verified (exactly 8 rows pass
  the ratio test).
- The odds censoring caveat, the P25 redefinition disclosure, and the
  "2 of 2" legend are all present and honest.
- No cherry-picking in the reported splits.

### Process note — the harness gap that let Issue 1 through
`r8_verify.mjs` passes 68/68 while the 4th dossier image shows the wrong
table, because no check asserts what the 4th screenshot *contains*. The
script's comment says the shot is for "the judge must see the ranked board
table with the TOKEN ODDS column and verdicts" — but the selector
(`querySelector('table')`) never verifies it selected that table. Add a
check: the scroll target table must contain a `th` with text "Token odds"
and 200 body rows. Without it, a future rebuild can silently re-break the
shot.

---

## 7. Round-7 audit findings — status check

| Round-7 finding | Round-8 status |
|---|---|
| Gemini/DeepSeek/GLM #1 — dossier embeds round-6 screenshots (BLOCKER) | **FIXED.** Dossier hashes == round-8 screenshots 4/4, verified independently. |
| Gemini #2 / DeepSeek F1 / GLM #2 — RESULTS false claim: kiencx has no Brier-validated odds model | **FIXED.** Retracted; kiencx's better Brier (0.186/0.215) is now stated. |
| Gemini #3 / DeepSeek F1 / GLM #2 — coherence 0.879 wrong | **FIXED.** Round 8 states 0.8152 (verified); round 7 corrected to 0.778. |
| Gemini #4 / DeepSeek F2 / GLM #5 — Huber half/half loss undisclosed on dashboard | **FIXED** (and superseded). Dashboard discloses the blind loss to OLS (×3.73 vs ×3.48) and the round-7 half/half loss; half/half itself is now a Huber win. |
| Gemini #5 / DeepSeek §3 / GLM #2 — ship-rule re-basing not recorded | **FIXED.** Re-based reference $0.878B, band $0.66B–$1.10B, stated on the dashboard and in RESULTS with the reason and the arithmetic. |
| DeepSeek F3 / GLM #6 — value-model two-test term table missing | **FIXED.** Table computed in the model every run, rendered on the calibration tab, numbers reproduced independently. |
| DeepSeek F4 — VIL total only in method tab, not board legend | **FIXED.** Board legend shows $877.8M alongside $402.0M (confirmed in 1-board.png). |
| GLM #3 — stale numbers in `lib/model.ts` header comment | **FIXED** (slope 0.414, p90 ×29.1, band ~107x, Steakhouse 0.075x/0.014x, FARM cap 8), except the `topScalar` comment (Issue 3, minor). |
| GLM #4 — `fitModel` hardcodes Huber | **FIXED.** `fitModel` honours `model.ridgeHuber` (lines 982, 2282). |
| DeepSeek #5 / GLM §4 — maturity factor unvalidated (recommendation) | **DONE, beyond the recommendation.** Maturity (and growth) dropped from board values on measured evidence. |
| GLM #7 — show the board table in the dossier (recommended) | **NOT DONE — Issue 1.** The 4th image is the accounting table, not the ranked board table. |
| DeepSeek #6 — investigate the odds-level gap | **NOT DONE, and correctly so.** The path-to-#1 research tested every variant; the gap is structural and not closable by refitting (survival/hazard model is research-only, unmeasured). No action required for this round. |

---

## Fixes required (numbered, exact)

1. **[REQUIRED — retake the board-table shot.]** In
   `~/workspace/makefun/shot-tool/r8_verify.mjs`, replace the 4th-shot
   selector (`document.querySelector('table')`) with the ranked board table
   — the table containing a `th` with text "Token odds" (200 body rows).
   Scroll it into view, re-take `screenshots/4-board-table.png`, re-run
   `main.ts` to rebuild `out/` (and `out2/`), re-verify dossier image
   hashes == `screenshots/` hashes 4/4, and re-run the harness. Add a
   harness assertion that the scroll target is the ranked table (contains
   a "Token odds" `th`, 200 rows) so this cannot silently regress. Do not
   bundle or submit until the 4th dossier image shows ranked rows with
   the TOKEN ODDS column and verdicts.
2. **[RESULTS correction.]** In `round8/RESULTS_round8.md`, correct the
   playbook-rule sentence to: "5 playbooks: the top-5 FARM/P25-POSITIVE
   rows by NetEV" (code: `lib/model.ts:1494-1506`). Correct the type
   comment at `lib/model.ts:322` the same way.
3. **[Comment fix.]** In `lib/model.ts`, update the `topScalar` comment:
   replace "the watchlist total falls back to the model's own ~$0.637B"
   with the round-8 totals ($402.0M odds-weighted / $877.8M
   value-if-launches).
4. **[Optional.]** In `dashboard/app.js` line 1042, add that OLS also wins
   blind within-3x (47.4% vs 45.3%), not just the blind median.
5. **[Recommended, before submitting.]** Re-run the blind pairwise test vs
   kiencx (#1) and europa-nova (#10) with the **fixed** dossier (after fix
   1), with the full board visible. The previous blind evidence is from
   round 6 and does not apply to round 8.

After fix 1 (plus 2–3 in the same edit pass), re-run the harness and the
byte-identical rebuild check, then the entry may be submitted on the user's
go-ahead. Before any submit: verify the kit (ours level 18, site 33),
verify the transcript gate from the exact sessions, bundle with the current
kit, run kit check. Deadline 2026-12-14T10:00Z; quota open (5 day slots,
37 hard, pulled 2026-11-21).

---

## Calibration note

Round-7 auditors predicted 50–55% top-10 / 15–20% top-5 for an entry that
trailed kiencx on the headline walk-forward by 0.12. Round 8 leads that
headline by 0.34 and leads LOO by 0.59, with every round-7 disclosure gap
closed except the board-table image. That justifies the jump to 80% top-10
/ 35% top-5. The #1 probability (~25%) is capped by the parts of the entry
that did not move: odds Brier behind on both tests, FARM 8 vs 14, top value
$37M vs ~$69M, board $0.84B vs $1.52B, top 10 all SKIP/THIN, and P25-FULL
now 0. If the blind re-test shows the accuracy lead deciding the pairwise
the way the 0.12 margin decided round 6's loss, the top-5 number is
conservative; if the judge weighs farm richness first, it is optimistic.
The blind test (fix 5) is the only measurement that settles it.
