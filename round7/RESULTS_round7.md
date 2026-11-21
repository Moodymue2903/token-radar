# RESULTS — Round 7: ridge model + token odds ("Tidegauge")

**Branch:** `round7-ridge` (from round 6 commit `614e294`). **Date:** 2026-11-21.
**Goal:** beat kiencx (#1, judge 966,767) on model accuracy. This is a MODEL CHANGE round, not a presentation fix.
**Status:** built and verified. **Do NOT push. Do NOT bundle. Do NOT submit.** Build and verify only.

## 1. What changed

### 1a. Ridge regression replaces the two-stage category model
`lib/model.ts`: `fitModel` now fits a **joint ridge regression**
`log10(mcap) = a + b·log10(TVL) + offset[category]`, penalty λ=4 on the
category offsets only (intercept and slope unpenalised), categories with
<3 peers get offset 0. **Huber-weighted** (IRLS, δ=1.0) — decided by the
two-test rule: Huber wins LOO (×2.77 vs ×2.98 OLS) and the 2025-cutoff
walk-forward (×2.65 vs ×2.79), and wins Spearman on every split. It
**loses the half/half walk-forward (×3.01 vs ×2.83 OLS) at every λ
(1, 4, 16, 64)** — a real caveat, stated in the method/calibration tabs
and in §5 below, not hidden. `MODEL_VERSION` is `'radar-7-ridge'`.
`validateModel`'s LOO table relabels the adopted row ("ridge λ=4") and
adds half/half walk-forward fields. `shrinkK` removed from
`ModelConstants` (dead after the ridge; no code used it). Growth and
maturity stay as board-value multipliers, EXCLUDED from the headline
validation (noGm), matching kiencx's treatment.

Fit: sizeA=3.5936, sizeB=0.4550, R²=0.2467, residSd=0.8116,
ridgeLambda=4, ridgeHuber=true, n=95 peers.

### 1b. Brier-scored token-odds model
`lib/model.ts` gains `fitOdds` / `oddsFor` / `OddsFit` / `OddsTermRow`:
a logistic regression for **P(protocol ever records a token)**, training
set = rankable-type protocols with a listing date (n=532, base rate
0.492). Kept terms **age + size only**: intercept −1.249, age +0.695,
size +0.166. Brier LOO 0.208 (base 0.250), WF 0.225 (base 0.332),
called-right 68% LOO / 66% WF, wfTestN 276. The term table is computed
inside `fitOdds` every build and matches `benchmark/odds-test.ts`
exactly. Board implied value = **value-if-launches × odds**; `BoardRow`
carries `odds`, `model.odds`, `model.value_if_launches`; `attachBands`
scales the band by odds; `RadarData.odds` added. A **TOKEN ODDS column**
(sortable) is on the board table; the detail view adds Token odds +
Value-if-launches cells and an odds step in the derivation waterfall;
the calibration tab adds the token-odds model section and the two-test
term table (from `DATA.odds.termTable`), plus the censoring caveat.

**Bug found and fixed in this session:** `fitOdds` first used
`isRankable(p)`, which requires `isPreToken`, so it excluded all y=1
examples (training set all y=0) → odds ~0 → every implied value $1 →
build failed "all 200 rows share the same implied value $1". Fixed with
a `rankableType` check (category ≠ CEX and not versioned-name); training
set = listed_at AND rankable-type.

**Terms tested, not kept** (two-test rule — a term is kept only if it
lowers Brier in BOTH LOO and walk-forward): growth (0.208 / 0.226 —
does not lower WF), family (0.200 / 0.225 — improves LOO only, WF
ties), chain count (0.209 / 0.226), and the placebo/control "growth of
another row" (0.209 / 0.225 — must not help, and does not). Family
offsets in the full fit are large (±3: binance −3.05, kinetiq +3.05,
jupiter +2.88, hyperliquid +2.44, lista +2.44) — a sign of
small-family overfitting (12 stems with ≥3 members); this is why the
two-test rule rejects it.

### 1c. 758-protocol accounting bar + integrity strip
`computeAccounting` in `lib/model.ts`, `accountingHtml` in the
dashboard: 9 groups summing to 758 (see §3). The integrity strip is
computed in-page from `__CHECKS__` and `DATA.accounting`: "200 of 200
implied values recomputed here and matched… ranks 1–200 in order,
values never rise: yes… 758 of 758… built by main.ts from snapshot
2026-11-14".

### 1d. KPI strip leads with walk-forward + two-test term table
The KPI strip now leads with the walk-forward miss (was blind ×3.97,
our worst number). The calibration tab adds the ridge size-curve
section, ridge settings table, token-odds model section, and the
two-test term table. The formula box is updated to ridge + odds.

### 1e. Board-level worked example
A panel on the board tab works row 1 (Steakhouse Financial) through
the model step by step (TVL × multiple × size factor × growth ×
maturity → value-if-launches; then × odds → implied value), computed
in-page.

Also: all hardcoded "5"/"3 of 5" P25-positive references are now
dynamic via a `p25FullyCostedNegative()` helper; the method tab's
hardcoded ×2.96 is fixed; the board footnote, footer, and legend say
"expected value" (odds-weighted).

## 2. Measured validation — before (round 6) vs after (round 7)

| Test | Round 6 | Round 7 | Research expected |
|---|---|---|---|
| LOO median max-ratio | ×2.96 | **×2.77** | ~×2.98 (unchanged) |
| LOO within-3x | 50.5% | **51.6%** | ~50.5% |
| LOO Spearman | 0.340 | **0.360** | — |
| Blind 80/20 ×5 median max-ratio | ×3.97 | **×3.78** | — |
| Blind within-3x | 42.1% | **45.3%** | — |
| WF 2025-cutoff median max-ratio | ×3.43 | **×2.65** | ~×2.79 |
| WF 2025-cutoff within-3x | 41.9% | **51.6%** | — |
| WF 2025-cutoff Spearman | — | 0.248 | — |
| WF half/half median max-ratio | ×4.05 | **×3.01** | ~×2.83 |
| WF half/half within-3x | — | 47.9% | — |
| WF half/half Spearman | — | 0.302 | — |
| Odds Brier LOO / WF | — | **0.208 / 0.225** | base 0.250 / 0.332 |
| Odds called-right LOO / WF | — | **68% / 66%** | — |

LOO variant table (adopted = ridge λ=4): flat 0.25x ×4.11/35.8%;
global median 0.204x ×5.00/37.9%; size curve only ×3.17/48.4%; size
slope damped 0.5x ×3.29/46.3%; **ridge λ=4 ×2.77/51.6%**.
Flat baseline on each split: LOO ×4.11, blind ×4.70, WF 2025 ×5.35,
WF half/half ×5.29.

Band calibration: blindCov80 0.811, blindCov50 0.463, timeCov80 0.742,
timeCov50 0.484, boardWidth80 100.5, boardWidth50 9.6. LOO128:
within-3x 43.8%, Spearman 0.412, medianMax ×3.63. Bias dex −0.0345,
p90 ×28.59, coherence 0.879, chainEth +0.060, chainSol −0.611.

**vs kiencx (the bar):** our WF 2025-cutoff ×2.65 now beats kiencx's
×2.53? No — kiencx's WF within-3x is 55% and its 2025-cutoff miss is
×2.53; ours is ×2.65 / 51.6%. We closed most of the gap (from ×3.43
to ×2.65) but do not yet beat kiencx on walk-forward. Our LOO
within-3x 51.6% beats kiencx's LOO 45%. The odds model is a structural
capability kiencx does not have (it reports a token-probability
column but no Brier-validated odds weighting).

## 3. Board re-ranking

| | Round 6 | Round 7 |
|---|---|---|
| Watchlist total | $0.600B | **$0.347B** (value-if-launches $0.727B) |
| Board total | — | $0.693B |
| P25-POSITIVE | 5 | **3** |
| FARM (excl. P25-positive) | 6 | **2** |
| FARM total | 11 | **5** |
| THIN | 72 | **26** |
| SKIP | 117 | **169** |
| Playbooks | 7 | **5** |

Top 10 (all SKIP/THIN): #1 Steakhouse Financial $35.6M (odds 0.58,
value-if-launches $61.1M, netEv −$37.96); #2 Veda $28.6M (0.60,
−$36.88); #3 Gauntlet $27.6M (0.56, −$29.14); #4 Upshift $18.8M;
#5 Lofty $15.4M (0.85, THIN); #6 Symbiotic $14.6M; #7 USDD $14.1M;
#8 Hive $13.6M; #9 OpenTrade $12.9M; #10 Plume Vaults $12.6M.

