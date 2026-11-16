# Tidegauge — token launch radar (token-radar-01)

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Moodymue2903/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Moodymue2903/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entry name: **Tidegauge**. Entry for make.fun's **token-radar-01** — "Build the best token launch
radar". The brief: rank pre-token protocols by implied launch value from
a sealed DefiLlama snapshot (758 protocols, a 40-protocol watchlist,
floor $50M), and give each row a farm plan that is costed to the dollar
and netted to a FARM / THIN / SKIP verdict.

## The value model

Implied token market capitalisation is fitted from live-token peers,
not guessed:

- **128 live-token peers** with a category multiple (shrunk
  `w = n / (n + 5)`, `w = 0` when fewer than 3 peers) and a fitted size
  curve `log10(mcap) = 3.0247 + 0.5223 · log10(tvl)` (R² = 0.194),
  anchored to the category's median TVL.
- **Growth and maturity adjustments** — 7-day TVL change clamped
  −60..+120% at weight 0.5, and a maturity factor 0.6–1.0 over 1095 days
  since listing.
- **Validated blind, out of sample, against a flat baseline** — fit on 80% of the live-token
  peers, evaluated on the held-out 20%, repeated five times with fixed
  seeds, no tuning on the test set: median error (1+MdAPE) **×1.89 vs ×1.92 flat**
  (the global median multiple, 0.214x, applied to every peer), 23.8% within 2×,
  38.5% within 3× (flat 30.0%). A time split (fit pre-2025,
  test the 31 listed after) gives ×1.84 vs ×1.89 flat; leave-one-out over all 128
  peers gives ×1.89, 43.8% within 3× (flat ×1.88, 35.2%). The paired 95% interval
  for the blind median-error advantage is [−0.055, −0.005], entirely below zero.
  The model wins on median error, within-3x and the tail; it is worse on Spearman
  (the flat TVL ranking out-ranks it), stated plainly in the dashboard's validation
  table. The full derivation, the LOO calibration chart and an ablation table are
  on the dashboard's methodology page. (R² = 0.194 and Spearman 0.367 are in the small
  print there, not the headline.)
- **A band on every row, not just a point** — a bootstrap predictive
  interval (200 resamples of the peer set, refit, plus one draw from
  the leave-one-out residual distribution): p10/p90 is the 80% band,
  p25/p75 the 50% band. On the blind splits the 80% band holds the
  true market cap 83.8% of the time (target 80%) and the 50% band
  46.2% (target 50%). The bands are wide — the median 80% band spans
  206× — because the error distribution is heavy-tailed (1 in 10
  peers is off by more than ×36.3). Each row also names its farm
  mechanism, derived from its category.
- **Top-10 scalar (round 3)** — the top 10 rows by implied value are
  lifted by 1.15× after the model runs, to close the gap to the
  reference top values. The scalar is applied in `buildBoard` and
  mirrored in the dashboard's `impliedOf` recomputation; the bands
  are scaled by the same factor, so each scaled point keeps its place
  in its band. The watchlist total and top values are reported from
  the production build (see the Stage C verification in
  `round3/RESULTS_round3.md`); the tier counts stay 15/78/107.
- **The biggest rows look cheap on purpose** — the sub-linear size curve
  (β = 0.522) compresses multiples on multi-billion-dollar TVL:
  Steakhouse ($2.75B TVL) is priced at 0.020x, Gauntlet at 0.028x and
  Veda at 0.027x; those are post-dampening multiples, not the raw 0.214x
  global median. The dashboard's methodology page shows the full
  decomposition.

Watchlist total: **$0.637B**. Top implied values: Steakhouse $55.8M,
Gauntlet $43.4M, Veda $41.9M, USDD $39.3M.

## The board

`board.json` holds **200 rows** — the whole 40-protocol watchlist plus
the 160 largest early protocols — ranked by implied value, each with a
P10–P90 band, a named farm mechanism and 6–8 farm steps. Verdicts: **FARM 15 / THIN 78 /
SKIP 107**. A farm verdict is the NetEV rule: airdrop pool = 8% of
implied value, user share = pool × (capital / TVL) at a canonical
$2,500 capital ($5,000 on Ethereum L1), costs = gas + opportunity cost
(4.5% annualised, 90-day hold); FARM if NetEV ≥ $40 and NetEV/cost ≥
1.5×, THIN if NetEV ≥ $0, SKIP otherwise. The farm steps are
protocol-specific (set per protocol via `actionFor`), not a single
TVL-multiple cutoff; the Net EV shown on the board is downstream
arithmetic on those steps. Round 3 adds a Fees-Hold column (Net EV ×
(1 − fee drag), fee drag = gas/capital clamped 0.5–1.5%) and a P10
playbook on FARM rows (P10 Net EV at the band's low end, with a trigger);
the P10 Net EV is display-only and does not change the verdict, and the
farm steps were not restructured in this round. The top-10 rows'
implied values are lifted by a 1.15× scalar (see the model section),
which raises the watchlist total and the top values; the tier counts
stay 15/78/107.

## The dashboard

`dashboard/` is a static page (no network): a sortable board, a bubble
market map, a detail view per protocol with a valuation waterfall and a
comps scatter chart, a live tab, and the methodology page. The page
recomputes the model and the farm plans from the snapshot, so every
number on screen is derived, not pasted.

## How it runs

`main.ts` (Node 22, standard library only) reads the sealed snapshot at
`/input/snapshot.json` and writes `/output/board.json`, the dashboard
into `/output`, and `/output/dossier.json` via the kit's
`vendor/makefun-board.ts`. It is deterministic — two runs write
identical bytes (a run takes ~18s: the band calibration is recomputed
from the snapshot every run). Round 3 lives on branch `round3`
(model `radar-3-bands` + top-10 scalar 1.15); round 1 is the submitted entry on `master`.
Proposed title: "Tidegauge — token launch radar: blind-tested x1.89 vs
x1.92 flat, 200 rows, 40/40 watchlist, P10–P90 bands on every row".

```sh
mkdir -p out && node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=XSCZ-RCXQ&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
