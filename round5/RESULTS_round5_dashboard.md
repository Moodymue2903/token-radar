# Token Radar — Round 5, new dashboard: RESULTS

**Branch:** `round5-dashboard` (from master `f84329f`).
**Model:** Huber δ=1.0 size curve (round-4 champion) on the n=95 peer definition.
**Deadline:** 2026-12-14T10:00Z. Submissions used 2/10 (8 left).
**Round-3 entry (live):** Tidegauge, judged 914,351, rank #1392 of 7,995. Gap to ronigrv (961,255) = 46,904; to top-5 bar (958,843) = 44,492.
**Status:** built and verified. NOT pushed, bundled, or submitted. The 3-model audit and the user showing come next; fresh 1024×711 screenshots still need taking (see §6).

## 0. Verdict up front — built, verified, ready for audit

The new dashboard is built on the Huber δ=1.0 champion with the n=95 peer definition, carrying all 8 planned features. The model reproduces the protocol-comparison numbers: **LOO within-3x 50.5% (48/95) on n=95, Spearman 0.340, median error x1.82**, against a flat baseline of 35.8% (0.25x starter) / 37.9% (global median). That is the top entries' reported range (ronigrv 46%, nightshift 48%, fikril 50%) — honestly, on our own data, with the peer count printed next to the number. The board is 200 rows, watchlist 40, verdicts **ROBUST 5 / FARM 6 / THIN 72 / SKIP 117**. Determinism holds (byte-identical across runs). The in-page self-checks report 0 mismatches. No top-tier entry's text, numbers, or layout were copied, and '62%' appears nowhere.

## 1. What was built

### Model (lib/model.ts, main.ts)
- **Huber IRLS δ=1.0** replaces the OLS size curve (`huberLin`, 20 iterations, OLS start, weights min(1, δ/|r|), adapted from round4/experiment4.ts). Fitted: intercept 3.138, slope **0.508** (OLS was 0.522), R² 0.166, residual SD 0.854. `sizeR2`/`sizeSeB`/`residualSd` are computed from the Huber fit's predictions.
- **n=95 peer definition:** `fitPeersOf(snapshot)` = `isPeer` AND `listed_at !== null`. The 33 null-`listed_at` peers are excluded from every fit, validation, and band; the universe stays 128 for reporting (`fit.peerUniverse` 128, `fit.excludedNullListedAt` 33). `peersOf` is unchanged (the universe). `MODEL_VERSION = 'radar-5-huber'`.
- **ROBUST tier:** a FARM row whose net EV at the P25 implied value is still ≥ $0 promotes to ROBUST in the post-band step. The $40-at-P25 bar in the original brief is unreachable (the P25 band is wide — p25/implied 0.24–0.40 on FARM rows — so the best row reaches only $8.76 at P25); $0 is the honest bar, "still pays (does not lose money) at the low end of its band", matching what the top entry's tier means. ROBUST is a strict subset of FARM (5 of 11).
- **Per-row farm economics** (post-band, in `attachBands`): `netEvP25` / `netEvRatioP25` (verdict arithmetic rerun at p25, cost unchanged), `breakevenValue` (totalCost × TVL / (poolShare × capital)), `breakevenOdds` (P(implied ≥ breakeven) with log10(implied) ~ Normal(median = row implied, σ = (log10 p75 − log10 p25)/1.349), Abramowitz–Stegun normal CDF, clamped [0,1]), `handsOnMinutes` (fresh wallet 5, main action 15, weekly action 10×12 = 120, hold 0, claim 10, farm log 5, multi-chain repeat 15), `netPerHour` (netEv / hands-on hours).
- **Validation additions:** `looBandRatioLo` 0.4046 / `looBandRatioHi` 3.3932 — the P25–P75 band for actual/implied from the LOO log-residuals (n=95).
- **main.ts:** verdict print now includes ROBUST.

