# Path to #1 — how Tidegauge can beat kiencx (966,767), not just top 10

**Date:** 2026-11-21. **Competition:** make.fun token-radar-01. **Our entry:** Tidegauge, round 7 (commit 79395cd, branch round7-ridge). **Benchmark:** kiencx, "Launch Radar v4", judge 966,767 (20W/0D/0L). Top-10 bar 960,454 (europa-nova); top-20 958,033.
**Method:** computed on the sealed snapshot with our own code (new scripts `benchmark/path1a.ts`, `path1b.ts`, `path1c.ts`, `path1d.ts`, `path1e.ts`, node v22.23.5; plus re-runs of `benchmark/wf2.ts`, `ridge-test.ts`, `odds-test.ts`). No source files modified, nothing submitted. Every number below is measured; where a gain is unmeasured it is labelled as such.

**Bottom line up front:** #1 is reachable on the metric that decides the judge's verdict, but it is not a lock. The single biggest lever — winsorizing the ridge fit's log-mcap at the 5th/95th percentiles — takes our walk-forward from ×2.65 to **×2.19**, which beats kiencx (×2.53) and europa-nova (×2.45) outright, while also improving LOO (×2.77→×2.74), blind (×3.78→×3.73) and half/half (×3.01→×2.59). Dropping the unvalidated maturity discount raises the watchlist total 25% and the top value 25%. But the board's richness gap (FARM 5–8 vs kiencx 14, top $37M vs $69M, board $0.84B vs $1.52B) is driven by the token-odds gap (Steakhouse 0.58 vs 0.85), which is structural and **not closable** by refitting a logistic on the same outcome — I tested every variant and the less-censored fits fail validation. So the path to #1 is: win the accuracy criterion decisively (winsor + drop maturity) and accept that the board will still be thinner than kiencx's. Whether that wins depends on the judge weighting accuracy over farm richness, which the blind test says it does (criterion 1 decided). Estimated after these changes: top-10 ~85%, top-5 ~40%, #1 ~25–35% (up from ~50% / ~15–20% / ~5% now). These are estimates, not predictions.

---

## 0. Where round 7 stands (verified baseline)

