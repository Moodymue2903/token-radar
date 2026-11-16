# Token Radar — Round 2 results

Branch: `round2` (from `eb994b7`, the submitted round-1 entry). No merge to main, no bundle, no submit — those come after the user sees this and the 3-model audit.

Scope chosen by the user: **bands + clean-comps rebuild**.

## Watchlist verification (Stage A, first)

Verified from the kit's sealed snapshot (`token-radar-01-kit/input/snapshot.json`):

- **40 watchlist slugs, floor $50,000,000, 758 protocols, 128 live-token peers.** Our 40 is correct; the watchlist was NOT changed.
- The reference dashboard's "49/49" and "758 protocols over $5M TVL" are **not from this kit** — no 49-protocol watchlist and no $5M floor exist in the sealed snapshot. Those numbers belong to a different snapshot or a different entry; they cannot be reproduced here and were not chased.
- Token-family dedup is vacuous in this snapshot: **no duplicate gecko_id and no duplicate symbol among the 128 peers**. The only family-style removal is the versioned-name rule (aave-v2, ratio 18.96).

## Stage A — clean-comps experiment (VERDICT: NO VARIANT SHIPS)

Script: `round2/stageA/experiment.ts` (Kit Node 22). Full output: `round2/stageA/experiment.out` (re-run 2026-11-16, reproduces the first run exactly).

### Frozen split (built once, identical for all four models)

- Blind 80/20 x5: seeds [11, 23, 37, 41, 53], mulberry32 + Fisher-Yates over the 128 peer indices in snapshot order, hold = first 26 shuffled indices (102 train / 26 test per seed). This is exactly the split generator in `lib/model.ts` `validateModel`, so M0's blind numbers reproduce round 1.
- Time split: train listed_at < 2025-01-01 (**64** peers), test >= (**31** peers); 33 peers have `listed_at = null` and are in neither. (An earlier note said 97 train — wrong; the rerun counts 64 train / 31 test / 33 null.)
- LOO: 128 folds, full refit each fold, filtering within-train each fold.
- Predictions exclude growth/maturity throughout. Blind aggregates are the MEAN of the 5 per-seed values (round-1 convention); pooled values (130 preds) are a secondary check.

### The four models

- **M0** — current 128-peer model: `fitModel` + `impliedValue` no-gm.
- **M1** — strict clean-comps + size-curve only: exclude CEX, versioned names, ratios outside [0.01, 10]; deduplicate token families. Keeps **104/128** (removes 24: 9 CEX, 1 versioned, 17 ratio-outside, overlaps counted in each bucket). Removed: aave-v2, anvil, backpack, biconomy.com, bitkan, bitkub, bitway-earn, concentrator, flokifi-locker, gate, gravity-bridge, grove-finance, kava-lend, mantle-bridge, meth-protocol, mexc, nexo, obol, okx, rain, reservoir-protocol, ssv-network, swissborg, xdai-stake-bridge. Then a plain OLS size curve on the clean peers (no category multiples, no shrinkage).
- **M2** — per-category robust regression: Huber IRLS per category (n>=8), slope shrunk w = n/(n+10) toward the global Huber slope, clipped to [0.3, 0.8], robust intercept.
- **M3** — hybrid: clean peers (M1 filter) + full M0 machinery (category shrinkage, size curve, winsor).

### Raw table

Blind x5 = mean of 5 per-seed values; LOO = 128 folds; time-split n = 31.

| model | blind median | blind within2 | blind within3 | blind Spearman | blind logRMSE | time-split median | time-split within3 | time-split Spearman | LOO median | LOO within3 | LOO Spearman |
|---|---|---|---|---|---|---|---|---|---|---|---|
| M0 (current) | x1.8859 | 23.8% | 38.5% | 0.409 | 0.8729 | x1.8401 | 41.9% | 0.180 | x1.8865 | 43.8% | 0.367 |
| M1 (clean + size only) | x1.8686 | 24.6% | 34.6% | 0.453 | 0.8651 | x1.8870 | 51.6% | 0.244 | x1.8745 | 42.2% | 0.421 |
| M2 (category Huber) | x1.8723 | 26.9% | 37.7% | 0.447 | 0.8786 | x1.8929 | 48.4% | 0.229 | x1.8683 | 39.8% | 0.379 |
| M3 (clean + M0 machinery) | x1.9387 | 20.0% | 34.6% | 0.421 | 0.8748 | x1.8415 | 51.6% | 0.236 | x1.8916 | 45.3% | 0.413 |