FARM rows: #18 Wrapped $6.9M (odds 0.87, netEv $47.81, 1.67x);
#42 WEMIX.FI Staking $4.2M (0.70, $46.46, 1.63x); #58 MetalX Swap
$3.6M (0.82, $71.29, 2.50x); #59 Katana DEX $3.6M (0.86, $66.52,
2.33x); #63 Binaryx Platform $3.4M (0.57, $46.10, 1.62x).
P25-positive: MetalX, Katana, Binaryx. P25-FULL: 1 (Binaryx, fully
costed p25 +$5.45); P25-negative fully costed: 2 (MetalX −$7.87,
Katana −$7.58). Top playbook by fully costed NetEV: MetalX $61.74.

Odds on board: min 0.16, max 0.87, mean 0.39; mean odds by verdict:
P25-POSITIVE 0.75, FARM 0.78, THIN 0.55, SKIP 0.35. LOO hits 49/95.

**Accounting (9 groups, sum 758):** ranked watchlist 40; ranked
early 160; live, fit peer 95; live, set aside (no listing date) 33;
live, no usable cap 288; pre-token, CEX 42; pre-token,
versioned/wrapped 11; pre-token, rankable, TVL at/above floor 63;
pre-token, rankable, below early cap 26. All 40 watchlist protocols
are rankable (hence pre-token).

