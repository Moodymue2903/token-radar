# Audit — Round 8 "Tidegauge" (winsor) (GLM perspective, independent)

**Auditor:** independent (GLM perspective). **Date:** 2026-11-21. **Branch:** `round8-winsor`, commit `c29206a`.
**Scope:** `round8/RESULTS_round8.md`, `benchmark/path-to-number-one.md`,
`benchmark/how-to-beat-kiencx.md`, `lib/model.ts`, `dashboard/app.js`,
`screenshots/1–4-board-table.png`, `out/data.js`, `out/board.json`,
`out/dossier.json`, `top10/r01-kiencx.webp`, `top10/r10-europa-nova.webp`,
`round7/audit_gemini.md`, `round7/audit_deepseek.md`, `round7/audit_glm.md`.
**Method:** read the code; independently re-computed every headline number
from `out/data.js` and `out/board.json` (Python); re-ran
`benchmark/value-terms-r8.ts` (node) and `round8/reconcile_round8.py`
(Python) myself; re-ran `~/workspace/makefun/shot-tool/r8_verify.mjs`
(68/68); hashed the dossier images against `screenshots/` and
`out/screenshots/`; viewed all 4 screenshots (including a 2x zoom of the
board shot's map panel). No files modified except this report.

## Verdict: SUBMIT WITH FIXES

- **Top-5 probability: 40%**
- **Top-10 probability: 85%**
- **#1 probability: ~30%**
- **Required fix:** the 4th dossier image is not a board-table shot (fix #1).
  Everything else the round-7 audits asked for is done and verified. Do NOT
  submit until the dossier's 4th image actually shows the ranked board table.

Round 8 is the first round that **beats kiencx on the deciding criterion**:
walk-forward ×2.19 vs ×2.53, and LOO ×2.74 vs ×3.33. Every research
expectation was hit exactly, the model is correctly implemented, the numbers
reconcile, the dossier is fresh (the round-7 blocker is fixed), and the
dashboard is honest about its remaining losses. The entry's case to the
judge now rests on the accuracy lead outweighing a still-thinner board —
and the judge still cannot see the board itself in any dossier image,
because the "board-table shot" captured the accounting table instead.

---

## 1. Model correctness

### 1a. Winsorized ridge — CORRECT, implemented exactly as researched
`ridgeFit` (`lib/model.ts:840–933`): winsor bounds from the train set's
log10(mcap) via the index rule `sorted[Math.floor(q * (n - 1))]`
(lines 866–867) — the exact rule the research measured, not linear
interpolation. The outcome is clipped before the solve (line 883) and the
Huber IRLS residuals are measured against the winsorized outcome.
Penalties apply only to the category-offset columns (lines 886–892);
intercept and slope are unpenalised. Categories with < 3 peers get offset 0.
Shipped fit (`out/data.js`, verified): sizeA = 3.9013, sizeB = 0.4137,
R² = 0.2448, residSd = 0.8126, λ = 4, Huber on, winsor bounds
[5.4578, 8.5026] in log10 (=$287K–$318M, as RESULTS states). The
Python reconciliation (re-run by me, PASSED) independently reproduces the
same a/b and winsor bounds in numpy.

The winsorization is a fitting choice, not test-set manipulation: the
quantiles come from the train set only, and test peers are predicted as-is.
The code states this; the implementation does it.

### 1b. Maturity and growth dropped — CORRECT, config verified
`MODEL` (`lib/model.ts:217–221`): `growthWeight: 0`, `maturityFloor: 1`,
`maturityRange: 0`. `growthMult`/`maturityMult` are identically 1.0 for
every row (lines 1056, 1062). The board is the fitted model, no priors —
as the research recommended. The header comment (lines 35–37) correctly
states the winsorization alone takes WF-cutoff ×2.65 → ×2.19, and the
MODEL comment (lines 213–219) correctly cites the maturity WF harm
(×2.65 → ×3.05) and the FARM gain from dropping growth (6 → 8).

### 1c. Dead `ridgeHuber` flag — FIXED
`fitModel` now passes `model.ridgeHuber` (line 982; also line 2282 in
validation). The flag is honoured and the dashboard reads it from the fit
(`app.js:1046`: "Huber δ 1.0" / "off — OLS"). The round-7 bug (hardcoded
`true`, dead config) is gone.

### 1d. Token-odds logistic — UNCHANGED, still correctly specified
`fitOdds` unchanged from round 7: age + size, intercept −1.2486, age
+0.6947, size +0.1657, train n = 532, base rate 0.4925 — all match
`out/data.js` and the Python reconciliation. Brier **LOO 0.2085 / WF
0.2253** (base 0.2499 / 0.3316), called-right 67.9% / 65.9%, wfTestN 276.
No change was needed here and none was made.

---

## 2. Validation honesty

Every headline number re-computed from `out/data.js` and `out/board.json`
(verified independently, Python — not the build's own code):

| Metric | RESULTS_round8.md | Built data (verified) |
|---|---|---|
| LOO median max-ratio / within-3x / Spearman | ×2.74 / 50.5% / 0.345 | 2.7406 / 50.5263% / 0.3453 |
| LOO P90 max-ratio | ×29.14 | 29.1351 |
| Blind 80/20 ×5 median max-ratio / within-3x / Spearman | ×3.73 / 45.3% / 0.448 | 3.7334 / 45.2632% / 0.4481 |
| WF 2025-cutoff median max-ratio / within-3x / Spearman (n=31) | ×2.19 / 51.6% / 0.259 | 2.1949 / 51.6129% / 0.2593 |
| WF half/half median max-ratio / within-3x / Spearman (n=48) | ×2.59 / 54.2% | 2.5858 / 54.1667% / 0.3127 |
| Odds Brier LOO / WF (base) | 0.208 / 0.225 (0.250 / 0.332) | 0.20846 / 0.22533 (0.24994 / 0.33160) |
| Odds called-right LOO / WF, wfTestN | 68% / 66%, 276 | 0.6786 / 0.6594, 276 |
| Coherence | 0.8152 | 0.8152 |
| Band coverage blind 80% / 50%, time 80% / 50% | 81.1% / — / — / — | 0.8105 / 0.4632 / 0.7419 / 0.5161 |
| Board width 80% / 50% | 106.8x / — | 106.77 / 9.595 |
| LOO on all 128 traded peers | ×3.64 / 44.5% | 3.642 / 44.5313% |

All four splits improved over round 7, exactly as the research predicted
(WF-cutoff ×2.65 → ×2.19, LOO ×2.77 → ×2.74, blind ×3.78 → ×3.73,
WF-half ×3.01 → ×2.59). Within-3x: LOO dipped 51.6% → 50.5% (48/95),
WF-cutoff flat at 51.6%, WF-half rose 47.9% → 54.2%. No cherry-picking:
all four splits are reported, including blind (our worst number, ×3.73)
and the LOO within-3x dip.

### 2a. Huber vs OLS — the research report's §4 claim was wrong, and the build caught it
I re-ran `benchmark/value-terms-r8.ts` myself (node, lib code path):

| Ridge λ=4, winsor 5/95 | LOO | WF-cutoff | WF-half | Blind |
|---|---|---|---|---|
| Huber (shipped) | ×2.74 / 50.5% / ρ0.345 | ×2.19 / 51.6% | ×2.59 / 54.2% | ×3.73 / 45.3% / ρ0.448 |
| OLS | ×2.76 / 51.6% / ρ0.336 | ×2.28 / 51.6% | ×2.61 / 54.2% | **×3.48 / 47.4% / ρ0.446** |

The path-to-#1 report §4 claimed "with winsor, Huber wins or ties on
all four [splits]". That is **wrong on the winsorized fit**: OLS wins the
blind test by 0.25 (×3.48 vs ×3.73) and also wins blind within-3x
(47.4% vs 45.3%). The research table simply had no OLS+winsor blind
number (marked "—"), and the "wins or ties" sentence overreached from
the three splits it did measure. Credit to the build: it did not repeat
the claim. The dashboard calibration tab states the blind loss
explicitly (visible in screenshot 3: "Huber weighting wins
leave-one-out (x2.74 vs x2.76 OLS) and both walk-forward splits (x2.19
vs x2.28; x2.59 vs x2.61) but loses the blind test (x3.73 vs x3.48
OLS); it is kept for the headline splits... Without winsorization,
Huber lost the half/half split to OLS (x3.01 vs x2.83 in round 7) —
the winsorization is what fixed that split."). The header comment in
`lib/model.ts` (lines 40–45) states it too. Keeping Huber remains the
right call — it wins the two headline splits (LOO + 2025-cutoff WF) —
but the entry is now honest about the one split it loses. One
imprecision remains: the `MODEL.ridgeHuber` comment (`lib/model.ts:193–
197`) says Huber "wins or ties on the three splits the research
measured for OLS+winsor" and omits blind. Narrowly true (the research
measured three), but a reader of that comment alone would conclude
Huber wins everywhere. One-line fix (fix #2).

### 2b. Value-model two-test term table — PRESENT, and the numbers reproduce
`validation.valueTermTable` in `out/data.js`, rendered on the
calibration tab (`dashboard/app.js:1064–1067`, harness check passed).
Re-ran `benchmark/value-terms-r8.ts` myself — every row matches:

| Terms | LOO | WF-cutoff | Status |
|---|---|---|---|
| size curve only | ×3.18 / 47.4% | ×2.77 / 51.6% | tested, not kept |
| **size curve + category ridge** | **×2.74 / 50.5%** | **×2.19 / 51.6%** | **kept** |
| adopted + family effect · ridge 16 | ×2.74 / 50.5% | ×2.19 / 51.6% | tested, not kept |
| adopted + 7-day TVL growth | ×2.96 / 50.5% | ×2.44 / 51.6% | tested, not kept |
| adopted + age, years listed | ×3.09 / 48.4% | ×3.64 / 35.5% | tested, not kept |
| adopted + chain count, ln | ×3.05 / 48.4% | ×2.23 / 51.6% | tested, not kept |
| adopted + control: growth of another row | ×2.71 / 50.5% | ×3.25 / 48.4% | must not help |

The family row is identical to adopted **by construction, and I verified
why**: the 95 fit peers have 95 distinct first-word name stems (zero
duplicates, checked from the snapshot), so the family term adds no
columns. The dashboard states this. Age is the worst value term on
walk-forward (×3.64) — a useful, honest admission. The control term's
small LOO edge (×2.71 vs ×2.74) with a much worse WF (×3.25) is
correctly read as noise. Round-7 GLM fix #6 is closed.

---

## 3. Board re-ranking

Verified from `out/board.json` (200 rows):

| | Round 7 | Round 8 (verified) |
|---|---|---|
| Watchlist total (odds-weighted) | $346.5M | **$402.0M** |
| Watchlist total (value-if-launches) | $727.0M | **$877.8M** |
| Board total | $693.1M | **$839.8M** |
| P25-POSITIVE | 3 | **2** |
| FARM (excl. P25-positive) | 2 | **6** |
| FARM total | 5 | **8** |
| THIN / SKIP | 26 / 169 | **36 / 156** |
| Playbooks | 5 | **5** |

Top 10 (all SKIP except #7 Lofty THIN; values match RESULTS exactly):
#1 Steakhouse $37.3M (odds 0.58), #2 Veda $30.5M (0.60), #3 Gauntlet
$28.5M (0.56), #4 Upshift $18.7M (0.59), #5 Symbiotic $15.4M (0.64),
#6 USDD $15.0M (0.58), #7 Lofty $15.0M (0.85, THIN), #8 OpenTrade
$14.2M (0.56), #9 Hive $14.1M (0.65), #10 Plume Vaults $13.7M (0.57).
Ranks 1–200 in order, values never rise. FARM rows: #21 Wrapped
P25-POSITIVE (netEv $57.51), #44 Steer ($43.76), #55 WEMIX.FI ($53.00),
#60 FstSwap ($44.89), #68 Katana P25-POSITIVE ($76.61), #74 Binaryx
($53.74), #75 MetalX ($74.13), #92 SyncSwap ($53.81). All match RESULTS.

### Playbooks — verified in-page (harness re-run, 68/68)
Top playbook by fully costed NetEV: **Katana DEX $67.06** (board $76.61,
p25 +$8.23 → fully costed p25 −$1.32; detail screenshot confirms:
board costs median +$76.61, fully costed +$67.06, total cost $38.09 =
board $28.54 + extra $9.55). Binaryx fully costed p25 **−$5.46**
(harness check passed; round 7 had +$5.45). **P25-FULL: 0** — no
playbook row breaks even at p25 once fully costed (round 7 had 1).
Both P25-POSITIVE rows go negative fully costed at p25 (Wrapped −$2.95,
Katana −$1.32); the board legend states this honestly ("2 of 2 pre-fee
P25-positive rows are negative once costs are counted", computed
in-page via `p25FullyCostedNegative()`, visible in screenshot 1).
The 5-playbook rule (every P25-POSITIVE row + top-5 FARM by NetEV,
deduped) is stated in RESULTS; Steer, WEMIX.FI and FstSwap are FARM
without playbooks by design, not by omission.

**The farm layer is thinner at the top than round 7 in one respect:**
P25-FULL went 1 → 0. The FARM count rose 5 → 8, but no farm survives
its own p25 once fully costed. That is an honest consequence of the
flatter winsorized slope pricing the top lower, and it is disclosed on
the board itself — but a judge comparing playbooks will notice that
round 7's Binaryx +$5.45 is gone. It does not change my verdict; it
tempers the #1 probability (see §5).

### Ship-rule re-basing — stated honestly, with one circularity to note
The old rule (watchlist total within 25% of $0.637B, band $478M–$796M)
was written for value-if-launches boards. Round 8's VIL total is
**$877.8M — 37.8% above the old reference, outside the old band** —
because the maturity discount is gone. The method tab
(`dashboard/app.js:996, 1014`) states this plainly and re-bases the
reference to the current VIL total ($0.878B, band $0.66B–$1.10B),
with the reason (maturity cut young protocols by up to 40%). The
board-tab legend shows the VIL total ($877.8M) alongside the
odds-weighted total ($402.0M) — round-7 DeepSeek fix, closed. Note for
the parent: the re-based reference **is** the current total, so the
current entry passes the re-based band by construction; the band only
binds future variants. That is how a re-basing works, and the miss
against the old band is disclosed rather than hidden — but do not
describe the re-based band as a test the current entry "passed". It
is a governance decision, recorded, not a code fix. Round-7 Gemini fix
#5 and GLM fix #2 are closed.

---

## 4. Round-7 audit fixes — checked one by one

| Round-7 finding | Status in round 8 |
|---|---|
| **#1 BLOCKER: dossier embeds round-6 screenshots** (GLM/Gemini) | **FIXED — verified.** `out/dossier.json` image hashes == `screenshots/` hashes, 4/4 (fceefb8c…, ae3511c1…, 50d98a44…, 8aa3cddc…), in both `screenshots/` and `out/screenshots/`. `out/` == `out2/` byte-identical (`diff -r` clean). I re-ran the harness myself after the build and the re-taken screenshots are byte-identical to the dossier's, so the hashes still match. |
| **#2 Re-base the ship rule** (GLM/Gemini/DeepSeek) | **FIXED.** Method tab states the re-basing with the old-band miss (see §3). |
| **#3 Stale numbers in `lib/model.ts`** (GLM) | **FIXED.** Header comment now reads slope 0.414, LOO within-3x 50.5%, p90 ×29.1, band ~107x, Steakhouse size factor 0.075x / multiple 0.014x, FARM cap 8 — all match the built data. One leftover: the `topScalar` comment (lines 236–241) still says "the watchlist total falls back to the model's own ~$0.637B" — stale; round-8 VIL is $877.8M / odds-weighted $402.0M. Comment-only (fix #3). |
| **#4 Correct RESULTS (coherence 0.879; kiencx odds claim)** (all three) | **FIXED.** RESULTS_round8.md states kiencx HAS a Brier-validated odds model, better than ours (0.186/0.215 vs 0.208/0.225), and coherence 0.778 (round 7) / 0.8152 (round 8). "0.879" appears nowhere except in the correction note itself. |
| **#5 Huber-vs-OLS disclosure on dashboard** (all three) | **FIXED — and stronger than asked.** The calibration tab discloses the round-7 half/half loss AND the round-8 blind loss (×3.73 vs ×3.48 OLS), visible in dossier image 3. |
| **#6 Value-model two-test term table** (GLM/DeepSeek) | **FIXED.** Present in `data.js` and rendered on the calibration tab; numbers reproduce from the lib code path (§2b). |
| **#7 Show the board table in the dossier** (GLM, recommended) | **NOT FIXED — see §6, fix #1.** The 4th image shows the accounting table, not the ranked board table. |

---

## 5. Gap to kiencx — round 8 reverses the deciding criterion

| Dimension | Kiencx (#1, 966,767) | Round 8 | Who wins |
|---|---|---|---|
| Walk-forward 2025-cutoff miss | ×2.53 | **×2.19** | **Us (by 0.34)** |
| Walk-forward within-3x | 55% | 51.6% | Kiencx |
| LOO miss | ×3.33 | **×2.74** | **Us (by 0.59)** |
| LOO within-3x | 45% | 50.5% | **Us** |
| Blind median max-ratio | (not reported) | ×3.73 | — |
| Token-odds Brier WF / LOO | 0.215 / 0.186 | 0.225 / 0.208 | Kiencx (both) |
| Odds Brier WF, europa-nova | 0.200 | 0.225 | Europa-nova |
| FARM count | 14 | 8 | Kiencx |
| Top value (Steakhouse) | $68.7M | $37.3M | Kiencx |
| Board total | $1,521.8M | $839.8M | Kiencx |
| 758 accounting + integrity strip | Yes | Yes | Tie |
| Value two-test term table | Yes | Yes (now) | Tie |
| Worked example | No (formula in one line) | Yes (row 1, computed in-page) | **Us** |
| Legibility / density | Dense | Cleaner, larger type | **Us** |

Against europa-nova (#10, 960,454, the bar): we now beat them on WF
(×2.19 vs ×2.45) and LOO (×2.74 vs ×3.96), but trail on odds Brier WF
(0.225 vs 0.200) and FARM (8 vs 12). The top-10 case is now strong,
not a coin flip.

The blind test that motivated this whole line (round 6 vs kiencx,
kiencx won 2–0, margin 3, deciding criterion 1, WF gap 0.90) has
reversed on the numbers: we now lead the WF criterion by 0.34 — a
larger margin than the one that beat us. That is the path to #1 the
research promised, and it is measured, not hoped. What still stands
between us and #1 is the board's richness: FARM 8 vs 14, top $37M vs
$69M, board $0.84B vs $1.52B, odds Brier behind on both tests, and
P25-FULL 0. Whether the judge weights the accuracy lead over the
thinner board is the one question no local measurement can answer —
and it is exactly what the blind re-test must decide. My probabilities
(top-10 85%, top-5 40%, #1 ~30%) sit inside the research's ranges
(85% / 40% / 25–35%); I hold #1 at the middle of that range rather
than the top because P25-FULL went to 0 and the odds gap is
structural. The research's #1 estimate assumed the accuracy lead
decides; the farm-thinness at p25 is a real counterweight.

---

## 6. Bugs, inconsistencies, and numbers that do not reconcile

### Issue 1 — REQUIRED FIX: the 4th dossier image is the accounting table, not the board table
`4-board-table.png` (dossier image 3, sha256 8aa3cddc…) shows the
758-protocol accounting table ("Where every protocol went": 40 / 160 /
95 / 33 / 288 / 42 / 11 / 63 / 26, Total 758), the integrity strip,
and the top of the yardstick scatter. It does **not** show the ranked
board table — no Rank / Protocol / Implied value / **Token odds** /
Verdict columns, no board rows at all. I viewed the image: the
accounting table fills the frame.

Cause: `~/workspace/makefun/shot-tool/r8_verify.mjs:303–304` scrolls
to `document.querySelector('table')` — the **first** table in DOM order
on the board tab — and screenshots it as `4-board-table.png`. The first
table in the board tab's DOM order is the accounting table
(`dashboard/app.js:774`); the ranked board table is built later
(`app.js:882`, headers Rank / Protocol / TVL / 7d / Age / Implied value /
**Token odds** / P10–P90 / P25–P75 / Multiple / Gross / Cost / Net EV /
BE odds / Net $/h / Fees·Hold / Verdict). The harness checks nothing
about the 4th image's content — it only takes the shot — so the mistake
passed 68/68.

Consequence: **no dossier image shows the ranked board table.** Image 0
is KPI + bubble map, image 1 is the Katana playbook modal, image 2 is
calibration, image 3 is accounting + yardstick. The judge therefore
still cannot see the TOKEN ODDS column or the verdicts from the
images — the exact gap round-7 GLM fix #7 was meant to close. And
`round8/RESULTS_round8.md` §"What changed" 5(b) claims the opposite:
"4th dossier image is a **board-table shot** (4-board-table.png),
replacing anchors — the judge can now see the ranked board table, the
TOKEN ODDS column and the verdicts." That claim is false, and it must
be corrected along with the image. (The accounting bar itself is not
wasted — it is a real completeness signal, and it was previously below
the fold — but it is not the board table, and the swap did not achieve
what it claims.)

Fix: in `r8_verify.mjs`, select the ranked table by its header
(e.g. the table whose `th` text includes "Token odds"), scroll it into
view, retake `4-board-table.png`, re-run `main.ts` to rebuild the
dossier, and re-verify the dossier hashes 4/4. Then correct the
RESULTS claim to describe what image 3 actually shows. Small fix —
but do it **before** the blind pairwise test, because the blind test
uses these same images: as they stand, the blind judge would compare
kiencx's visible board against our invisible one.

### Issue 2 — Minor: `MODEL.ridgeHuber` comment omits the blind loss
`lib/model.ts:193–197`: "With the winsorized fit Huber wins or ties
on the three splits the research measured for OLS+winsor (LOO x2.74 vs
x2.76, WF-cutoff x2.19 vs x2.28, WF-half x2.59 vs x2.61...)". True as
worded ("the three splits the research measured"), but it omits blind,
where Huber loses (×3.73 vs ×3.48 OLS, measured by this build's own
`benchmark/value-terms-r8.ts`). The header comment and the dashboard
do state the blind loss, so the disclosure exists — this is a
comment-precision point only. Add "loses blind (x3.73 vs x3.48 OLS)"
to the comment.

### Issue 3 — Minor: stale `topScalar` comment
`lib/model.ts:236–241`: "the watchlist total falls back to the model's
own ~$0.637B". Stale — round 8's watchlist is $402.0M odds-weighted /
$877.8M value-if-launches. Comment-only, historical context for why
the scalar was dropped. One-line fix.

### Not issues (checked and cleared)
- The round-7 dossier blocker is fixed (hashes 4/4, `out/` == `out2/`).
- The harness re-run by me: **68/68 checks passed**, including Katana
  detail $67.06, Binaryx −$5.46, value term table, Huber/OLS disclosure,
  anchors 48/95 (48/95 = 50.5% = LOO within-3x, consistent).
- The "…" visible at the top of the bubble map in screenshot 1 is three
  small protocol bubbles, not a rendering defect (verified at 2x zoom);
  the map panel has no heading by design.
- The dossier text is the vendored source (dashboard + lib), per the
  kit's standard format — the scorer rebuilds it from `/output`. No
  issue.
- The family term's identical row, the odds term table, the accounting
  sum (758), the board totals, verdict counts, ranks and order, all 8
  FARM rows' net-EV arithmetic, the "2 of 2" legend (computed in-page),
  the worked example, and the "49 of 95"→"48 of 95" anchors update all
  reconcile to the built data.
- No cherry-picking: all four validation splits are reported, including
  the LOO within-3x dip and the blind loss to OLS.

---

## Verdict: SUBMIT WITH FIXES

**Top-5 probability: 40%. Top-10 probability: 85%. #1 probability: ~30%.**

Round 8 delivers the measured path to #1: it beats kiencx on
walk-forward (×2.19 vs ×2.53) and LOO (×2.74 vs ×3.33), closes every
round-7 audit finding except one, and is honest about the losses it
still carries (blind to OLS, odds Brier to kiencx, FARM count, board
richness, P25-FULL 0). The model work is correct, the validation is
real, and the dossier is fresh. The single required fix is the 4th
dossier image: as it stands the judge cannot see the ranked board
table at all, and the RESULTS file wrongly claims it can. Fix the
selector, retake, rebuild, re-verify — then run the blind pairwise
test against kiencx and europa-nova with the fixed images before
spending the slot.

### Fixes required (numbered, with exact file and change)

1. **[REQUIRED] Retake the 4th dossier image as a true board-table shot.**
   In `~/workspace/makefun/shot-tool/r8_verify.mjs:303–304`, replace
   `document.querySelector('table')` with a selector for the ranked
   board table — e.g. find the table whose header text includes
   "Token odds" (the ranked table is built at
   `dashboard/app.js:882`; the accounting table at `:774` currently
   wins the bare selector). Retake `screenshots/4-board-table.png`,
   re-run `main.ts` to rebuild `out/` (and `out2/`), re-verify
   byte-identical rebuilds and dossier hashes 4/4. Then correct
   `round8/RESULTS_round8.md` §"What changed" 5(b) to describe what
   image 3 actually shows (ranked board rows with the TOKEN ODDS
   column and verdicts visible). Do this **before** the blind test
   and before any submission — the blind judge uses these images.
2. **[Minor, fold into the same edit pass] `lib/model.ts:193–197`:**
   add the blind loss to the `ridgeHuber` comment: "loses blind
   (x3.73 vs x3.48 OLS)". The dashboard and header comment already
   state it; the MODEL comment should not imply Huber wins everywhere.
3. **[Minor, fold into the same edit pass] `lib/model.ts:236–241`:**
   correct the `topScalar` comment: the watchlist total is $402.0M
   odds-weighted / $877.8M value-if-launches in round 8, not
   "~$0.637B". Comment-only.

After fix #1 (and the comment nits), re-run the harness and the
byte-identical rebuild check, then the blind pairwise test vs kiencx
(#1) and europa-nova (#10) with the fixed images. The blind test is
the remaining evidence: it decides whether the ×2.19 walk-forward
lead outweighs the thinner board. Do not submit before it.