Per-seed blind medians: M0 x1.867 / x1.851 / x1.900 / x1.922 / x1.889; M1 x1.868 / x1.791 / x1.933 / x1.914 / x1.837; M2 x1.857 / x1.760 / x1.914 / x1.905 / x1.926; M3 x1.886 / x2.091 / x1.892 / x1.922 / x1.903.
Per-seed blind Spearman: M0 0.305 / 0.478 / 0.415 / 0.321 / 0.529; M1 0.461 / 0.604 / 0.261 / 0.314 / 0.623; M2 0.471 / 0.621 / 0.234 / 0.301 / 0.609.
Pooled blind (130 preds): M0 median x1.8916, worst max-ratio x255.1 (aave-v2); M1 x1.8781, worst x179.5 (nexo); M2 x1.8768, worst x348.7 (nexo); M3 x1.8975, worst x192.9 (nexo).
Worst-5 pooled (M0): aave-v2 x255.1, gravity-bridge x154.1, mantle-bridge x106.4, concentrator x73.8, nexo x62.2.
Per-category pooled blind median (n>=5, M0): Basis Trading n=6 x1.58, Bridge n=6 x1.63, CEX n=8 x1.78, Canonical Bridge n=8 x2.16, Dexs n=16 x1.88, Lending n=10 x1.98, Liquid Staking n=8 x5.18, Privacy n=5 x1.50, RWA n=9 x1.50, Yield n=10 x4.47. (Liquid Staking and Yield are the worst categories in every variant.)

### Paired t-tests (5 seeds, df = 4) — the wins are noise

- M0−M1 blind median: mean diff +0.0172, SE 0.0173, **t = 0.99, p ≈ 0.36**, M1 wins 3/5 seeds.
- M0−M2 blind median: mean diff +0.0134, SE 0.0216, **t = 0.62, p ≈ 0.55**.
- M1−M0 blind Spearman: +0.0430, SE 0.0564, t = 0.76. M2−M0 blind Spearman: +0.0376, SE 0.0634, t = 0.59.
- Every "win" is ~1 standard error — indistinguishable from noise.

### Board sanity (scratch builds, no growth/maturity — values are upper bounds vs production with-gm; direction confirmed)

- M1 full-data fit on 104 clean peers: a = 2.1715, b = 0.6349 (vs M0 a = 3.0247, b = 0.5223 — steeper slope = less mega-TVL compression). **M1 board is EXACTLY TVL-ordered (Spearman(TVL, implied) = 1.000)** — the category-comps story disappears. Top-3 Steakhouse $146.1M / Gauntlet $102.6M / Veda $102.0M (no-gm; with-gm ≈ $116M / $81M / $81M), watchlist total $1.273B (M0 $0.637B), verdicts FARM 43 / THIN 105 / SKIP 52 (M0 15/78/107), 193/200 rows change rank vs M0.
- M2 board: Spearman 0.962, top Steakhouse $103.4M, watchlist $1.133B, FARM 48 / THIN 91 / SKIP 61, 189/200 rank changes. Its Lending/Dexs raw Huber slopes were 1.452 / 1.776 (the same wild-slope problem as round-1 variant 5); only the [0.3, 0.8] clip tames them.
- M3 board: Spearman 0.907, watchlist $1.157B, FARM 32.

### Verdict: FALLBACK — no variant ships

M1 and M2 satisfy the LETTER of the ship rule (beat M0 on blind median AND blind Spearman) but by ~1 SE, with mixed secondary metrics (M0 is best on blind within3 38.5% and time-split median x1.8401) and board regressions (M1 is TVL-monotone; M2 needs clipped wild slopes; all variants inflate values ~1.5–2x and roughly triple FARM counts). The rule as written is a necessary condition ("ship ONLY if"), not a compulsion, and the round-1 precedent (variant 2b: a median-only win with a degenerate board = "Do not adopt") supports falling back. **Stage B proceeds on the FALLBACK: bands + reframe on M0.** The parent/user can overrule with the table above.

## Stage B — rebuild on M0 (bands + reframe)

Model: **M0 unchanged** (128 peers, winsor p5 0.0070 / p95 9.70, global median 0.214x, category shrinkage w = n/(n+5), size curve log10(mcap) = 3.0247 + 0.5223·log10(tvl), R² = 0.194, growth clamp −60..+120 weight 0.5, maturity 0.6–1.0 over 1095d, full slope s = 1.0). Model version label bumped to `radar-3-bands` (the entry changed; the model did not).