### Dashboard (dashboard/app.js, app.css) — the 8 features
(a) **P25–P75 band on every row:** a P25–P75 column in the board table plus a "The middle half" strip (median 50% band 10.4x across the board).
(b) **ROBUST tier:** distinct badge (bright emerald #2fd6a3), ROBUST in the verdict filter, bubble-map legend and colours, verdict counts strip "ROBUST 5 · FARM 6 · THIN 72 · SKIP 117", detail-view explanation with netEvP25.
(c) **Break-even odds and net $/hour on every row:** two new sortable columns.
(d) **Scatter chart:** board-level SVG, x = TVL (log), y = actual market cap / implied value (log) for the 95 peers, y=1 fitted line, P25–P75 band shaded and labelled 0.40x–3.39x.
(e) **Formula box:** prominent box on the board tab — "log₁₀(value) = 3.138 + 0.508 × log₁₀(TVL)" with the fitted coefficients and the LOO numbers ("50.5% within 3x (n=95)", median miss, flat comparison), all read from DATA.
(f) **"Best per hands-on hour" callout:** headed "Best return on your time" (original wording) — BounceBit Prime, $33.95/h, ROBUST.
(g) **"Model & calibration" tab:** peer count (95 fit, 128 universe, 33 set aside), Huber fit (δ=1.0, IRLS, 20 iterations), shrinkage (k=5, minPeers=3), clamps, full LOO table, band calibration.
(h) **"Traded anchors" tab:** the 95 fit peers, each with TVL, actual market cap, implied value (recomputed in-page, no growth/maturity), and actual/implied ratio, sortable by ratio; notes the 33 set-aside peers.
Also: header KPIs (LOO within-3x 50.5% (n=95), ROBUST count), method-tab text updated to the Huber fit and n=95 peers, detail view extended (ROBUST, p25 economics, break-even odds, net $/h). Visual identity kept (same palette and layout language — extended, not redesigned).

## 2. Validation numbers (fresh build, verified independently)

| Metric | Round 5 (n=95) | Round 3 (n=128, OLS) | Flat (n=95) |
|---|---|---|---|
| LOO within-3x (adopted) | **50.53% (48/95)** | 43.8% | 35.79% (0.25x) / 37.89% (global median) |
| LOO Spearman | 0.340 | 0.410 | 0.416 (TVL rank) |
| LOO median error (1+MdAPE) | x1.815 | x1.886 | x1.875 |
| LOO median max-ratio | x2.962 | — | — |
| LOO P90 max-ratio | x21.19 | — | — |
| Blind 80/20 x5 median / within-3x / Spearman | x1.898 / 42.11% / 0.371 | x1.886 / 38.5% / 0.409 | — |
| Time-split median / within-3x / Spearman (n=31) | x1.829 / 41.94% / 0.184 | x1.840 / 41.9% / 0.180 | — |
| Band coverage blind 80% / 50% | 82.1% / 45.3% | 84% / — | — |
| Median board band width 80% / 50% | 132.0x / 10.39x | ~200x / — | — |
| Watchlist implied value | $0.600B | $0.637B | — |
| Coherence Spearman(TVL, implied) | 0.815 | — | — |

Note the trade the protocol comparison predicted: the n=95 subset buys within-3x (50.5% vs 43.8%) at the cost of Spearman (0.340 vs 0.410). The bare Huber size-curve-only LOO row reproduces the experiment's 48.4211% / 0.3594 exactly, confirming the Huber implementation; the adopted full-structure model (shrunk category multiples + Huber slope) gives 50.5263% / 0.340.

## 3. Verdicts and farm economics

ROBUST 5 / FARM 6 / THIN 72 / SKIP 117. ROBUST rows: #40 bouncebit-prime (+$87.71 / +$0.53 at p25), #43 theo-network-thbill (+$73.49 / +$7.45), #74 binaryx-platform (+$81.28 / +$8.76), #78 bucket-cdp (+$43.11 / +$0.47), #135 defa-by-invoicemate (+$59.17 / +$2.17). Every ROBUST row has netEvP25 ≥ 0 (min +$0.47, max +$8.76); every non-ROBUST FARM row has netEvP25 < 0 (−$2.89 to −$8.19). All 200 rows carry all 6 new farm fields; breakevenOdds ∈ [0,1] everywhere; band ordering p10 ≤ p25 ≤ p75 ≤ p90 holds on all 200 rows. Farm arithmetic independently recomputed for rank 1 (steakhouse-financial, also the multi-chain row, 11 chains), rank 21 FARM (manta-cedefi), and rank 40 ROBUST (bouncebit-prime) — all 11 fields match within cent-rounding (max diff $0.0046). 52 multi-chain rows on the board; hands-on minutes 155 (single-chain) / 170 (multi-chain).

## 4. Verification (independent verifier, own harness)

- Full build: exit 0, 200 rows, 40 watchlist, `boardIssue` passes; all numbers above match the model builder's claims exactly.
- ROBUST: counts exact, zero rule violations.
- Farm arithmetic: spot-checks pass (see §3).
- Dashboard rendering (own DOM-stub harness, no browser): runs without throwing; self-checks 0 recompute / 0 farm mismatches on 200 rows; all 5 tabs render (board, live, anchors, method, calibration); all 8 features present in the rendered HTML; LOO within-3x shown with n=95 next to it in two places (header KPI and formula box).
- Determinism: three runs, `diff -r` clean — byte-identical including board.json, data.js, dashboard/, screenshots/, dossier.json.
- Originality: '62%' appears nowhere in the output or source; no top-5 distinctive phrase reproduced verbatim ("MARKET LINE", "FARM NEXT", "Worth farming", "Plans that pay", "COMPS ERROR", "Early finds", "Launch Radar", "Launchscope", "Unminted", "Launch Ledger" all absent); no top-entry formula coefficient appears (0.472, 0.4852, 3.38, 3.2737, 7.25, 0.386 all absent); "46%"/"48%" occur 0 times — our number is 50.5%, labelled (n=95). Nuance: the words "Traded anchors" appear as a tab label, because the plan itself names the view that; the surrounding copy is original.
- Stale-text fixes applied after verification (all re-verified in the rendered HTML): R² "19%" → computed 16.5% from FIT.sizeR2; LOO row label 'global median 0.214x' → computed 0.204x; header-comment figures updated (global median 0.204x, median peer TVL $33.4M, Steakhouse 82x / 0.114x / 0.018x); verdictFor doc fixed ($40 → $0 at P25); p25/implied range "0.24–0.41" → "0.24–0.40"; Risk Curators counterfactual "$777M" → computed $738M from the data.

## 5. What changed vs round 3 (files)

- `lib/model.ts` (+259/−62 with the fixes): Huber size curve, n=95 fit peers, ROBUST tier, per-row farm economics, LOO band ratios, updated header comment.
- `main.ts` (+4/−2): verdict print includes ROBUST.
- `dashboard/app.js` (+320): the 8 features, 2 new tabs, updated method text, computed (never hardcoded) figures where the verifier found staleness.
- `dashboard/app.css` (+12): ROBUST badge/verdictbox, formula box, callout, band strip styles.
- `round5/RESULTS_round5_dashboard.md`: this file.
- Untouched: `round2/`, `round3/`, master. `round4/` is untracked in this working tree and was not committed.

## 6. What remains before submission

1. **Fresh screenshots at 1024×711** (the size of the top entries' artifacts). No headless browser binary exists on this VM, so they could not be taken here; the existing `screenshots/` (4 PNGs, 1440×900, from round 3, commit 55a6e8b) are STALE — they predate all 8 new features. The parent agent must capture board / detail / method-or-calibration views from its browser and replace them before submission.
2. **Show to the user first** (standing rule), then the **3-model audit** (Gemini / DeepSeek / GLM) — no entry is submitted without it.
3. Then push / bundle / `makefun check` / submit, only if the audit passes and the user approves. Deadline 2026-12-14T10:00Z; 8 submissions left. The live round-3 entry (Tidegauge, 914,351) is untouched until then.
