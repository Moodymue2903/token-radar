# Token-Radar Round 5 — 128-peer sensitivity (2026-11-17 ~10:25 IST)

## Why

Gemini, DeepSeek, ChatGPT, Superbot, and GLM all asked for it: publish the LOO on the FULL 128-peer traded universe next to the n=95 number, to test whether excluding the 33 dateless peers inflates within-3x. Superbot's sharp version: the printed formula is TVL-only, so if listed_at is not a model term, the exclusion has no justification on its face.

## Method

Script: `round5/sensitivity128.ts`. Uses the same predictors `validateModel` uses, via `looRun` (genuine per-fold nested refit — `fitModel` recomputed on the 94/127 training peers each fold). The noGm predictor (no growth/maturity) does NOT consume listed_at, so the 33 dateless peers can be included in this LOO. Run on the kit snapshot:
`node round5/sensitivity128.ts --input ~/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json`

## Results

| Model | n=95 within-3x | n=95 Spearman | n=128 within-3x | n=128 Spearman | Delta (128-95) |
|---|---|---|---|---|---|
| Adopted (full, shrunk s=1.0) | 50.5263% | 0.3400 | 46.0938% | 0.3727 | -4.43pp / +0.033 |
| Size curve only | 48.4211% | 0.3594 | 43.7500% | 0.4096 | -4.67pp / +0.050 |
| Damped s=0.5 | 47.3684% | 0.3526 | 40.6250% | 0.3874 | -6.74pp / +0.035 |
| Flat 0.25x (starter) | 35.7895% | 0.4001 | 33.5938% | 0.4385 | -2.20pp / +0.038 |
| Global median | 37.8947% | 0.3959 | 35.1563% | 0.4161 | -2.73pp / +0.020 |

Median max ratio (adopted): n=95 x2.9623, n=128 x3.4790. Within-2x (adopted): n=95 34.74%, n=128 29.69%.

## Interpretation

- The auditors were RIGHT to ask. The 33 dateless peers ARE systematically harder: including them drops the adopted model's within-3x from 50.53% to 46.09% (-4.43pp). The n=95 number is inflated relative to the full universe by ~4.4pp. This is a real selection effect, not noise.
- The direction is consistent across every model (all drop 2.2-6.7pp), so it is a property of the 33 peers, not of the adopted model. Gemini's prediction was correct: dateless peers are disproportionately older/illiquid/messy with noisier mcap/TVL ratios.
- Spearman goes UP on n=128 for every model (+0.02 to +0.05). The dateless peers are harder to place within 3x but the overall ranking is preserved — consistent with more extreme ratios (fatter tails) rather than a broken ordering.
- The lift over the flat baselines SURVIVES the expansion: adopted vs global median is +12.63pp on n=95 and +10.94pp on n=128. The model's advantage is real on both sets.
- The 46.09% on n=128 is still above ronigrv's reported 46% (a tie) and above both flat baselines, but below the leader's 48% and #5's 50%. The headline depends on the peer set — which is exactly why both numbers must be published.
- Does listed_at do work? YES in the board (maturity multiplier uses age from listed_at; the time-split validation needs it), but NO in the LOO headline (the noGm predictor excludes growth/maturity). So Superbot's criticism is valid for the LOO number specifically: the 33 could be included in the LOO, and when they are, the number is 46.1%, not 50.5%.

## What this means for the submission

- Publish BOTH numbers, side by side, with the selection effect stated plainly: "LOO within-3x 50.5% on the 95 peers with listing dates; 46.1% on all 128 traded peers. The 33 dateless peers are systematically harder (older/illiquid); the difference is the cost of the listing-date requirement."
- The question of whether to REFIT on all 128 (using the unknown-age prior for maturity) is open — the model can technically do it (maturityMultiplier handles null age via unknownAgeDays), but it would change the fit, bands, implied values, and verdicts. That is a bigger decision than publishing the sensitivity. Flag for the synthesis/user.
- The 50.5% is NOT a cherry-picked number in the sense of outcome-based selection (the rule is pre-registered-looking and methodologically motivated by the maturity term), but it IS flattered by ~4.4pp relative to the full universe, and that must be disclosed.