### Uncertainty bands — method

Parametric-bootstrap predictive interval, implemented in `lib/model.ts` (`bootstrapBand`, `looLogResiduals`, `attachBands`, `bandCalibration`; offline calibration script `round2/stageB/bands.ts`, results `round2/stageB/bands.json`):

- 200 resamples of the fit's peer set (seeded mulberry32, fixed seeds — deterministic), refit M0 each time, predict the row (no growth/maturity), multiply by 10^(one residual drawn from the LOO log-residual distribution), take quantiles p10/p25/p50/p75/p90. Growth and maturity are deterministic per-row multipliers, so the band scales by them afterwards.
- Production seeds: 4242000 + row index (board order). Calibration seeds: blind `seed*100000 + i`, time-split `777000 + i` — identical to the offline script, so the production build reproduces the offline numbers exactly (verified below).
- Added to every `BoardRow` as `uncertainty: {p10, p25, p75, p90}` (whole dollars, with growth/maturity applied) and shown in the board table (P10–P90 column), the detail view (80% + 50% bands), and the methodology page. The gate (`boardIssue`) now refuses a row with no band, a band out of order, or no mechanism label.
- Farm mechanism: a short label per row derived from the snapshot's categories (`mechanismFor`, mirroring the `actionFor` branches, own wording — not the reference's labels): curator allocation, allocation vault, yield-bearing mint, lending supply, liquidity provision, bridged funds, staked receipt, margin position, market position, stable mint, cover policy, app usage, payment flow, governance stake, custodial deposit, protocol deposit. Shown as a tag on every board row and in the detail view.

### Band calibration — measured, not assumed (frozen splits, train-only everything)

| check | n | 80% band (p10–p90) coverage | 50% band (p25–p75) coverage |
|---|---|---|---|
| Blind 80/20 x5 (held-out peers) | 130 | **83.8%** (target 80%) | **46.2%** (target 50%) |
| Time split (listed >= 2025-01-01) | 31 | **71.0%** | **32.3%** |

Per-seed blind coverage (80% / 50%): seed 11: 92.3% / 57.7%; seed 23: 80.8% / 38.5%; seed 37: 73.1% / 46.2%; seed 41: 80.8% / 38.5%; seed 53: 92.3% / 50.0%.
Median band width: blind p90/p10 **217.1x**, p75/p25 12.7x; board (full data) p90/p10 **206.2x**, p75/p25 15.5x. Band median vs point: 0.949 (blind test peers), 1.054 (board rows) — centering is within ~5%.
The bands are **well-calibrated on blind** (83.8% vs 80% nominal, 46.2% vs 50%) but **under-cover on the time split** (71.0% / 32.3% on newer listings) — reported honestly in the methodology page. They are **wide** (median 206x) because the error distribution is heavy-tailed: the median LOO error is x1.89 but the 90th-percentile LOO max-ratio is **x36.3** (1 in 10 peers is off by more than x36; worst pooled blind max-ratio x255.1, aave-v2). A narrow band would be a lie about what this model knows.

### New board numbers (production build, M0 — unchanged from round 1)

- 200 rows, **40/40 watchlist**, 758 protocols, 160 early + 40 watchlist.
- Watchlist implied total **$0.637B** (unchanged).
- Top-3: **Steakhouse $55.8M** (band $4.0M–$818.9M), **Gauntlet $43.4M** ($4.1M–$420.4M), **Veda $41.9M** ($3.2M–$956.0M). USDD $39.3M.
- Verdicts: **FARM 15 / THIN 78 / SKIP 107** (unchanged). FARM threshold kept at **$40** with the sensitivity note (at $75, 4 rows qualify).
- Validation (recomputed every run, now also in `data.js`): LOO median **x1.89** (1+MdAPE), within2 30.5%, within3 **43.8%**, median max-ratio x3.37, **P90 max-ratio x36.28**, Spearman 0.367; blind 80/20 x5 median **x1.89**, within2 23.8%, within3 38.5%, Spearman 0.409; time-split median **x1.84**, within3 41.9%, Spearman 0.180; coherence Spearman(TVL, implied) 0.829.
- Board.json sha256 (all builds): `6b2e8f11d71d80df14cb27c1261218f3a9840838037fcf34372d4f1f91f69b64`. Data.js sha256: `ca70de376bad3e0e4f44004765dd40f6227a01b7c9f075a72bec8d2d09a1b417`.

