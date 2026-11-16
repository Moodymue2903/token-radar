# token-radar — rank pre-token protocols by implied launch value

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Moodymue2903/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Moodymue2903/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Entry for make.fun's **token-radar-01** — "Build the best token launch
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
- **Validated out of sample** — leave-one-out: median error (1+MdAPE) ×1.89,
  43.8% of peers within 3×, Spearman(pred, actual) 0.367; plus a
  time-split and a blind 80/20 ×5. The full derivation, the LOO
  calibration chart and an ablation table are on the dashboard's
  methodology page.
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
bear/base/bull band and 6–8 farm steps. Verdicts: **FARM 15 / THIN 78 /
SKIP 107**. A farm verdict is the NetEV rule: airdrop pool = 8% of
implied value, user share = pool × (capital / TVL) at a canonical
$2,500 capital ($5,000 on Ethereum L1), costs = gas + opportunity cost
(4.5% annualised, 90-day hold); FARM if NetEV ≥ $40 and NetEV/cost ≥
1.5×, THIN if NetEV ≥ $0, SKIP otherwise.

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
identical bytes.

```sh
mkdir -p out && node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=XSCZ-RCXQ&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
