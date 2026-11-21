# How to beat kiencx (#1, "Launch Radar v4") — research report

**Date:** 2026-11-21. **Competition:** make.fun token-radar-01. **Our entry:** Tidegauge, round 6 (unsubmitted). **Benchmark:** kiencx, "Launch Radar v4", judge 966,767 (20W/0D/0L). Top-10 bar 960,454 (europa-nova); top-20 958,033.
**Method:** read kiencx's artifact image (the dashboard the judge scored) and the other top-10 artifacts; read our model code and validation; computed our model's walk-forward accuracy on our own data with our own code (scripts `benchmark/wf.ts`, `benchmark/wf2.ts`, run with node v22.23.5 against the sealed snapshot). No files modified, nothing submitted.

**Bottom line up front:** the accuracy gap is real, it is specific to walk-forward (time-based) prediction, and it is caused by our category term. Our model beats kiencx on leave-one-out (LOO median max-ratio ×2.96 vs ×3.33; within-3x 50.5% vs 45%) but loses badly on walk-forward (×3.43 vs ×2.53 on the 2025 cutoff; ×4.05 vs ~×2.5 on older-half/newer-half). The category multiple — a shrunk median fitted in a separate two-stage step — helps LOO and hurts walk-forward. A jointly-fit ridge regression (kiencx's structure) fixes most of it on our own data: walk-forward ×3.43 → ×2.79 (2025 cutoff) and ×4.05 → ×2.83 (half/half), with LOO unchanged. That is the single biggest measured change available. Two further real gaps are structural, not presentation: we have no token-odds model at all, and we have no 758-protocol accounting bar.

---

## 1. Kiencx's model spec (extracted from `top10/r01-kiencx.webp`)

The artifact is a single 1024×1024 dashboard image. All numbers below are read from it.

### Headline (KPI strip)
- Out-of-sample miss, walk-forward: **×2.53 vs ×4.37 flat**. Footnote: "a flat cap/TVL multiple misses by ×4.37; leave-one-out ×3.33 vs ×4.38".
- Range honesty: **57% · 76%** — "of later-listed caps fall inside P25–P75, P10–P90 (stated 50% · 80%)".
- Token odds vs base rate, Brier: **0.215 vs 0.320** — "walk-forward; 86% of later peers called right vs 34%".
- Terms that survived both tests: **2 of 6 · 4 of 5** — "value model · token odds; the rest are shown below, not used".
- Worth farming, this scenario: **14 of 198** — "net beats a T-bill and $25 an hour; 159 marginal, 25 skip".
- Watchlist ranked: **40/40** — "plus 158 pre-token protocols it leaves out".

### Definition
"Implied value = TVL × fitted multiple (the value if a token launches) × token odds (from how long peers ran before recording one). Each coefficient is fitted on this snapshot and tested held-out."

### Protocol accounting (all 758 in exactly one group)
"all 758 snapshot protocols in exactly one group: 198 ranked as pre-token, 416 already record a token, 144 left out by the house list's own rules."
Breakdown: Ranked · watchlist 40; Ranked · early, below the floor 138; Ranked · off-list, parent recorded 20; Token trades · priced comp 110; Token recorded · no usable cap 306; Out · bridge 43; Out · liquid staking 43; Out · exchange 42; Out · versioned or wrapped 16.
Integrity strip: "this table = board.json: 198 of 198 rows recomputed here / ranks 1–198 in order, values never rise / totals equal: $1,521,754,662 / checksum 16f88102 = main.ts / watchlist 40 of 40 ranked / ledger 758 of 758 protocols".

### Out-of-sample evidence — the two-test rule
"A term is kept only if it lowers the held-out miss in both tests: leave-one-out, and walk-forward (tokens listed earlier price those listed later)."

**Value if a token launches — typical miss, 98 traded tokens:**

| Term, added in order | Leave-one-out | Walk-forward | Status |
|---|---|---|---|
| flat median multiple | ×4.38 | ×4.37 | baseline |
| + size curve, in TVL | ×3.41 | ×2.62 | kept |
| + family effect · ridge 16 | ×2.95 | ×2.85 | tested, not kept |
| + category effect · ridge | ×3.33 | ×2.53 | kept |
| + 7-day TVL growth | ×3.39 | ×2.74 | tested, not kept |
| + age, years listed | ×3.15 | ×2.42 | tested, not kept |
| + chain count, ln | ×3.43 | ×2.60 | tested, not kept |
| + control: growth of another row | ×3.39 | ×2.79 | must not help |

Note the discipline: family effect has the best LOO (×2.95) but is NOT kept — it does not lower the miss in both tests relative to the kept set (its walk-forward ×2.85 is worse than the final ×2.53). Age has the best walk-forward (×2.42) but is NOT kept — its LOO (×3.15) does not beat the kept set's path. The final kept value model is size curve + category effect (ridge): LOO ×3.33, WF ×2.53.

**Token odds — Brier score (share called right), 442 peers:**

| Term, added in order | Leave-one-out | Walk-forward | Status |
|---|---|---|---|
| base rate of peers | 0.248 (55%) | 0.320 (34%) | baseline |
| + age, years listed | 0.194 (78%) | 0.227 (63%) | kept |
| + family effect · ridge 16 | 0.192 (71%) | 0.225 (64%) | kept |
| + size curve, in TVL | 0.188 (71%) | 0.218 (64%) | kept |
| + 7-day TVL growth | 0.186 (72%) | 0.215 (65%) | kept |
| + chain count, ln | 0.186 (72%) | 0.217 (65%) | tested, not kept |
| + control: growth of another row | 0.187 (72%) | 0.216 (65%) | must not help |

Final odds Brier: 0.186 LOO / 0.215 WF (base rate 0.248 / 0.320).

**Is the printed range honest?**

| | Leave-one-out | Walk-forward |
|---|---|---|
| within ×3 of the model | 45% | 55% |
| inside P25–P75, stated 50% | 49% | 57% |
| inside P10–P90, stated 80% | 78% | 76% |

Fitted coefficients (± bootstrap s.e., 200 refits): "multiple at $100M TVL ×0.05, size 0.516 ± 0.51 x 0.10; category effects ×0.94 to ×1.07. Odds: by logits: years listed +0.64 x 0.08, TVL +0.25 x 0.08, 7-day growth −3.3 x 1.5; families −0.28 to +0.20."
Reading note: "7-day growth and age do not fall to price a token when they leave them out; both help which peers record a token, so they enter through the odds. The odds are the peers' record (244 of 442 record a token, more with each year listed), not a forecast: the page never says a token will launch."

### Board
Filters: All 198, Farm 14, Marginal 159, Skip 25, All tiers, Watchlist, Early (< $50.0M), Off-list, Deposit, plan size 0.02% of TVL, Drop share 7.0%, Horizon 12 wk. Columns: rank, RANGE, PROTOCOL, TVL, 7D, NO-TOKEN AGE, TOKEN ODDS, IF IT LAUNCHES, IMPLIED VALUE, P25–P75, VERDICT · NET OF FEES, NET / HOUR. Every visible row carries a verdict (MARGINAL / SKIP / FARM), net of fees and net/hour. Example row 1: Steakhouse Financial, Watchlist, $2.75B TVL, −2.2%, 1.5 yr, 85% odds, $80.9M if it launches, $68.7M implied, $20.9M–$236M P25–P75, MARGINAL $15, $4.36/h.
Verdict rule (stated on the board): net beats a T-bill and $25 an hour.

### What "miss" means (definition check)
Kiencx's "typical miss" is the median max-ratio, max(pred/actual, actual/pred) — the same definition as our "median error (max-ratio)". Evidence: kiencx's flat baseline is ×4.37–4.38. Our flat max-ratios are ×4.11 (0.25x, LOO), ×4.70 (blind), ×5.00 (global median, LOO), ×5.35 (time split). Our flat 1+MdAPE is ×1.89–2.01 — nowhere near 4.37. So the 4.37 flat is a max-ratio, and the comparison below is apples-to-apples on the metric.

---

## 2. Term-by-term comparison (kiencx vs ours)

Our model (`lib/model.ts`, `MODEL_VERSION` radar-5-huber): implied = TVL × shrunk category multiple × size factor × growth × maturity. Category multiple = shrunk median (w = n/(n+5) toward global median 0.204; w = 0 when n < 3). Size factor = (TVL / category median TVL)^(sizeB − 1), sizeB = 0.508 (Huber IRLS δ=1.0 on log10(mcap) vs log10(TVL), intercept 3.138, R² = 0.165). Growth = 1 + clamp(change_7d, −60, 120)/100 × 0.5. Maturity = 0.6 + min(age, 1095)/1095 × 0.4. Fit peers n=95 (of 128 universe; 33 excluded for no listed_at). **Headline validation uses the noGm predictor** (growth and maturity excluded) — so our headline is size + category, same basis as kiencx's kept value model.

| Term / feature | Kiencx | Ours | Verdict |
|---|---|---|---|
| Size curve (log mcap on log TVL) | Yes, slope 0.516. Kept. | Yes, slope 0.508 (Huber). | Same. Slopes agree to 0.008. |
| Category effect | Ridge (jointly fit with the size curve), effects ×0.94–×1.07. Kept. | Shrunk category median multiple, two-stage (fit separately, then size factor anchored to category median TVL). | **Different estimation. Ours hurts walk-forward (see §3).** |
| Family effect | Ridge 16. Tested for value, NOT kept (LOO ×2.95 but WF ×2.85 worse than final ×2.53). Kept for odds. | Absent entirely. | We have no family term in either model. |
| 7-day TVL growth | Tested for value, NOT kept. Kept for odds (logit −3.3). | In the value model (weight 0.5), but EXCLUDED from headline validation (noGm). | Ours includes it in board values; kiencx excludes it from value, uses it only in odds. |
| Age / years listed / maturity | Tested for value, NOT kept (best WF ×2.42 but LOO ×3.15). Kept for odds (logit +0.64). | Maturity factor in the value model (0.6–1.0 over 1095d), but EXCLUDED from headline validation (noGm). | Same pattern as growth: in board values, out of the headline. |
| Chain count | Tested, NOT kept (both models). | Absent. | Agree (not used). |
| Control term ("growth of another row") | Tested, must not help. | Absent. | Kiencx has a placebo check; we have none. |
| Token-odds model | Yes. Logistic (age, family ridge, size, growth). Brier 0.215 WF / 0.186 LOO. Per-row TOKEN ODDS column; implied value = value-if-launches × odds. | **No.** Our only "odds" is breakevenOdds = P(implied ≥ breakeven) under the band — a different quantity. Our implied value has no probability weighting. | **Real structural gap.** |
| Range / band honesty | Within-×3 45% LOO / 55% WF; P25–P75 49%/57%; P10–P90 78%/76%. | LOO within-3x 50.5%; blind 80% band covers 82.1%, 50% band 45.3%; time-split 80% band 74.2%, 50% band 32.3%. | Ours is better on LOO within-3x (50.5% vs 45%) and on blind band coverage; worse on WF within-3x (41.9% vs 55%). |
| Two-test term table | Yes, prominent (LOO + WF, kept / tested-not-kept / must-not-help). | No. We have a LOO variant table (flat / global / size-only / damped / adopted) but no walk-forward term table and no kept/not-kept discipline. | Presentation + rigour gap. |
| 758-protocol accounting | Yes, prominent bar + integrity strip (checksum, recomputed rows, ledger). | **No.** Zero occurrences of "758" in `dashboard/app.js`. We state "416 record a token; only 144 carry a market cap" and the fit-peer/universe counts, but there is no "all 758 in exactly one group" breakdown. | **Real completeness gap.** |
| Worked example | No prominent one on kiencx (formula stated in one line). | Per-row detail view shows the decomposition; no prominent board-level worked example. | Neither has it prominently. (Europa-nova does — see below.) |
| Farm verdicts | MARGINAL / SKIP / FARM; rule "net beats a T-bill and $25/hour"; per-row net of fees + net/hour; 14 FARM. | FARM / THIN / SKIP (+ P25-POSITIVE subset); rule NetEV ≥ $40 and ≥1.5× cost; per-row Net EV, BE odds, Net $/h, Fees·Hold; 11 FARM; 7 fully costed playbooks with fee splits. | Ours is deeper on costing (playbooks). No farm gap. |

### The rest of the top tier (for context — same pattern)
- **Europa-nova (#10, 960,454, the immediate bar):** value model is size-curve ONLY (all other terms tested, NOT kept — including category ridge 8, curvature, family size, 7-day growth, years listed, chain count). WF ×2.45, LOO ×3.96, on "the 31 since" 2025-01-23. Brier 0.200 WF (odds: years listed, ln TVL, 7-day growth, category ridge 2 — all kept). Range 58% in P25–P75. 12 FARM. Has the 758 accounting, a "PROOF IT WORKS" strip (checksum, 198/198 recomputed, 9/9 invariants), and a worked example (row 1 Steakhouse worked through model.js). Implied = value-if-launches × odds × own-token share.
- **Nyx77 (#2, 964,424):** size curve + category premium. LOO ×3.21, WF ×2.60 (flat ×4.52). Range holds 45%. Odds held out 70% called right (309/442). Walk-forward defined as "35 tracked longest listed before 2024-07-15 fit the model that prices the 35 newer ones".
- **Sudhan (#3, 962,052):** formula 10^3.34 × TVL^0.477 × sector × momentum × age × kinship. LOO ×2.92, older→newer ×2.40. Range holds 50%. 66 FARM (looser rule).
- **Brisk-kestrel-93 (#5, 962,052):** size curve log₁₀ V = 7.13 + 0.424 log₁₀(TVL + $100M), Huber on 92 tokens, + growth carry + seasoning. LOO 3.42×, WF 2.30× (best WF in the top 10). Family offsets tested, NOT kept (lost the WF test). "Top 20 kept" stability check (ablate: without family 17, without growth 19, without seasoning 15, plain OLS 20, one flat multiple 17; 19 of 20 hold in ≥80% of 200 refits).

**Pattern across the top tier:** every top-10 entry (a) validates each term in TWO tests (LOO + walk-forward) and keeps a term only if it wins both, (b) has a Brier-scored token-odds model with its own two-test table, (c) shows the full 758-protocol accounting with an integrity strip, (d) leads with the walk-forward miss. Our entry does (d) only partially (we lead with blind) and lacks (b) and (c) entirely.

---

## 3. The apples-to-apples walk-forward number for OUR model

### Our measured numbers (from `out/data.js`, built from the real snapshot; recomputed and confirmed by `benchmark/wf.ts` / `wf2.ts`)

| Test | Ours (median max-ratio) | Flat on same split | Within-3x (ours / flat) | Spearman (ours / flat) |
|---|---|---|---|---|
| LOO (n=95) | **×2.96** | ×5.00 (global median) / ×4.11 (0.25x) | 50.5% / 37.9% | 0.340 / 0.396 |
| Blind 80/20 ×5 (n=19/split) | ×3.97 | ×4.70 | 42.1% / 36.8% | 0.371 / 0.504 |
| **Time split = walk-forward** (fit <2025-01-01, test ≥2025-01-01, n=31) | **×3.43** | ×5.35 | 41.9% / 35.5% | 0.184 / 0.244 |
| Older-half / newer-half (train 47, test 48) | ×4.05 | ×5.29 | 41.7% / 33.3% | 0.160 / 0.352 |
| Oldest-35 / newest-35 | ×4.28 | ×5.33 | 34.3% / 28.6% | 0.225 / 0.273 |
| Cutoff 2024-07-15 (train 53, test 42) | ×4.24 | ×5.25 | 38.1% / 33.3% | 0.166 / 0.276 |

### Is the gap real or a test-setup artifact?
**Real — and it is specific to walk-forward.** Three independent checks:
1. **Same test set, different model.** Europa-nova scores its walk-forward on "the 31 since" 2025-01-23 — the same 31 newest tokens as our time split (my A2 run with the 2025-01-23 cutoff gives identical numbers to the 2025-01-01 cutoff). On those same 31 tokens, europa-nova's size-curve-only model gets ×2.45; ours gets ×3.43. Same test set, 0.98 gap. Not a test-set artifact.
2. **Same metric.** Both use median max-ratio (see §1, definition check). Not a metric-definition artifact.
3. **The gap is WF-only.** On LOO we BEAT kiencx (×2.96 vs ×3.33; within-3x 50.5% vs 45%). On blind random splits we are mid-pack (×3.97). The deficit appears only when the test set is newer than the train set. That is a time-generalisation failure, not a general accuracy failure.

### What causes it — measured decomposition (`benchmark/wf2.ts`, same splits, same data)
| Variant | WF 2025 cutoff (n=31) | WF half/half (n=48) | LOO (n=95) |
|---|---|---|---|
| FULL (ours: size + shrunk-median category) | ×3.43 / 41.9% / ρ 0.184 | ×4.05 / 41.7% / ρ 0.160 | ×2.96 / 50.5% / ρ 0.340 |
| SIZE-ONLY (no category term) | ×2.94 / 51.6% / ρ 0.244 | ×3.11 / 45.8% / ρ 0.352 | ×3.15 / 48.4% / ρ 0.359 |
| CAT-ONLY (shrunk median, no size curve) | ×4.89 / 32.3% / ρ 0.276 | ×5.24 / 33.3% / ρ 0.302 | ×4.01 / 38.9% / ρ 0.359 |
| **RIDGE (log mcap on log TVL + ridge-shrunk category offsets, jointly fit)** | **λ=4: ×2.79 / 51.6% / ρ 0.244; λ=16: ×2.80 / 51.6% / ρ 0.258** | **λ=4: ×2.83 / 54.2% / ρ 0.295; λ=16: ×2.85 / 52.1% / ρ 0.337** | **λ=4: ×2.98 / 50.5% / ρ 0.333; λ=16: ×3.09 / 49.5% / ρ 0.356** |

Reading:
- **The category term as we implement it hurts walk-forward and helps LOO.** Dropping it (size-only) improves WF by 0.49 (2025 cutoff) and 0.94 (half/half) but worsens LOO by 0.19. Category multiples drift over time: a category's median multiple fitted on older tokens does not carry to newer tokens. That is exactly why kiencx's two-test rule exists, and our category term would FAIL it (it lowers LOO but raises WF).
- **The ridge category effect (kiencx's structure) dominates our current model.** Jointly fitting the size slope and the category offsets with ridge shrinkage improves WF by 0.64 (2025 cutoff) and 1.22 (half/half) while LOO is unchanged (×2.98 vs ×2.96, within-3x 50.5% vs 50.5%). The gain is robust across λ (1, 4, 16, 64 all give WF 2.79–2.99 on the 2025 cutoff and 2.83–2.99 on half/half), so it is not a λ-tuning artifact. λ=4 is best on both splits.
- **Ridge still does not reach europa-nova's 2.45** on the same 31 tokens (ridge 2.79 vs 2.45). The remaining 0.34 is unexplained from the artifacts: likely peer-set differences (europa-nova fits 93 traded tokens; we fit 95) and/or fitting differences (OLS vs Huber, winsorization) that cannot be seen because the top entries' repos are private. Flagged as an open question, not assumed.
- **Our Spearman is weak on walk-forward** (0.184 on the time split, 0.160 half/half) and flat out-ranks us on blind splits (0.504 vs 0.371). Ridge improves WF Spearman (0.244–0.295 on the 2025 cutoff, 0.295–0.337 half/half). The dashboard already states the Spearman weakness honestly (method tab); the ridge change improves it.

### A note on the paired CI (honesty check)
`lib/model.ts` carries a comment claiming the paired 95% CI for the blind median advantage "sits entirely below zero". The computed values in `out/data.js` are flatBlindCiLo = −0.5811, flatBlindCiHi = +0.3586 — the interval CROSSES zero. The dashboard states this correctly (method tab: "it crosses zero, so the median advantage is not established on the blind splits; the advantage that holds up is on within-3x"). So the dashboard is honest; only the code comment is stale. One-line fix, no user-facing effect.

---

## 4. Prioritised changes (by expected impact)

### #1 — Replace the two-stage category model with a jointly-fit ridge regression [MODEL CHANGE — highest measured impact]
- **What:** replace `fitModel` / `categoryMultiple` / `impliedValue`'s category handling with a joint ridge fit: log10(mcap) = a + b·log10(TVL) + per-category offsets, ridge penalty λ on the offsets only (intercept and slope unpenalised), categories with <3 peers get offset 0 (same minPeers rule). Keep the Huber size-curve idea only if it survives the two-test check — the ridge fit in `wf.ts` used OLS inside the ridge solve; whether to Huber-weight it should itself be tested in LOO + WF (brisk-kestrel keeps Huber weights because they win WF 2.30×; kiencx does not state Huber for the ridge). Growth and maturity stay as they are (board-value multipliers, excluded from the headline, matching kiencx's treatment of growth/age).
- **Evidence:** measured on our own data (§3). WF 2025 cutoff ×3.43 → ×2.79 (λ=4); WF half/half ×4.05 → ×2.83; WF within-3x 41.9% → 51.6% (cutoff), 41.7% → 54.2% (half/half); LOO unchanged ×2.96 → ×2.98, within-3x 50.5% → 50.5%. Kiencx's kept value model is exactly this structure (size + category ridge, WF ×2.53).
- **Needs:** code change in `lib/model.ts` (fit, implied value, the dashboard's `impliedOf` recomputation, the LOO variant table, the band residuals). No new data — same snapshot, same 95 fit peers. Full rebuild + revalidation (LOO, blind, time-split, bands, board, verdicts, playbooks) because the implied values change and the board re-ranks.
- **Expected gain:** MEASURED on WF (above). In judge terms it moves our headline WF miss from ×3.43 (worse than every top-10 entry's 2.30–2.60) to ×2.79 (inside the top-10 range, 0.26 behind kiencx's 2.53 and 0.34 behind europa-nova's 2.45). It does not by itself put us at #1 — the residual 0.26–0.34 to the top two is unexplained (peer-set/fitting differences, private repos) — but it closes ~70% of the WF gap and takes our WF within-3x to ~52–54%, essentially kiencx's 55%.
- **Risk:** the board re-ranks (different implied values → different ranks, watchlist total, verdicts, playbooks). The 7 playbooks and the P25-POSITIVE counts must be recomputed and re-audited. This is a new model round, not a presentation fix — it needs the full audit loop again (Gemini/DeepSeek/GLM) and a fresh transcript-gate check before any submit.

### #2 — Add a Brier-scored token-odds model [MODEL ADDITION — structural gap, unmeasured judge gain]
- **What:** a logistic regression for P(protocol ever records a token), fitted on the snapshot's own record (442 peers in kiencx's counting: 244 record a token; our snapshot has 758 protocols, 416 record a token). Candidate terms, in kiencx's order: age/years listed, family effect (ridge), size curve (ln TVL), 7-day TVL growth; chain count tested. Validate in both tests (10-fold/LOO + walk-forward) with a Brier score and a share-called-right, and a term table with kept/tested-not-kept. Show a per-row TOKEN ODDS column and multiply the implied value by the odds (kiencx: implied = value-if-launches × odds; europa-nova: × odds × own-token share).
- **Evidence:** every top-10 entry has it (kiencx Brier 0.215 WF / 0.186 LOO; europa-nova 0.200 WF; nyx77 70% called right; sudhan's formula includes kinship/age). We have none — our implied value is the value IF a token launches, with no probability weighting, so our top values are not on the same footing as theirs (e.g. Steakhouse: ours $55.8M with no odds; kiencx $68.7M = $80.9M × 85%; europa-nova $57.8M = $73.3M × 79%).
- **Needs:** new model code (logistic regression + Brier + two-test validation). No new data — listed_at and token status are already in the snapshot. But it changes every implied value (multiplied by odds < 1), so the board re-ranks and the verdicts/playbooks recompute. Significant work; must be validated before it is shown (a bad odds model is worse than none — it would shrink the board's values without evidence).
- **Expected gain:** UNMEASURED (no way to convert a new model component into judge points without building and testing it). It is a visible column the judge compares directly, and it is the single biggest structural difference between our board and every top-10 board. Rank it second only because #1 is measured and this is not.

### #3 — Add the 758-protocol accounting bar + integrity strip [PRESENTATION — cheapest high-visibility fix]
- **What:** a bar on the board tab showing all 758 snapshot protocols in exactly one group (ranked watchlist 40, ranked early 138, ranked off-list 20, token trades priced comp, token recorded no usable cap, out bridge, out liquid staking, out exchange, out versioned/wrapped — the exact groups are computable from the snapshot's own fields: pre-token vs token, category, chains, versioned-name rule), plus an integrity strip: "N of N rows recomputed here", "ranks 1–N in order, values never rise", "totals equal", "checksum = main.ts", "watchlist 40 of 40 ranked", "ledger 758 of 758 protocols". Our dashboard already recomputes every implied value in-page (`__CHECKS__`: recomputeMismatches / farmMismatches / playbookMismatches) — the strip just surfaces it.
- **Evidence:** all five top-10 artifacts I read show it prominently (kiencx, europa-nova, nyx77, sudhan, brisk-kestrel). Our dashboard has ZERO occurrences of "758" in `app.js`. This is a completeness criterion the judge can verify at a glance, and we currently do not display it at all.
- **Needs:** code change only (compute the groups from the snapshot in `main.ts`/`lib/model.ts`, render the bar + strip in `dashboard/app.js`). No new data, no model change, no board re-ranking.
- **Expected gain:** UNMEASURED, but it is the clearest presentation gap and the cheapest to close. Do it regardless of #1/#2.

### #4 — Lead the KPI strip with the walk-forward number, and add a two-test term-validation table [PRESENTATION — contingent on #1]
- **What:** (a) reorder the KPI strip so the walk-forward miss is the first accuracy number (it is currently third/fourth behind blind ×3.97, which is our worst number); (b) add a term table in the method/calibration tab: each candidate term with its LOO and walk-forward miss and its status (kept / tested, not kept / must not help), following kiencx's rule that a term is kept only if it lowers the miss in both tests. Our code already has `looRun` and the time-split machinery, so the numbers are computable; the table is a display + a small amount of validation code.
- **Evidence:** kiencx and europa-nova both lead with WF (×2.53, ×2.45) and both show the term table; our strip leads with blind (×3.97) and we show only a LOO variant table. The blind-first ordering makes our weakest number the headline.
- **Needs:** KPI reorder (trivial) + term-table computation (moderate). No new data. Contingent on #1: leading with WF only helps once WF is fixed (×2.79 after ridge, vs ×3.43 now). Do (a) together with #1; do (b) as part of the #1 revalidation (it is the evidence that the ridge term earned its place).
- **Expected gain:** UNMEASURED. It presents our best number first and shows the same two-test rigour as the top tier. It does not change the model.

### #5 — Add a board-level worked example [PRESENTATION — small]
- **What:** a panel on the board tab working row 1 (Steakhouse Financial) through the model step by step (TVL × multiple × size factor × growth × maturity → implied value; then odds, if #2 lands), in the style of europa-nova's "row 1, Steakhouse Financial, worked through model.js". Our detail view already shows the per-row decomposition; this surfaces it on the board itself.
- **Evidence:** europa-nova (#10) has it prominently. Neither kiencx nor we have it on the board.
- **Needs:** display only (numbers already computed). No new data, no model change.
- **Expected gain:** UNMEASURED, small. It helps a judge verify the arithmetic without opening a detail view.

### Not recommended
- **Dropping the category term entirely (size-only).** Measured WF improves (×3.43 → ×2.94 cutoff; ×4.05 → ×3.11 half/half) but ridge is better on WF (×2.79 / ×2.83) and ties on LOO, so ridge dominates size-only. Do ridge, not size-only.
- **Adding a family effect to the value model.** Kiencx tested it and did NOT keep it (best LOO ×2.95, but WF ×2.85 worse than the kept ×2.53); brisk-kestrel also tested family offsets and did NOT keep them (lost the WF test). Do not add it to value. (It belongs in the odds model, if #2 is built — kiencx keeps family ridge for odds.)
- **Adding 7-day growth or age to the value model.** Kiencx and europa-nova both tested them for value and did NOT keep them (they enter through odds). Our growth/maturity are already in the board values but correctly excluded from the headline. Do not promote them into the headline.
- **Changing the verdict rule** (NetEV ≥ $40 and ≥1.5× cost) or the FARM/THIN/SKIP tiers. The farm layer is our strongest part (7 fully costed playbooks, fee splits, honest p25) and the top entries' rules are not obviously better (kiencx: net beats T-bill and $25/h, 14 FARM; europa-nova: 12 FARM; sudhan: 66 FARM on a looser rule). No measured reason to change it.
- **Chasing europa-nova's 2.45 by fitting tweaks alone.** The residual 0.34 gap between our ridge (2.79) and europa-nova's size-only (2.45) on the same 31 tokens is unexplained (private repos; likely peer-set/fitting differences). Do not burn a round guessing at it — build #1, measure the new WF, and only then decide whether the residual is worth chasing.

---

## 5. Real completeness / farm gaps (not just "not visible in the cropped image")

Checked `dashboard/app.js` (1,293 lines) and `lib/model.ts` against what the top-10 artifacts show. The blind test's C2/C3 losses were partly a crop artifact (our board table was not in the image), but these gaps are real in the code, not in the image:

1. **No 758-protocol accounting.** Zero occurrences of "758" in `app.js`. We state the fit-peer counts (95 fit peers out of a 128 live-token universe; 33 set aside for no listing date; "416 record a token; only 144 carry a market cap") but there is no "all 758 in exactly one group" bar with the ranked/off-list/token-trades/set-aside breakdown. Every top-10 entry shows it. Fix: change #3.
2. **No token-odds model.** Our only "odds" is `breakevenOdds` (P(implied ≥ breakeven) under the band). There is no per-row launch-odds column and no Brier score. Every top-10 entry has one. Fix: change #2.
3. **No two-test term table.** We have a LOO variant table (flat / global / size-only / damped / adopted) and a method tab with blind/time-split/LOO numbers, but no per-term LOO + WF table with kept/not-kept discipline, and no placebo/control term. Fix: change #4(b).
4. **No board-level worked example.** Per-row detail views exist; no prominent row-1 walkthrough on the board. Fix: change #5.
5. **What is NOT a gap:** the integrity/recomputation machinery. Our dashboard already recomputes every implied value, farm plan and playbook in-page (`__CHECKS__`, warning banner on mismatch) and the calibration tab is a full ledger (validation table, LOO table, n=95 vs n=128 sensitivity, band calibration, chain residuals, bias −0.067 dex, p90 max-ratio ×21.2). The top entries surface this as a strip; we have the machinery but do not surface it as a strip. That is change #3's second half, not a missing capability.
6. **Farm layer: no gap.** 7 fully costed playbooks with fee splits (swap/bridge/gas), p10/p25/median/p75 fully costed, break-even vs implied, honest p25 (3 of 5 pre-fee P25-positive rows go negative fully costed, stated on the board). The top entries show per-row net-of-fees and net/hour on the board; we show Net EV, BE odds, Net $/h and Fees·Hold per row. Equivalent or deeper.

---

## Sources
- Kiencx artifact: `~/workspace/makefun/token-radar/top10/r01-kiencx.webp` (judge 966,767).
- Europa-nova (#10): `~/workspace/makefun/token-radar/top10/r10-europa-nova.webp` (960,454).
- Nyx77 (#2): `~/workspace/makefun/token-radar/top10/r02-nyx77.webp` (964,424).
- Sudhan (#3): `~/workspace/makefun/token-radar/top10/r03-sudhan.webp` (962,052).
- Brisk-kestrel-93 (#5): `~/workspace/makefun/token-radar/top10/r05-brisk-kestrel-93.webp` (962,052).
- Top-10 table: `~/workspace/makefun/token-radar/top10/top10.json`.
- Our model: `~/workspace/makefun/token-radar/lib/model.ts` (radar-5-huber).
- Our validation (measured): `~/workspace/makefun/token-radar/out/data.js` (validation object; fit sizeA=3.1384, sizeB=0.5080, R²=0.1655, globalMedian=0.2042).
- Our dashboard: `~/workspace/makefun/token-radar/dashboard/app.js`.
- Round 6 results/audit: `~/workspace/makefun/token-radar/round6/RESULTS_round6.md`, `~/workspace/makefun/token-radar/round6/AUDIT_SYNTHESIS.md`.
- Computations: `~/workspace/makefun/token-radar/benchmark/wf.ts` (walk-forward + ridge variant), `~/workspace/makefun/token-radar/benchmark/wf2.ts` (size-only / cat-only decomposition). Snapshot: `~/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json`.
- Blind test that motivated this: `~/workspace/makefun/token-radar/benchmark/blind-vs-kiencx.md` (kiencx won 2-0, margin 3, deciding criterion 1).