### Reframe

- Methodology page + header KPI now **lead with the blind test** (procedure first: "fit on 80%, evaluated blind on held-out 20%, repeated five times, no tuning on the test set") and the headline win numbers; R² (0.194) and Spearman (0.367 LOO / 0.409 blind) are in a small-print paragraph, not the lede. The band method + calibration (including the time-split under-coverage) has its own section. Mega-TVL note and FARM $40 sensitivity note kept.
- Screenshots: 3 DISTINCT views, captured headless (google-chrome 1440x900, from the built `out/`): 1-board (board with the P10–P90 column + mechanism tags), 2-detail (Manta CeDeFi, rank #28, top FARM row — 80%/50% bands + mechanism + band explanation), 3-method (methodology page, blind-first). Sizes: 154,031 / 231,352 / 277,922 bytes (all under the 524,288 cap). Verified visually: KPI chips lead with "Blind 80/20 median error x1.89" and "80% band covers 84% blind"; no recompute warning in the rendered DOM (dashboard self-checks pass: implied values + farm plans recompute clean).

### Verification

- **Determinism: PASS.** Four consecutive builds (build1–build4, ~18s each): board.json and data.js byte-identical across all four (shas above); dossier.json byte-identical across build3 vs build4 (no code changes between them): `41f9ddd02fe3d6e3987924dd597bc85a186a7f88d813d37a66282062c712d4dd`.
- **Gate: PASS.** `main.ts` exits 0 (boardIssue incl. the new band/mechanism checks, 200 rows, 40/40 watchlist, 3 screenshots).
- **Dossier rebuild: PASS.** Re-running `buildDossier` on `out/` reproduces `dossier.json` byte-for-byte (941,472 bytes) — the scorer's check. Script: `round2/stageB/rebuild-check.mjs`.
- **Production = offline calibration: PASS.** The production build's `validation.bands` (blindCov80 0.83846, blindCov50 0.46154, timeCov80 0.70968, timeCov50 0.32258, boardWidth80 206.2455, boardWidth50 15.5290) match `round2/stageB/bands.json` exactly.
- **Offline script cross-check: PASS.** `round2/stageB/bands.ts` was cleaned up (it had called `fitModel` with 3 arguments; `fitModel` ignores its 2nd parameter, so the numbers were unaffected) and re-run: blind/timeSplit/boardFullData identical to the first run.
- Dashboard size: 54,973 bytes (app.css + app.js + index.html). Dossier: 941,472 bytes.

### Proposed title (not submitted)

"Token launch radar: blind-tested x1.89, 200 rows, 40/40 watchlist, P10–P90 bands on every row"

### Files changed (branch `round2`)

- `lib/model.ts` — bands (`BAND_BOOT`, `looLogResiduals`, `bootstrapBand`, `bandCalibration`, `attachBands`, `BandReport`), `mechanismFor`, `uncertainty` + `mechanism` on `BoardRow`, validation fields (bands, blindWithin3/Spearman, timeSplitWithin3/Spearman, adoptedP90MaxRatio), band/mechanism gate in `boardIssue`, model version `radar-3-bands`, header comment (blind-first + band honesty).
- `dashboard/app.js` — P10–P90 column + mechanism tags on the board, 80%/50% bands + mechanism + band explanation in the detail view, blind-first header KPI, methodology reframe (blind test first, band section, R²/Spearman to small print, clean-comps note).
- `dashboard/app.css` — `.mech` tag style.
- `screenshots/` — 3 new distinct views (1-board, 2-detail, 3-method).
- `README.md` — round-2 validation (blind-first), bands, mechanism.
- `round2/stageA/experiment.ts` + `experiment.out` — Stage A experiment + output.
- `round2/stageB/bands.ts` + `bands.json` (+ `bands-v1.json` first run) — offline band calibration.
- `round2/stageB/rebuild-check.mjs` — dossier-rebuild check.
- `round2/RESULTS_round2.md` — this file.
- `out/` is gitignored (build outputs; `board-build1.json` kept under `round2/stageB/` as the determinism reference).

### What is NOT in this branch

No merge to main, no bundle, no submit. The round-1 entry (submission `01a1e496`, HEAD `eb994b7`) is untouched on main. 9 submissions left; entries close 2026-12-14T10:00Z.