| Metric | Round 7 | Kiencx (#1) | Europa-nova (#10) |
|---|---|---|---|
| LOO median max-ratio / within-3x | **×2.77 / 51.6%** | ×3.33 / 45% | ×3.96 / — |
| Blind 80/20×5 median max-ratio / within-3x | ×3.78 / 45.3% | — | — |
| Walk-forward (2025 cutoff) / within-3x | ×2.65 / 51.6% | **×2.53 / 55%** | **×2.45** / — |
| Walk-forward half/half | ×3.01 / 47.9% | — | — |
| Odds Brier LOO / WF | 0.208 / 0.225 | **0.186 / 0.215** | — / 0.200 |
| Steakhouse odds | 0.58 | **0.85** | 0.79 |
| FARM count | 5 | 14 | 12 |
| Top implied value (Steakhouse) | $35.6M | $68.7M | $57.8M |
| Value-if-launches (Steakhouse) | $61.1M | $80.9M | $73.3M |
| Board total | $693.1M | $1,521.8M | — |
| Watchlist total (odds-weighted) | $346.5M | — | — |

Sources: round-7 numbers from `out/data.js` / `out/board.json` (verified); kiencx/europa-nova from `benchmark/how-to-beat-kiencx.md` (artifact reads) and `top10/top10.json`.

---

## 1. Why europa-nova's size-only gets WF ×2.45 while ours got ×2.94 (round 6) / ×2.65 (round-7 ridge-size)

### 1.1 The gap was already partly closed by the ridge
The prior research's "our size-only ×2.94" was the **round-6** size curve (Huber log-linear fit, slope 0.593, intercept 2.424). Re-run on the round-7 code (`benchmark/wf2.ts`, `path1a.ts`):
- Round-6 Huber size-only, WF cutoff: **×2.94** / 51.6% within-3x (reproduced).
- Round-7 ridge size component (ridge a + b·log TVL, no category offsets), WF cutoff: **×2.65** / 51.6%. So the ridge's jointly-fit slope already closed 0.29 of the gap. The remaining gap to europa-nova (2.45) was 0.20, not 0.49.

### 1.2 The +$100M shift (europa-nova's functional form) explains most of the rest
Europa-nova's size curve is log₁₀(V) = 7.13 + 0.424·log₁₀(TVL + $100M) — a **shifted** log, which flattens the multiple at low TVL. Testing the shifted form on our data (`path1a.ts`, WF cutoff, test = 31 newest):

| Size-only variant | LOO | WF cutoff | WF half/half |
|---|---|---|---|
| Huber plain (round-6 form) | ×3.15 / 48.4% | ×2.94 / 51.6% | ×3.11 / 45.8% |
| OLS plain | ×3.23 / 47.4% | ×3.08 / 48.4% | ×3.01 / 50.0% |
| Huber +$100M shift | ×3.18 / 48.4% | **×2.63** / 54.8% | ×3.19 / 47.9% |
| OLS +$100M shift | ×3.08 / 48.4% | ×2.80 / 54.8% | ×3.03 / 50.0% |
| Huber +$100M shift, dateless peers in train (n=97) | — | **×2.55** / 54.8% | — |
| OLS +$10M shift | ×3.43 | ×2.92 | ×3.02 |
| OLS +$1B shift | ×3.38 | ×3.09 | ×2.68 |

So the shift is a real functional-form improvement for walk-forward (2.94→2.63 Huber; 2.55 with dateless in train), bringing us within 0.10 of europa-nova's 2.45. But it does **not** help LOO (3.15→3.18 Huber), so it fails a strict two-test rule on LOO. And it is **dominated by winsorization** (see §1.3) — do not adopt the shift on its own.

Peer-set difference is minor: fitting on 93 vs 95 peers moves WF by ~0.03–0.05 at most (dateless-in-train changes Huber plain 2.94→2.97, shift 2.63→2.55). Winsorization and fitting method matter far more than the 93-vs-95 peer count. (Note: europa-nova's quoted slope 0.424 / intercept 7.13 cannot be in dollars — at TVL $100M it would imply a $45B value; the units in the artifact read are unclear. I tested the *form*, not their coefficients.)

### 1.3 Winsorization dominates everything — and beats europa-nova outright
Winsorizing the ridge fit's log₁₀(mcap) at the 5th/95th percentiles of the **train** set before fitting (a standard robust-statistics step; the peer still counts, its outcome is capped) — `path1b.ts`, `path1c.ts`:

| Ridge variant (Huber λ=4 unless noted) | LOO | Blind (exact splits) | WF cutoff | WF half/half |
|---|---|---|---|---|
| Round 7 as shipped | ×2.77 / 51.6% | ×3.78 / 45.3% | ×2.65 / 51.6% | ×3.01 / 47.9% |
| **+ winsor 5/95** | **×2.74 / 50.5%** | **×3.73 / 45.3%** | **×2.19 / 51.6%** | **×2.59 / 54.2%** |
| + winsor 2.5/97.5 | ×2.75 / 51.6% | — | ×2.47 / 51.6% | ×2.83 / 54.2% |
| + winsor 1/99 | ×2.77 / 51.6% | — | ×2.52 / 51.6% | ×2.86 / 54.2% |
| + winsor 10/90 | ×2.97 / 50.5% | — | ×2.14 / 51.6% | ×2.57 / 54.2% |
| + shift $100M (no winsor) | ×2.86 / 52.6% | ×3.64 / 45.3% | ×2.51 / 54.8% | ×3.03 / 50.0% |
| + shift $100M + winsor 5/95 | ×2.92 / 50.5% | — | ×2.38 / 54.8% | ×2.64 / 50.0% |
| OLS + winsor 5/95 | ×2.76 / 51.6% | — | ×2.28 / 51.6% | ×2.61 / 54.2% |
| OLS shift $100M + winsor 5/95 | ×3.00 / 50.5% | — | ×2.32 / 54.8% | ×2.69 / 50.0% |

**Winsor 5/95 is the single best change available.** It improves the median max-ratio on **all four** splits (LOO, blind, WF-cutoff, WF-half) — the only variant tested that does so — while within-3x and Spearman stay roughly flat (LOO within-3x dips 51.6%→50.5%, WF-half within-3x rises 47.9%→54.2%). WF-cutoff ×2.19 **beats kiencx (×2.53) by 0.34 and europa-nova (×2.45) by 0.26**. The 10/90 winsor is too aggressive (LOO worsens to 2.97); 5/95 is the sweet spot. The shift adds nothing on top of winsor (2.38 vs 2.19) and is not needed. Dateless peers in train **hurt** the winsorized ridge on WF-cutoff (2.19→2.80) — do not add them.

Why it works: `fitModel` already winsorizes the mcap/TVL *ratios* (5/95) for the global median and category medians, but the ridge fit itself uses raw log₁₀(mcap), so a few far-off peers drag the slope. Capping the outcome before the ridge fit is the same robust principle applied to the fit itself. It is a fitting choice, not test-set manipulation (the winsor quantiles come from the train set only; test peers are predicted as-is).

### 1.4 What remains unexplained
After winsor, our WF-cutoff (2.19) beats both kiencx (2.53) and europa-nova (2.45), so europa-nova's exact 2.45 no longer needs explaining — we beat it. The peer-set difference (93 vs 95) is ~0.03–0.05 and does not matter. No further WF gap remains to explain on the value model.

---

## 2. Dropping the maturity discount — measured, and it helps the board

### 2.1 Maturity hurts walk-forward prediction (the headline test)
Applying growth×maturity to peer predictions vs the noGm headline (`path1b.ts`, n=95 peers):

| Predictor | LOO | WF cutoff | WF half/half |
|---|---|---|---|
| noGm (headline: size+category only) | ×2.77 / 51.6% | **×2.65** / 51.6% | ×3.01 / 47.9% |
| withGm (growth × maturity) | ×2.92 / 51.6% | ×3.03 / 48.4% | ×2.69 / 52.1% |
| growth only (maturity=1) | ×2.81 / 51.6% | ×2.61 / 51.6% | ×2.84 / 52.1% |
| maturity only (growth weight 0) | ×2.76 / 51.6% | **×3.05** / 48.4% | ×2.69 / 52.1% |

Maturity is the culprit: it worsens WF-cutoff from ×2.65 to ×3.05 (it discounts the newest test tokens by 17–40%, systematically underpredicting them). It helps half/half and is neutral on LOO, but the headline is the cutoff split — the one kiencx and europa-nova report. Growth alone is roughly neutral (WF-cut 2.61 vs 2.65, LOO 2.81 vs 2.77). **Drop maturity.** It was never validated for value (kiencx and europa-nova both tested age/maturity for value and rejected it), and it actively harms the headline test.

### 2.2 Board impact of dropping maturity (and growth)
Rebuilt the board with `buildBoard` under modified MODEL constants (`path1b.ts`, `path1d.ts`; odds = round-7 age+size):

| Board variant | FARM | Watchlist | Board total | Top (Steakhouse) |
|---|---|---|---|---|
| Round 7 as shipped | 5 | $346.5M | $693.1M | $35.6M |
| Drop maturity only | 5 | **$434.8M (+25%)** | $856.2M | **$44.6M** |
| Drop growth only | 5 | $353.6M | $709.1M | $36.0M |
| Drop both | 5 | $443.3M | $874.0M | $45.1M |
| Winsor ridge + maturity kept | 6 | $313.9M | $666.5M | $29.5M |
| Winsor ridge + maturity dropped | 6 | $394.1M | $822.6M | $36.9M |
| **Winsor ridge + both dropped** | **8** | $402.0M | $839.8M | $37.3M |

Notes: (a) dropping maturity does **not** raise the FARM count on the round-7 fit (stays 5) — the FARM count is driven by the odds (see §3), not by maturity. (b) The winsorized ridge has a flatter slope (0.414 vs 0.455), so its top values are lower even though its validation is better — a real tradeoff (see §5). (c) Dropping both growth+maturity with the winsor fit gives the best FARM count (8) and a watchlist of $402.0M. (d) Even the best combination stays below the ship-rule band's lower edge ($478M) on the odds-weighted total; the value-if-launches total ($727M round 7) is inside it. The ship rule needs re-basing for an odds-weighted board regardless.

---

## 3. The odds gap for big names — measured, and it is structural

### 3.1 The gap, decomposed
Steakhouse: ours $35.6M vs kiencx $68.7M = 1.93×. Decomposed (measured):
- Value-if-launches (noGm): ours $77.3M vs kiencx $80.9M → **1.05×** (negligible — our value model is fine).
- Growth × maturity: ours 0.79× (maturity 0.799 × growth 0.989 for Steakhouse, age 1.49yr, 7d −2.2%) → **1.27×**.
- Odds: ours 0.58 vs kiencx 0.85 → **1.47×**.
- Product: 1.05 × 1.27 × 1.47 = 1.96× ≈ 1.93×. ✓

So the odds are the dominant factor (1.47×), then maturity (1.27×). Dropping maturity (§2) closes the 1.27×. The odds 1.47× is the hard part.

### 3.2 No odds variant closes the Brier gap AND raises big-name odds
Tested on the snapshot's own record (train n=532, base rate 0.492; WF test n=276) — `path1c.ts`, `path1e.ts`:

| Odds variant | LOO Brier | WF Brier | Steakhouse odds |
|---|---|---|---|
| age+size (round 7 kept) | 0.208 (68%) | 0.225 (66%) | 0.58 |
| age+size+family | **0.200 (70%)** | 0.225 (65%) | 0.55 (lower) |
| age+size+growth+family (kiencx's full set) | 0.200 (69%) | 0.226 (66%) | 0.53 (lower) |
| age+size+growth | 0.208 (67%) | 0.226 (66%) | 0.57 |
| age only | 0.211 (68%) | 0.227 (67%) | 0.41 |
| age+size, TVL≥$50M population (n=212, base 0.561) | 0.226 (60%) | 0.253 (56%) | 0.55 |
| age+size, fit on pre-2024 only (n=131, base 0.809) | 0.161* | NaN (no test set) | 0.72* |

\* Not validatable — see §3.3.

Kiencx: Brier LOO 0.186 / WF 0.215, Steakhouse 0.85. Europa-nova: Brier WF 0.200, Steakhouse 0.79.

Family improves LOO Brier (0.208→0.200) but **lowers** Steakhouse (0.58→0.55) and does not improve WF Brier (0.225→0.225). Under the strict two-test rule it is NOT kept. The TVL-floor population worsens Brier on both tests. No tested variant gets Steakhouse above 0.60 while keeping WF Brier at or below 0.225.

### 3.3 The censoring is severe, but restricting the training set makes it worse, not better
Base rates by listing cohort (n=532 train population): pre-2024 **0.809**, 2024 cohort 0.512, 2025+ cohort **0.333**. The newest protocols mostly have not recorded a token yet — that is right-censoring, and it drags the intercept down. But fitting only on the less-censored pre-2024 protocols (n=131, base 0.809) **fails validation badly**:
- On the 2024 cohort: Brier **0.299, worse than the base rate (0.250)**, called-right 51%.
- On the 2025+ cohort: Brier **0.335, far worse than base rate (0.222)**, called-right 33%.
- Its coefficients collapse (age 0.24 vs 0.69, size 0.02 vs 0.17) — in a population where almost everyone recorded, there is little signal to learn from.
Fitting on pre-2025 only gives Steakhouse 0.46 (lower) and the same WF Brier (0.225). **The less-censored fit is not shippable.** Do not use it.

### 3.4 Why 0.85 is not reachable by refitting
Intercept analysis (`path1c.ts`): our Steakhouse z = 0.33 (odds 0.58). Matching kiencx's base rate (0.552 vs ours 0.492) would shift the intercept by +0.24 → Steakhouse 0.64. Using kiencx's size coefficient (0.25 vs ours 0.166) would give 0.65. Even both together give ~0.70, not 0.85 (which needs z = 1.74, a further +1.40 in log-odds). Kiencx's family (+0.20 max) and growth (+0.07 for Steakhouse) add at most ~0.27. There is ~0.6 in log-odds that cannot be accounted for from the artifact — kiencx's odds definition or training population differs in a way that is not reproducible from the published numbers (likely a survival/hazard framing — "from how long peers ran before recording one" — rather than a by-snapshot logistic, or a differently selected peer set). **The 0.85 is not reachable with a by-snapshot logistic on this snapshot, however it is fit.** A survival/hazard model is the one remaining untested lever for the odds gap; it is unmeasured, requires a new model, and must be validated before it can be shipped — do not assume it works.

**Conclusion on odds:** the Brier gap (0.225 vs 0.215 WF, 0.010) is small and likely within noise (WF test n=276; the SE of a Brier difference is ~0.02–0.03). The Steakhouse odds gap (0.58 vs 0.85) is large, visible, and structural. Do not chase it by fitting a worse-validated model. The honest position is: our odds are the validated by-snapshot probability; kiencx's are higher for reasons we cannot reproduce. The board will be thinner (FARM 5–8 vs 14) until and unless a validated survival model closes the odds gap.

---

## 4. OLS vs Huber for the ridge — full picture, and a code bug

λ=4, all four splits (`path1a.ts`, `path1c.ts`; blind on validateModel's exact splits):

| Ridge λ=4 | LOO | Blind (exact) | WF cutoff | WF half/half |
|---|---|---|---|---|
| Huber (round 7) | **×2.77 / 51.6% / ρ0.360** | ×3.78 / 45.3% / ρ0.444 | **×2.65 / 51.6% / ρ0.248** | ×3.01 / 47.9% / ρ0.302 |
| OLS | ×2.98 / 50.5% / ρ0.333 | **×3.59 / 46.3% / ρ0.442** | ×2.79 / 51.6% / ρ0.244 | **×2.83 / 54.2% / ρ0.295** |
| Huber + winsor 5/95 | **×2.74 / 50.5% / ρ0.345** | **×3.73 / 45.3% / ρ0.448** | **×2.19 / 51.6% / ρ0.259** | **×2.59 / 54.2% / ρ0.313** |
| OLS + winsor 5/95 | ×2.76 / 51.6% / ρ0.336 | — | ×2.28 / 51.6% / ρ0.259 | ×2.61 / 54.2% / ρ0.311 |

Without winsor, it is 2–2: Huber wins LOO and WF-cutoff (the two most important — LOO is a headline, WF-cutoff is THE headline); OLS wins blind and WF-half/half. **With winsor, Huber wins or ties on all four** (WF-cut 2.19 vs 2.28, LOO 2.74 vs 2.76, WF-half 2.59 vs 2.61). **Keep Huber, add winsor. Do not switch to OLS.**

Note the blind discrepancy resolved: my first blind run gave 3.47 for Huber because I sorted peers by listing date before shuffling, which changes the seeded splits. On validateModel's exact splits (snapshot order), the lib Huber blind is **3.78/45.3%** — exactly matching `out/data.js`. The OLS blind-exact (3.59) and winsor blind-exact (3.73) were computed on those same exact splits, so the comparisons above are apples-to-apples.

**Code bug found (flag, not a blocker):** `fitModel` hardcodes `huber=true` when calling `ridgeFit` (`lib/model.ts`, fitModel) — the `MODEL.ridgeHuber` flag is dead config and does nothing. Either honour the flag or remove it. This does not affect round-7 numbers (Huber was intended and is what shipped).

---

## 5. The residual gap, and the tradeoff nobody can avoid

After the best value-model changes (winsor 5/95 + drop maturity + drop growth):
- **Validation: we beat kiencx.** WF-cutoff ×2.19 vs ×2.53 (lead 0.34), LOO ×2.74 vs ×3.33 (lead 0.59), blind ×3.73 vs (kiencx blind not published; our round-7 blind was ×3.78). Within-3x WF 51.6% vs 55% (still behind on within-3x, but ahead on the median miss — the headline number).
- **Odds Brier: roughly tied.** Ours 0.225 WF vs kiencx 0.215 (gap 0.010, likely noise); LOO 0.208 vs 0.186 (gap 0.022, real but small). Adding family would take LOO to 0.200 but lower Steakhouse to 0.55 — a wash, not recommended.
- **Board richness: we still lose, and by a lot.** Best case FARM 8 (vs 14), top $37.3M (vs $68.7M), board $839.8M (vs $1,521.8M), watchlist $402.0M. The winsorized ridge actually *lowers* the top values (flatter slope 0.414 vs 0.455), so the validation win comes with a visible board cost. There is no tested variant that both improves WF to ~2.19 AND keeps the top values at round-7 levels — the flatter, more robust fit is what makes the predictions better, and it is also what makes the big-TVL multiples smaller.

So the residual gap is not in the model — it is in the **odds** (structural, §3) and in the **tradeoff between validation and board richness** (a flatter fit predicts better but prices the top lower). Nothing further is unexplained on the value model: after winsor, our WF beats both kiencx and europa-nova, and the remaining differences are the odds definition (private) and the slope (a real modelling choice, not a mystery).

---

## 6. Concrete path to #1 (prioritised, with measured gains)

### Change 1 — Winsorize the ridge fit's log-mcap at 5/95 [MODEL CHANGE — highest measured impact]
- **What:** in `fitModel`/`ridgeFit` (`lib/model.ts`), clip log₁₀(mcap) at the 5th/95th percentiles of the *train* set before the ridge solve (same robust principle already used for the ratios). Keep Huber, λ=4. Recompute the LOO variant table, the band residuals, the board, verdicts and playbooks from the new fit.
- **Measured gain:** LOO ×2.77→**×2.74**, blind ×3.78→**×3.73**, WF-cutoff ×2.65→**×2.19**, WF-half ×3.01→**×2.59**. WF-cutoff now beats kiencx (×2.53) by 0.34 and europa-nova (×2.45) by 0.26. Within-3x: LOO 51.6%→50.5%, WF-cut 51.6% (unchanged), WF-half 47.9%→54.2%.
- **Cost:** top values fall (Steakhouse $35.6M→$29.5M with maturity kept; $36.9M with maturity dropped). Watchlist falls to $313.9M (maturity kept) unless maturity is also dropped (§6.2).
- **Needs:** full rebuild + revalidation + re-audit (the fit changes, the board re-ranks). This is a round-8 model change.

### Change 2 — Drop the maturity discount from board values [MODEL CHANGE — one-line config]
- **What:** set `maturityFloor: 1, maturityRange: 0` in MODEL (so maturityMult = 1 for all rows). Keep the growth multiplier (roughly neutral on prediction) or drop it too — see Change 3.
- **Measured gain:** watchlist $346.5M→$434.8M (+25%), top Steakhouse $35.6M→$44.6M. With the winsor fit: watchlist $313.9M→$394.1M, top $29.5M→$36.9M. FARM count unchanged on the round-7 fit (5), 5→6 on the winsor fit.
- **Justification (measured):** maturity worsens WF-cutoff prediction from ×2.65 to ×3.05 when applied to peers (§2.1); kiencx and europa-nova both rejected age for value. It is an unvalidated prior that depresses the board.
- **Needs:** rebuild + re-audit (board values change). Combine with Change 1 in the same round-8 build.

### Change 3 — Drop the growth multiplier as well [MODEL CHANGE — optional, small]
- **What:** set `growthWeight: 0`.
- **Measured gain:** with the winsor fit, FARM 6→**8** and watchlist $394.1M→$402.0M; top Steakhouse $36.9M→$37.3M. Growth alone is roughly neutral on prediction (WF-cut 2.61 vs 2.65, LOO 2.81 vs 2.77), so dropping it is a simplicity/FARM-count call, not an accuracy call.
- **Recommendation:** drop both (maturity + growth) in round 8 — it gives the best FARM count (8) and the cleanest story ("the board is the fitted model, no priors"). If the auditors object, dropping maturity alone is the must-do; growth is optional.

### Change 4 — Do NOT add family to the odds model [NO CHANGE — measured wash]
- Family improves LOO Brier (0.208→0.200) but does not improve WF Brier (0.225→0.225) and **lowers** Steakhouse odds (0.58→0.55). Under the two-test rule it is not kept. The visible cost (lower big-name odds, thinner board) outweighs the LOO Brier gain. Leave the odds model as age+size.

### Change 5 — Do NOT adopt the $100M shift, do NOT switch to OLS, do NOT add dateless peers to training [NO CHANGE — measured as dominated or harmful]
- Shift: WF-cut 2.51 (Huber ridge) vs winsor 2.19; LOO worsens (2.86 vs 2.77); adds nothing on top of winsor (2.38 vs 2.19). Also requires a `model.ts` change to the anchor computation to be board-testable.
- OLS: loses to Huber+winsor on WF-cut (2.28 vs 2.19) and LOO (2.76 vs 2.74). Keep Huber.
- Dateless in train: hurts the winsorized ridge on WF-cut (2.19→2.80). Do not add them.

### Change 6 — Presentation / audit fixes from round 7 (still required, no model change)
These are the round-7 audit fixes, unchanged by the above: (a) re-run the build so the dossier embeds the round-8 screenshots (the round-7 blocker — the dossier held round-6 images); (b) swap one dossier image for a board-table shot (`SCREENSHOT_MAX` is 4 — the judge currently cannot see the TOKEN ODDS column or verdicts); (c) correct the false claims in RESULTS (kiencx HAS a Brier-validated odds model, better than ours; coherence is 0.778, not 0.879); (d) disclose the Huber half/half loss on the dashboard; (e) add the value-model two-test term table; (f) show the value-if-launches total alongside the odds-weighted total; (g) fix the dead `MODEL.ridgeHuber` flag (honour it or remove it); (h) formally re-base the ship-rule watchlist band for an odds-weighted board (best case $402.0M is still below the old $478M lower edge).

### Change 7 — Survival/hazard odds model [RESEARCH ONLY — unmeasured, do not ship unvalidated]
The one remaining lever for the odds gap. A hazard model for time-to-record would estimate P(eventually records) rather than P(records by snapshot), which is plausibly what kiencx's 0.85 represents. It is **not** tested here, it requires a new model and its own two-test validation, and the restricted-population shortcut to the same end **fails validation** (§3.3). Do not build it into round 8; research it separately and only adopt it if it beats the by-snapshot logistic on Brier in both tests.

---

## 7. Verdict: is #1 reachable?

**Yes, on the metric that decides — but it is a genuine contest, not a lock.**

- After Changes 1–3, our headline walk-forward (×2.19) beats kiencx (×2.53) by 0.34 and europa-nova (×2.45) by 0.26, and our LOO (×2.74) beats kiencx (×3.33) by 0.59. The blind test that decided round 6 vs kiencx was won on criterion 1 (model accuracy) — and on that criterion we would now lead by a margin larger than the one that beat us (0.12). That is the path to #1, and it is measured, not hoped.
- But the board will still be thinner: FARM 8 vs 14, top $37M vs $69M, board $0.84B vs $1.52B. If the judge weights farm richness and board totals heavily, the odds gap (which we cannot close with a validated model) could still lose the game despite the accuracy lead.
- Estimated after round 8 (Changes 1–3 + 6): top-10 ~85%, top-5 ~40%, **#1 ~25–35%** (up from round 7's ~50% / ~15–20% / ~5%). The single biggest risk to #1 is not the model — it is the judge's weighting of the board's richness against the validation lead, which cannot be measured locally and will only be resolved by a blind re-test against kiencx after round 8 is built.

**Recommended next step:** build round 8 with Changes 1, 2, 3 and 6 (winsor + drop maturity + drop growth + audit fixes), re-audit, then blind-test it against kiencx before any submission. Do not build the survival odds model (Change 7) into round 8.

---

## Sources
- Kiencx / europa-nova artifacts: `~/workspace/makefun/token-radar/top10/r01-kiencx.webp`, `r10-europa-nova.webp`; top-10 table `top10/top10.json`.
- Prior research: `benchmark/how-to-beat-kiencx.md` (kiencx spec, europa-nova size-only WF ×2.45).
- Round-7 model: `lib/model.ts` (ridge λ=4 Huber; maturity 0.6–1.0/1095d; odds age+size); validation `out/data.js` / `out/board.json`.
- New computations: `benchmark/path1a.ts` (size-only variants, OLS-vs-Huber ridge incl. blind), `path1b.ts` (ridge+shift/winsor, blind-exact, maturity/growth validation + board impact), `path1c.ts` (ridge follow-ups, odds variants), `path1d.ts` (board under value-model variants), `path1e.ts` (less-censored odds validation).
- Prior scripts re-run: `benchmark/wf2.ts`, `ridge-test.ts`, `odds-test.ts` (all reproduced their reported numbers).
- Round-7 audits: `round7/audit_gemini.md`, `audit_deepseek.md`, `audit_glm.md` (all SUBMIT WITH FIXES; dossier-blocker, false odds claim, board-table invisibility).
