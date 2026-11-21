# Audit — Round 7: ridge model + token odds ("Tidegauge")

**Auditor:** independent (Gemini perspective). **Date:** 2026-11-21.
**Entry:** Tidegauge, round 7, branch `round7-ridge`, commit `79395cd`.
**Benchmark:** kiencx (#1, "Launch Radar v4", judge 966,767); bar europa-nova (#10, 960,454).
**Method:** read `round7/RESULTS_round7.md`, `benchmark/how-to-beat-kiencx.md`,
`lib/model.ts` (2,455 lines), `dashboard/app.js` (1,403 lines), all four
screenshots, and the top-10 artifacts. Independently re-computed every
headline number from `out/data.js` and `out/board.json`, re-ran
`benchmark/ridge-test.ts` and `benchmark/ridge-sweep.ts` (node v24.22.1),
and hashed the dossier images against the screenshots. No files modified
except this report.

## Verdict

**SUBMIT WITH FIXES** — not as-is. One fix is a blocker (stale dossier
images: the artifact that would be submitted shows round 6's dashboard,
not round 7's). The model itself is sound and the validation is honest;
once the fixes below are made, the entry is submittable.

- **Top-5 probability: 15%**
- **Top-10 probability: 50%**

The entry does not beat kiencx overall (§4), but it closes most of the
gap and is genuinely borderline for the top 10. The probabilities are
deliberately not inflated: round 7 still trails both #1 and #10 on the
headline walk-forward number, which was the deciding criterion in the
blind test that motivated this round.

---

## 1. Model correctness

### 1a. Ridge regression — correctly implemented
`ridgeFit` (`lib/model.ts:758-834`): the normal equations add λ only to
the diagonal entries `j ≥ 2` (the category offsets); intercept and slope
are unpenalised. Categories with fewer than `minPeers` (3) peers are
excluded from the design and get offset 0 (`ridgeOffsetFor`, line
~910). Huber IRLS uses weights `min(1, δ/|r|)` in log10 units, δ=1.0,
20 iterations from the OLS start, convergence break at change < 1e-12.
`fitModel` (line 837) calls `ridgeFit(peers, model.ridgeLambda, true,
model.ridgeHuberDelta, model)` with λ=4. The shipped fit reads
sizeA=3.5936, sizeB=0.4550, R²=0.2467, residSd=0.8116, λ=4, Huber=true,
n=95 — all confirmed in `out/data.js`.

`impliedValue` (line 959) factors the ridge prediction through the
category's median TVL (`tvl × anchor.mult × sizeFactor`), which is
algebraically identical to the ridge prediction
10^(a + b·log10(tvl) + offset). Verified by construction and by the
reconciliation (all 200 implied values match an independent Python
reimplementation, per RESULTS §4 — and my own re-derivation above).

### 1b. Huber vs OLS — defensible choice, stretched justification
I re-ran `benchmark/ridge-test.ts` and `benchmark/ridge-sweep.ts`
independently. Results at λ=4 (confirmed, matching `out/data.js`
exactly):

| Split | Huber | OLS |
|---|---|---|
| LOO (n=95) | **×2.77 / 51.6% / ρ0.360** | ×2.98 / 50.5% / ρ0.333 |
| WF 2025-cutoff (n=31) | **×2.65 / 51.6% / ρ0.248** | ×2.79 / 51.6% / ρ0.244 |
| WF half/half (n=48) | ×3.01 / 47.9% / ρ0.302 | **×2.83 / 54.2% / ρ0.295** |

Huber loses half/half to OLS at **every** λ (1, 4, 16, 64 — sweep
re-run confirms: Huber 3.01/3.01/3.05/3.03 vs OLS 2.99/2.83/2.85/2.96).
λ=4 is the best λ for Huber on LOO and WF-cutoff.

**Assessment:** keep Huber. The judge-facing headline is the 2025-cutoff
walk-forward (the split comparable to kiencx's ×2.53 and europa-nova's
×2.45), and Huber wins it (×2.65 vs OLS ×2.79) as well as LOO. OLS
would be better only on the secondary half/half split. **But** the
"two-test rule" justification is stretched: the rule as defined in the
research is "a term is kept only if it lowers the miss in both tests
(LOO + walk-forward)". There are now two walk-forward splits and Huber
wins one and loses one, so Huber does not pass a strict "both WF splits"
test — it passes the rule as originally defined (LOO + 2025-cutoff WF).
The RESULTS file is open about the half/half loss (§5 flag 1), but see
Issue 4 below: the dashboard itself never states it. I do **not**
recommend switching to OLS.

### 1c. Token-odds logistic — correctly specified and validated
`fitOdds` (`lib/model.ts:1469-1610`): logistic regression on
rankable-type protocols with a listing date (n=532, base rate 0.4925),
features age in years and ln(TVL) centred at ln($100M), fitted by IRLS
(Newton-Raphson, 50 iterations, 1e-6 ridge on coefficients, intercept
unpenalised). The training-set bug from the build session (first using
`isRankable`, which excluded all y=1 examples) is fixed with the
`rankableType` check (category ≠ CEX and not versioned-name) — the
shipped training set contains both classes (base rate 0.4925, confirmed
in `out/data.js`).

Validation, confirmed in `out/data.js`:
- Brier LOO **0.2085** (base 0.2499), WF **0.2253** (base 0.3316).
- Called-right 67.9% LOO / 65.9% WF, wfTestN=276.
- Term table (from `out/data.js`): base 0.2499/0.3316; age
  0.2107/0.2268; age+size (kept) 0.2085/0.2253; +growth 0.2085/0.2259
  (does not lower WF — correctly rejected); +family 0.2000/0.2251;
  +chain 0.2094/0.2258; +control 0.2092/0.2253 (ties kept — placebo
  passes).

On family: the WF Brier improves by only 0.0002 (0.2253 → 0.2251),
which is a tie at the 3-decimal precision the dashboard reports, and
called-right WF *drops* (0.659 → 0.652). The rejection is justified;
`benchmark/odds-test.ts:189-195` states it as "WF ties". I withdraw
any concern here — the two-test rule is applied correctly for odds.

One specification note: the walk-forward split is by listing date while
the features (age, TVL) are measured at the snapshot date, and the
outcome is "records a token *by the snapshot date*". That is a
cross-sectional classification, not a true at-listing-time forecast.
Kiencx's odds model has the same structure, so this is not a
competitive disadvantage — but it is why the censoring caveat (§2
below) matters and must stay.

---

## 2. Validation honesty

Every headline number in RESULTS §2 was re-computed from `out/data.js`
and `out/board.json`. All match except two (Issues 2–3 below).

| Test | Round 6 | Round 7 (verified) |
|---|---|---|
| LOO median max-ratio | ×2.96 | **×2.7696** |
| LOO within-3x | 50.5% | **51.58%** |
| LOO Spearman | 0.340 | **0.360** |
| Blind 80/20 ×5 | ×3.97 | **×3.7786** |
| Blind within-3x | 42.1% | **45.26%** |
| WF 2025-cutoff | ×3.43 | **×2.6472** |
| WF 2025 within-3x | 41.9% | **51.61%** |
| WF half/half | ×4.05 | **×3.0063** |
| WF half/half within-3x | — | **47.92%** |
| Odds Brier LOO / WF | — | **0.2085 / 0.2253** |

Flat baselines on each split: LOO ×4.11, blind ×4.70, WF 2025 ×5.35,
WF half/half ×5.29 — all confirmed. Band calibration: blindCov80 0.811,
blindCov50 0.463, timeCov80 0.742, timeCov50 0.484, boardWidth80 100.5,
boardWidth50 9.6 — confirmed. LOO128: within-3x 43.75%, Spearman 0.412,
medianMax ×3.63 — confirmed. Bias −0.0345, p90 ×28.59, chainEth +0.060,
chainSol −0.611 — confirmed. Flat blind CI [−0.6315, +0.3930] crosses
zero — the dashboard states this correctly (the stale comment the
research flagged is fixed).

**No cherry-picking found.** The reported walk-forward number is the
2025-cutoff split (n=31), the same split europa-nova uses ("the 31
since"), and the half/half split (the worse one, ×3.01) is reported
alongside it in RESULTS and in the calibration tab — not hidden. The
KPI strip leads with the 2025-cutoff WF (×2.65), which is the split
comparable to the top tier's headlines; that is a presentation choice,
not cherry-picking, and the other splits are one click away.

**Odds censoring caveat — stated honestly.** `dashboard/app.js:1076`:
"the outcome is 'records a token *by the snapshot date*'. A protocol
that has not recorded one yet may still do so, so the odds are a lower
bound on the eventual probability, most of all for young protocols."
Present and prominent in the token-odds section. Good.

---

## 3. The board re-ranking

Verified from `out/board.json` (200 rows):

| | Round 6 | Round 7 (verified) |
|---|---|---|
| Watchlist total | $0.600B | **$346.5M** odds-weighted ($727.0M value-if-launches) |
| Board total | — | $693.1M |
| P25-POSITIVE | 5 | **3** |
| FARM (excl. P25-positive) | 6 | **2** |
| FARM total | 11 | **5** |
| THIN | 72 | **26** |
| SKIP | 117 | **169** |
| Playbooks | 7 | **5** |

Top 10 (all SKIP/THIN, values match RESULTS exactly): #1 Steakhouse
$35.6M (odds 0.58, VIL $61.1M, netEv −$37.96); #2 Veda $28.6M (0.60,
−$36.88); #3 Gauntlet $27.6M (0.56, −$29.14); #4 Upshift $18.8M;
#5 Lofty $15.4M (0.85, THIN); #6 Symbiotic $14.6M; #7 USDD $14.1M;
#8 Hive $13.6M; #9 OpenTrade $12.9M; #10 Plume Vaults $12.6M.
First FARM row is #18 (Wrapped). Ranks 1–200 in order, values never
rise — verified. Odds range 0.16–0.87, mean 0.39 — verified.

FARM rows (all five reconcile to the playbook data in `out/data.js`):
#18 Wrapped $47.81/1.67x; #42 WEMIX.FI $46.46/1.63x; #58 MetalX
$71.29/2.50x; #59 Katana $66.52/2.33x; #63 Binaryx $46.10/1.62x.
Fully-costed p25: Binaryx +$5.45 (the only P25-FULL row); MetalX
−$7.87 and Katana −$7.58 (negative fully costed, stated on the board);
Wrapped −$8.53, WEMIX.FI −$26.49. The P25-POSITIVE badge is defined on
board costs only and is labelled "(pre-fee)" on the KPI chip and the
legend — honest, and the playbooks show the fully-costed numbers.

### Is FARM 5 a problem?
It is the honest consequence of odds-weighting with an unchanged
verdict rule, not a tuning choice — and the build says so. But it is a
real presentation risk: kiencx has 14 FARM, europa-nova 12, nyx77 12;
ours has 5, and the first FARM row sits at #18. A judge skimming the
board may read it as "this radar finds almost nothing worth farming".
Mitigating facts: kiencx's own #1 row is MARGINAL (not FARM), so
top-rows-not-FARM is normal at the top tier; and our 5 playbooks are
deeper (fully costed with fee splits) than the top tier's per-row
plans. I do **not** recommend changing the verdict rule — that would be
tuning to the count. Flagged as a risk to weigh, not a required fix.

### Ship-rule watchlist-total flag
The standing ship rule requires the watchlist total within 25% of
$0.637B ($478M–$796M). The odds-weighted total ($346.5M) is outside;
the value-if-launches total ($727.0M) is inside. The dashboard states
this explicitly (`app.js:994`): "the value-if-launches watchlist total
is $727M, within 25% of the $0.637B reference the ship rule uses. The
odds weighting lowers the expected total by construction — the odds are
a validated model, not a board error." The rule was written for
value-if-launches boards; with odds-weighting the total is an expected
value and is lower by construction. **This needs an explicit re-basing
decision before submit** (use the VIL total for the ship-rule check, or
set a new expected-value reference). It is a decision, not a code bug —
but do not submit until it is recorded (Fix 5).

---

## 4. The gap to kiencx — honest assessment

Round 7 does **not** beat kiencx overall. It narrows the gap
decisively but does not reverse it.

| Metric | Kiencx (#1) | Round 7 | Us |
|---|---|---|---|
| WF 2025-cutoff miss | ×2.53 | ×2.65 | behind 0.12 |
| WF within-3x | 55% | 51.6% | behind 3.4pp |
| LOO miss | ×3.33 | ×2.77 | **ahead 0.56** |
| LOO within-3x | 45% | 51.6% | **ahead 6.6pp** |
| Odds Brier LOO / WF | 0.186 / 0.215 | 0.208 / 0.225 | behind both |
| FARM count | 14 | 5 | behind (different rules) |
| 758 accounting | yes | yes | parity |
| Range honesty | within-×3 45%/55%; P25–P75 49%/57% | LOO within-3x 51.6%; band cov 81%/46% blind | mixed |

Against europa-nova (#10, the bar): WF 2.65 vs 2.45 (behind), odds
Brier 0.225 vs 0.200 (behind), LOO 2.77 vs 3.96 (ahead by a lot),
LOO within-3x 51.6% vs europa-nova's LOO within-3x (not stated on its
artifact; its range-holds figure is 58% in P25–P75).

The blind test that motivated round 7 was decided on criterion 1
(model accuracy), by the walk-forward gap (then 0.90). That gap is now
0.12. A re-run of the blind test would be genuinely close rather than
a 2–0 loss — but on the headline metric kiencx still leads, and on
odds Brier kiencx also leads. Round 7's case to the judge rests on:
the LOO lead, the closed WF gap, the accounting/integrity presentation,
and the deeper farm layer. That is a credible top-10 case, not a
top-5 case.

**Correction to RESULTS §2 and §5 flag 6 (Issue 2):** the claim that
"the odds model is a structural capability kiencx does not have (it
reports a token-probability column but no Brier-validated odds
weighting)" is **false**. Kiencx has a Brier-validated odds model —
logistic (age, family ridge, size, growth), Brier 0.186 LOO / 0.215 WF
(base 0.248/0.320), a full term table, a TOKEN ODDS column, and implied
= value-if-launches × odds. Our odds model (0.208/0.225) is *worse*
than kiencx's on both tests. The honest statement is: round 7 closes
the structural gap (round 6 had no odds model at all), but kiencx's
odds model remains better on Brier. Do not carry the false claim into
any submission material.

---

## 5. Presentation

Checked at 1024px (the four screenshots plus the inspection shots):

- **KPI strip leads with walk-forward** (×2.65 vs ×5.35 flat; WF
  within-3x 51.6% (n=31); LOO ×2.77; LOO within-3x 51.6%; blind
  ×3.78; odds Brier 0.208/0.225 vs 0.250/0.332 base; 200 protocols ·
  40/40 watchlist; FARM 5 incl. 3 Board P25-positive (pre-fee)). All
  numbers match the built data. Legible, no garbling.
- **758-protocol accounting bar + integrity strip:** present and
  correct (9 groups summing to 758; "200 of 200 implied values
  recomputed here and matched the board's data · ranks 1–200 in order,
  values never rise: yes · accounting totals equal: 758 of 758 ·
  watchlist 40 of 40 ranked · ledger 758 of 758 protocols"). Matches
  `computeAccounting` and the built data exactly.
- **Two-test term table (odds):** present in the calibration tab with
  the rule stated ("A term is kept only when it lowers the Brier score
  in both tests"). The value-model two-test discipline is described in
  the ridge section but there is no per-term LOO+WF table for the value
  model (only the LOO variant table). Minor gap — the odds table is
  there, the value table is not.
- **Worked example:** present on the board tab (row 1, Steakhouse
  Financial, through TVL × multiple × size factor × growth × maturity
  → value-if-launches, then × odds → implied value). Computed in-page.
- **TOKEN ODDS column:** present on the board table (sortable), with a
  tooltip explaining the model. The board footnote states the implied
  value is the expected value (value-if-launches × odds).
- **Legibility:** clean at 1024px. The bubble map, the playbook cost
  table, and the anchors table (49 of 95 within 3x — verified) all read
  clearly. No garbled text found.

One presentational tension, disclosed but worth noting: the
P25-POSITIVE badge is defined on board costs, so MetalX and Katana
carry the badge while their fully-costed p25 is negative (−$7.87,
−$7.58). The "(pre-fee)" qualifier and the footer ("2 of 3 pre-fee
P25-positive rows are negative once costs are counted") handle this
honestly. A judge that only reads the badge could misread it — but the
disclosure is on the same screen, so this is acceptable.

---

## 6. Bugs, inconsistencies, and reconciliation

### Issue 1 — BLOCKER: `out/dossier.json` embeds round-6 screenshots
The dossier is the artifact the judge reads. Its four images are
byte-identical to the **round-6** screenshots, not round 7's:

| Dossier image | SHA (prefix) | Matches |
|---|---|---|
| 0 (board) | `3db5cd5548df` | round-6 `1-board.png` (blind ×3.97, FARM 11, no odds column) |
| 1 (detail) | `3c9273240791` | round-6 `2-detail.png` (BounceBit playbook, not MetalX) |
| 2 (calibration) | `5cabf015ab6b` | round-6 `3-calibration.png` (122,049 B) |
| 3 (anchors) | `ddc148daa34b` | round-6 `4-anchors.png` (120,507 B) |

Round-7 screenshots are 127,800 / 169,855 / 151,572 / 131,306 bytes.
Timeline: `out/` built 14:09:34–35; round-7 screenshots written
14:12:56–57. `main.ts:87` copies `screenshots/` → `out/screenshots/`
at build time and `buildDossier` embeds them — so the build ran before
the new screenshots existed, and was never re-run. The "byte-identical
rebuilds ×2" check (out/ vs out2/) passed only because both were built
from the same stale screenshots. **If this dossier were submitted, the
judge would see round 6's dashboard while the data is round 7's** —
the walk-forward-first KPI, the TOKEN ODDS column, and the accounting
bar would all be invisible to the judge. Fix 1 is mandatory.

### Issue 2 — RESULTS §2 and §5 flag 6: false claim about kiencx's odds model
See §4. Kiencx has a Brier-validated odds model (0.186 LOO / 0.215 WF)
that is better than ours (0.208 / 0.225). The claim that it "does not
have" one is false and must be corrected before anything derived from
RESULTS is shown or submitted.

### Issue 3 — RESULTS §2: coherence 0.879 is wrong
RESULTS §2 lists "coherence 0.879". The shipped `out/data.js`
`validation.coherence` is **0.7775** (odds-weighted board). 0.879 is
the value-if-launches coherence (independently computed:
Spearman(TVL, VIL) = 0.8795 over the 40 watchlist rows). Correct
RESULTS to 0.778 and label it as the odds-weighted board's coherence
(or state both). Minor, but the record must match the shipped data.

### Issue 4 — Dashboard never states the Huber-vs-OLS half/half loss
RESULTS §1a and §5 flag 1 say the Huber half/half loss (×3.01 vs
×2.83 OLS) is "stated in the method/calibration tabs". It is not:
there is no "OLS", no "2.83", and no `wfHalf` field rendered anywhere
in `dashboard/app.js`. The dashboard states the ridge's half/half
*improvement over round 6* (×4.05 → ×3.01) but never that OLS ridge
would give ×2.83 on that split. A dashboard reader would conclude
×3.01 is the best available half/half number. One-sentence fix in the
method/calibration tab (see Fix 4).

### Issue 5 — Ship-rule re-basing (decision, not a bug)
See §3. The watchlist-total clause of the standing ship rule was
written for value-if-launches boards. Record the re-basing decision
before submit (Fix 5).

### Issue 6 — Minor: LOO table "size curve only" label
The LOO table's "size curve only" row uses the ridge fit's a/b without
offsets, not a separately fitted size-only model. The numbers are
nearly identical to a true size-only fit (×3.1657 vs ×3.15 in the
research), so it is immaterial — but the label is technically "ridge
size curve, no offsets". Optional relabel.

### Not issues (checked and cleared)
- The `fitOdds` training-set bug from the build session is fixed; the
  shipped training set has both classes (base rate 0.4925).
- The family-term rejection is justified (WF Brier ties at 3dp,
  called-right WF drops).
- The "size curve only" LOO numbers, the Risk Curators claim (12
  watchlist rows, 1 live peer Api3, priced at the global 0.204x
  anchor), the "49 of 95 within 3x" anchors count, and every playbook
  figure all reconcile to the built data.
- No cherry-picking in the reported splits (both WF splits reported).
- The stale comment about the blind CI is fixed in the code.

---

## Fixes required (numbered, exact)

1. **[BLOCKER — rebuild the dossier.]** Re-run the build (`main.ts`,
   `MAKEFUN_OUTPUT_DIR=out`, same command as RESULTS §4) now that the
   round-7 screenshots are in `screenshots/`, so `out/screenshots/`
   and `out/dossier.json` pick up the round-7 images. Then re-run the
   byte-identical rebuild check (out/ vs out2/) **and** confirm the
   dossier image hashes match `screenshots/1-board.png`,
   `2-detail.png`, `3-calibration.png`, `4-anchors.png` (127,800 /
   169,855 / 151,572 / 131,306 bytes). Do not bundle or submit until
   the dossier images are round 7's. (File: `out/dossier.json`,
   regenerated by the build; no hand-edit.)
2. **[RESULTS correction.]** In `round7/RESULTS_round7.md` §2 ("vs
   kiencx") and §5 flag 6, delete the claim that kiencx "does not
   have" a Brier-validated odds model. Replace with: "Kiencx has a
   Brier-validated odds model (0.186 LOO / 0.215 WF); ours (0.208 /
   0.225) is worse on both tests. Round 7 closes the structural gap
   (round 6 had no odds model) but does not beat kiencx on odds."
3. **[RESULTS correction.]** In `round7/RESULTS_round7.md` §2, change
   "coherence 0.879" to "coherence 0.778" (the odds-weighted board's
   value from `out/data.js`; the value-if-launches coherence is
   0.880).
4. **[Dashboard disclosure.]** In `dashboard/app.js`, in the
   "Model & calibration" tab's ridge section (near the existing
   "The ridge replaces the round-6 two-stage shrunk-median category
   term" paragraph, ~line 1040), add one sentence: "Huber weighting
   wins leave-one-out (×2.77 vs ×2.98 OLS) and the 2025-cutoff
   walk-forward (×2.65 vs ×2.79) but loses the half/half
   walk-forward (×3.01 vs ×2.83 OLS) at every λ; it is kept for the
   headline splits." Then rebuild and re-verify.
5. **[Decision, parent/user.]** Record the ship-rule re-basing for
   odds-weighted boards: confirm the watchlist-total check uses the
   value-if-launches total ($727M, inside the $478M–$796M band) — or
   set a new expected-value reference. Do not submit until this is
   recorded. (No code change unless the decision is to change the
   rule's reference.)
6. **[Optional.]** In `lib/model.ts` `validateModel`, relabel the LOO
   table's "size curve only" row as "ridge size curve, no offsets"
   (or add a footnote that it uses the ridge fit's a/b). Cosmetic only.

After fixes 1–5, re-run the harness (`r7_verify.mjs`) and the
byte-identical rebuild check, then the entry may be submitted. A blind
pairwise re-test against kiencx (and against europa-nova, the #10 bar)
is recommended before spending the slot, since the WF gap is now
0.12 and the outcome is no longer predictable from the numbers alone.

---

## Calibration note

Round-6 auditors predicted 954–960k for a weaker entry (WF ×3.43, no
odds model, no accounting bar). Round 7 is materially better on the
deciding criterion and closes two structural gaps, but still trails
#1 and #10 on the headline walk-forward number. My 50% top-10 / 15%
top-5 estimates reflect that: the entry is now competitive with the
top tier rather than clearly below it, but it does not demonstrably
beat the #10 bar (960,454) on the numbers the judge weighs first.