## 4. Verification

- **Byte-identical rebuilds ×2:** `out/` and `out2/` — `board.json`,
  `data.js`, `dossier.json`, dashboard, and all 4 screenshots IDENTICAL.
  Build: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input
  ~/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json`
  (node v22.23.5, ~150s; the odds term table adds ~35s).
- **Headless-Chromium harness:** `~/workspace/makefun/shot-tool/r7_verify.mjs`
  (run from inside `~/workspace/makefun/shot-tool/`, port 18083):
  **62/62 passed**. First run 61/62 — the one failure was a harness
  bug (playbook row count scoped to all plain tables instead of the
  playbooks panel; fixed), re-run 62/62.
- **Python reconciliation:** `round7/reconcile_round7.py` — an
  independent numpy reimplementation of the ridge fit (Huber IRLS,
  λ=4), the odds fit (logistic IRLS, age+size), the implied-value /
  odds / multiple / rank / verdict / net-EV arithmetic, the playbook
  totals, and the accounting. **PASSED:** ridge a=3.5936, b=0.4550;
  odds intercept −1.2486, age 0.6947, size 0.1657; all 200 implied
  values, odds, multiples, ranks, verdicts, and net EVs match the
  built board; all 5 playbook totals match; accounting sums to 758.
  (One reconciliation bug of mine, fixed in the script: the L2 chain
  set was built by splitting a space-separated string, which broke
  multi-word names — "polygon zkevm" became "polygon" + "zkevm", so
  Polygon gas was $0.30 instead of $0.05. The shipped board was
  correct; the reconciler was wrong.)
- **Screenshots** (visually verified, 1024×711):
  `screenshots/1-board.png` (127,800 B — KPI strip leads with
  walk-forward, bubble map, legend "2 of 3 pre-fee P25-positive rows
  are negative", watchlist $346.5M),
  `screenshots/2-detail.png` (169,855 B — MetalX Swap playbook, fully
  costed $38.09, Net EV +$61.74 median, p25 −$7.87),
  `screenshots/3-calibration.png` (151,572 B — ridge section),
  `screenshots/4-anchors.png` (131,306 B).
  Inspection-only (not shipped): `tmp-playbooks-panel.png`,
  `tmp-accounting.png`, `tmp-board-table.png`.
- **Transcript-gate inputs are clean:** the model files (`lib/model.ts`,
  `dashboard/app.js`) were authored fresh in this session; no file
  content was pasted or copied from outside this session.

## 5. What did NOT match the research's expected numbers — flags

1. **Huber loses the half/half walk-forward.** Huber-weighted ridge
   loses to OLS ridge on the half/half split at every λ (×3.01 vs
   ×2.83). It wins LOO and the 2025-cutoff WF, so Huber is kept by the
   two-test rule as defined in the research, but the caveat is stated
   in the method/calibration tabs and here. The half/half miss (×3.01)
   is also slightly worse than the research's expected ~×2.83.
2. **WF 2025-cutoff ×2.65 beats the research's ~×2.79** — better than
   expected. LOO ×2.77 is better than the expected ~×2.98.
3. **FARM 5 is thin.** The odds weighting cuts expected values ~50%,
   so only 5 rows clear the unchanged verdict rule (NetEV ≥ $40 and
   ≥1.5× cost), vs 11 in round 6 and 14 for kiencx / 12 for
   europa-nova. The top 10 rows by implied value are all SKIP/THIN.
   This is the honest consequence of the validated odds model (the
   biggest rows have tiny pool shares because their TVL is large),
   not a tuning choice — the verdict rule was not changed, per the
   research. The farm layer still covers 5 playbooks.
4. **Ship-rule watchlist-total flag (judgment call for the parent/user).**
   The standing ship rule requires the watchlist total within 25% of
   $0.637B ($0.478B–$0.796B). The odds-weighted watchlist total is
   $0.347B — **outside that band**. The value-if-launches total is
   $0.727B — inside it. The method tab states this explicitly (the
   odds weighting lowers the expected total by construction; the odds
   are a validated model, not a board error). **Do not silently
   override the ship rule** — it needs a re-basing decision for the
   odds-weighted board.
5. **Odds censoring caveat.** The outcome is "records a token *by the
   snapshot date* (2026-11-14)". A protocol that has not recorded one
   yet may still do so, so the odds are a lower bound on the eventual
   probability, most of all for young protocols. Stated in the
   calibration tab.
6. **We do not yet beat kiencx on walk-forward** (×2.65 vs ×2.53,
   51.6% vs 55% within-3x). We closed most of the gap and beat kiencx
   on LOO within-3x (51.6% vs 45%), and we have a Brier-validated odds
   model kiencx does not. Whether that is enough for the judge's
   criterion 1 (model accuracy) is a judgment call — the judge scores
   the whole entry, not the walk-forward table alone.

## 6. Files

- `lib/model.ts` — ridge + odds + accounting (authored fresh this session)
- `dashboard/app.js` — TOKEN ODDS column, KPI reorder, worked example, accounting bar, dynamic P25 counts (authored fresh this session)
- `benchmark/how-to-beat-kiencx.md` — research (read first)
- `benchmark/blind-vs-kiencx.md` — blind pairwise vs kiencx (kiencx won 2–0, margin 3, deciding criterion 1)
- `benchmark/ridge-test.ts`, `benchmark/ridge-sweep.ts` — Huber vs OLS, λ sweep
- `benchmark/odds-test.ts` — odds term table, Brier LOO + WF
- `benchmark/wf.ts`, `benchmark/wf2.ts` — walk-forward scripts
- `round7/reconcile_round7.py` — independent Python reconciliation (passes)
- `round7/RESULTS_round7.md` — this file
- `top10/` — top-10 leaderboard artifacts (reference only)
- `~/workspace/makefun/shot-tool/r7_verify.mjs` — harness (62/62)
