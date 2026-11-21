#!/usr/bin/env python3
"""Round-7 independent reconciliation: recompute the board from the snapshot
with numpy (a separate implementation of the ridge + odds fits and the farm
arithmetic) and confirm it matches the built board exactly.

Checks:
  1. Ridge fit coefficients (a, b, per-category offsets) vs data.js fit.
  2. Odds fit coefficients (intercept, age, size) vs data.js odds.
  3. Every row: value-if-launches, odds, implied value, multiple.
  4. Ranks (implied desc, slug tie-break).
  5. Verdicts + net EV + net EV ratio (pool/share/gas/opp arithmetic).
  6. Playbook totals (extra fees, fully costed net EV, break-even) — from
     the shipped band and farm figures, verifying the derivation.
  7. Accounting groups sum to 758.
Run: python3 round7/reconcile_round7.py  (from ~/workspace/makefun/token-radar)
"""
import json, math, re, sys
import numpy as np

ROOT = '/home/hatch/workspace/makefun/token-radar'
SNAP = '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json'
snap = json.load(open(SNAP))
ps = snap['protocols']
as_of = snap['as_of']
floor_usd = snap['floor_usd']
board = json.load(open(f'{ROOT}/out/board.json'))['rows']
data_js = open(f'{ROOT}/out/data.js').read()[len('window.RADAR='):].rstrip().rstrip(';')
radar = json.loads(data_js)
fit = radar['fit']
odds = radar['odds']
model = radar['model']

fails = []
def check(name, ok, detail=''):
    if not ok:
        fails.append(f'{name}: {detail}')
    return ok

# --- helpers mirroring lib/model.ts ---
def is_pre(p): return p['mcap_usd'] is None and p['gecko_id'] is None and p['symbol'] is None
def is_peer(p): return p['gecko_id'] is not None and p['symbol'] is not None and p['mcap_usd'] is not None and p['mcap_usd'] > 0 and p['tvl_usd'] > 0
VERSIONED = re.compile(r'\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$')
def rankable(p): return is_pre(p) and p['category'] != 'CEX' and not VERSIONED.search(p['name'])
def age_days(p):
    if p['listed_at'] is None: return None
    from datetime import date
    return max(0, (date.fromisoformat(as_of) - date.fromisoformat(p['listed_at'])).days)
def clamp(x, lo, hi): return max(lo, min(hi, x))
def median(xs):
    s = sorted(xs); n = len(s)
    return s[n//2] if n % 2 else (s[n//2-1] + s[n//2]) / 2

L2 = {'arbitrum', 'optimism', 'base', 'ink', 'monad', 'zksync', 'zksync era', 'scroll', 'linea', 'blast', 'mode', 'manta', 'manta pacific', 'starknet', 'polygon zkevm', 'zora', 'fraxtal', 'lisk', 'soneium', 'unichain', 'world chain', 'abstract', 'apechain', 'bob', 'hemi', 'fuel', 'movement', 'superseed', 'swellchain', 'tac', 'xai', 'gravity'}
BTC = {'bitcoin', 'bsquared', 'b2', 'mezo', 'merlin', 'bitlayer', 'rootstock', 'stacks', 'core', 'bob', 'bison', 'citrea', 'fractal', 'hemi'}
def gas_per_tx(chain):
    c = (chain or '').strip().lower()
    if c == '': return 2.0
    if c == 'ethereum': return 4.0
    if c in L2: return 0.3
    if c in BTC: return 2.0
    return 0.05
def mechanism(p):
    c = (p['category'] or '').lower()
    if 'risk curator' in c or 'curator' in c: return 'curator allocation'
    if 'onchain capital allocator' in c or 'allocator' in c: return 'allocation vault'
    if 'rwa' in c or 'real world' in c: return 'yield-bearing mint'
    if 'lend' in c or 'cdp' in c or 'collateral' in c: return 'lending supply'
    if 'dex' in c or 'yield' in c or 'leveraged farm' in c or 'basis trading' in c: return 'liquidity provision'
    if 'bridge' in c: return 'bridged funds'
    if 'staking' in c or 'restak' in c: return 'staked receipt'
    if 'perpetual' in c or 'derivative' in c: return 'margin position'
    if 'prediction' in c: return 'market position'
    if 'stable' in c: return 'mint or deposit'
    if 'insurance' in c: return 'insurance cover'
    if 'chain' in c: return 'bridged funds'
    if 'payment' in c: return 'payment'
    if 'governance' in c: return 'governance deposit'
    if 'cedefi' in c or 'cefi' in c: return 'cefi deposit'
    return 'deposit'

# --- 1. Ridge fit (Huber IRLS, lambda=4 on offsets only) ---
peers = [p for p in ps if is_peer(p) and p['listed_at'] is not None]
print(f'fit peers: {len(peers)} (data.js: {fit["peerCount"]})')
cats = sorted(set(p['category'] for p in peers if sum(1 for q in peers if q['category'] == p['category']) >= 3))
cats = [c for c in cats if c is not None]
k = len(cats); d = 2 + k
idx = {c: i for i, c in enumerate(cats)}
X = np.zeros((len(peers), d)); y = np.zeros(len(peers))
for i, p in enumerate(peers):
    X[i, 0] = 1; X[i, 1] = math.log10(p['tvl_usd'])
    if p['category'] in idx: X[i, 2 + idx[p['category']]] = 1
    y[i] = math.log10(p['mcap_usd'])
def solve_ridge(w):
    W = np.diag(w)
    A = X.T @ W @ X
    for j in range(2, d): A[j, j] += 4
    return np.linalg.solve(A, X.T @ W @ y)
beta = solve_ridge(np.ones(len(peers)))
for _ in range(20):
    pred = X @ beta
    r = np.abs(y - pred)
    w = np.where(r <= 1.0, 1.0, 1.0 / r)
    nxt = solve_ridge(w)
    ch = np.max(np.abs(nxt - beta)); beta = nxt
    if ch < 1e-12: break
print(f'ridge: a={beta[0]:.4f} (data.js {fit["sizeA"]:.4f})  b={beta[1]:.4f} (data.js {fit["sizeB"]:.4f})')
check('ridge a', abs(beta[0] - fit['sizeA']) < 1e-6, f'{beta[0]} vs {fit["sizeA"]}')
check('ridge b', abs(beta[1] - fit['sizeB']) < 1e-6, f'{beta[1]} vs {fit["sizeB"]}')
off_map = {c: beta[2 + idx[c]] for c in cats}
off_bad = 0
for o in fit['ridgeOffsets']:
    if o['category'] in off_map and abs(off_map[o['category']] - o['offset']) >= 1e-6: off_bad += 1
check('ridge offsets', off_bad == 0, f'{off_bad} offsets differ')
# category median TVL (for the anchor)
cat_med_tvl = {}
for c in set(p['category'] for p in peers):
    cat_med_tvl[c] = median([p['tvl_usd'] for p in peers if p['category'] == c])
global_med_tvl = median([p['tvl_usd'] for p in peers])
def anchor_mult(category):
    n = sum(1 for p in peers if p['category'] == category)
    med_tvl = cat_med_tvl[category] if n >= 3 else global_med_tvl
    off = off_map.get(category, 0.0) if n >= 3 else 0.0
    return (10 ** (beta[0] + beta[1] * math.log10(med_tvl) + off)) / med_tvl, med_tvl, n

# --- 2. Odds fit (logistic IRLS, age + size) ---
train = [p for p in ps if p['listed_at'] is not None and p['category'] != 'CEX' and not VERSIONED.search(p['name'])]
ys = np.array([0 if is_pre(p) else 1 for p in train], dtype=float)
def design(p):
    a = age_days(p); ay = 1.0 if a is None else a / 365.25
    return np.array([1.0, ay, math.log(p['tvl_usd']) - math.log(1e8)])
Xo = np.array([design(p) for p in train])
b0 = math.log(ys.mean() / (1 - ys.mean()))
bo = np.array([b0, 0.0, 0.0])
for _ in range(50):
    z = Xo @ bo
    pr = 1 / (1 + np.exp(-np.clip(z, -30, 30)))
    W = np.diag(np.maximum(1e-6, pr * (1 - pr)))
    A = Xo.T @ W @ Xo
    for j in range(1, 3): A[j, j] += 1e-6
    step = np.linalg.solve(A, Xo.T @ (ys - pr))
    bo = bo + step
    if np.max(np.abs(step)) < 1e-9: break
print(f'odds: intercept={bo[0]:.4f} (data.js {odds["intercept"]:.4f})  age={bo[1]:.4f} (data.js {odds["ageCoef"]:.4f})  size={bo[2]:.4f} (data.js {odds["sizeCoef"]:.4f})')
check('odds intercept', abs(bo[0] - odds['intercept']) < 1e-6, f'{bo[0]} vs {odds["intercept"]}')
check('odds age', abs(bo[1] - odds['ageCoef']) < 1e-6, f'{bo[1]} vs {odds["ageCoef"]}')
check('odds size', abs(bo[2] - odds['sizeCoef']) < 1e-6, f'{bo[2]} vs {odds["sizeCoef"]}')
def odds_for(p):
    a = age_days(p); ay = 1.0 if a is None else a / 365.25
    z = bo[0] + bo[1] * ay + bo[2] * (math.log(p['tvl_usd']) - math.log(1e8))
    return 1 / (1 + math.exp(-max(-30, min(30, z))))

# --- 3-5. Board rows: implied, odds, multiple, ranks, verdicts ---
by_slug = {p['slug']: p for p in ps}
implied_bad = odds_bad = mult_bad = vil_bad = verdict_bad = netev_bad = 0
recomputed = []
for row in board:
    p = by_slug[row['slug']]
    mult, med_tvl, n = anchor_mult(p['category'])
    size_f = (p['tvl_usd'] / med_tvl) ** (beta[1] - 1)
    growth = clamp(p['change_7d'] if p['change_7d'] is not None else 0, -60, 120)
    growth_mult = 1 + (growth / 100) * 0.5
    a = age_days(p); age = 365 if a is None else a
    mat = 0.6 + (min(max(age, 0), 1095) / 1095) * 0.4
    raw = p['tvl_usd'] * mult * size_f * growth_mult * mat
    vil = max(1, round(raw))
    od = odds_for(p)
    implied = max(1, round(raw * od))
    multiple = round((implied / p['tvl_usd']) * 10000) / 10000
    if vil != row['model']['value_if_launches']: vil_bad += 1
    if abs(od - row['odds']) > 0.00005: odds_bad += 1
    if implied != row['implied_value_usd']: implied_bad += 1
    if abs(multiple - row['multiple']) > 0.00005: mult_bad += 1
    # verdict
    capital = 5000 if (p['chains'] and p['chains'][0].strip().lower() == 'ethereum') else 2500
    pool = 0.08 * implied
    share = pool * (capital / p['tvl_usd'])
    gas = gas_per_tx(p['chains'][0] if p['chains'] else '')
    gas_total = 16 * gas + (2 * gas_per_tx(p['chains'][1]) if len(p['chains']) >= 3 else 0)
    opp = (capital * 0.045 * 90) / 365
    total_cost = gas_total + opp
    net_ev = share - total_cost
    ratio = net_ev / total_cost if total_cost > 0 else 0
    verdict = 'FARM' if (net_ev >= 40 and ratio >= 1.5) else ('THIN' if net_ev >= 0 else 'SKIP')
    # P25-POSITIVE promotion uses the shipped band p25
    if row['farm']['verdict'] == 'P25-POSITIVE':
        p25 = row['uncertainty']['p25']
        pool25 = 0.08 * p25; share25 = pool25 * (capital / p['tvl_usd']); net25 = share25 - total_cost
        if verdict == 'FARM' and net25 >= 0: verdict = 'P25-POSITIVE'
    if verdict != row['farm']['verdict']:
        verdict_bad += 1
        print(f"  VERDICT DIFF #{row['rank']} {row['name']}: mine={verdict} (netEv {round(net_ev,2)}, ratio {ratio:.2f}) ship={row['farm']['verdict']} (netEv {row['farm']['netEv']}) chains={p['chains']} capital={capital} gasTotal mine={gas_total:.2f} ship={row['farm']['gasTotal']} share mine={share:.4f} ship={row['farm']['share']}")
    if abs(round(net_ev, 2) - row['farm']['netEv']) > 0.005:
        netev_bad += 1
        print(f"  NETEV DIFF #{row['rank']} {row['name']}: mine={round(net_ev,2)} ship={row['farm']['netEv']} (share mine={share:.4f} ship={row['farm']['share']}, gasTotal mine={gas_total:.2f} ship={row['farm']['gasTotal']}, totalCost mine={round(total_cost,2)} ship={row['farm']['totalCost']})")
    recomputed.append((implied, row['slug']))
check('value-if-launches (200 rows)', vil_bad == 0, f'{vil_bad} differ')
check('token odds (200 rows)', odds_bad == 0, f'{odds_bad} differ')
check('implied values (200 rows)', implied_bad == 0, f'{implied_bad} differ')
check('multiples (200 rows)', mult_bad == 0, f'{mult_bad} differ')
check('verdicts (200 rows)', verdict_bad == 0, f'{verdict_bad} differ')
check('net EV (200 rows)', netev_bad == 0, f'{netev_bad} differ')
# ranks: implied desc, slug tie-break
recomputed.sort(key=lambda t: (-t[0], t[1]))
rank_bad = sum(1 for i, (imp, slug) in enumerate(recomputed) if board[i]['slug'] != slug)
check('ranks 1-200 in order', rank_bad == 0, f'{rank_bad} out of order')

# --- 6. Playbook totals (from the shipped band + farm figures) ---
pb_bad = 0
for row in board:
    pb = row.get('playbook')
    if not pb: continue
    p = by_slug[row['slug']]
    capital = row['farm']['capital']
    mech = mechanism(p)
    fees = []
    if mech == 'liquidity provision':
        sw = round((capital / 2) * 0.003, 2); fees += [sw, sw]
    elif mech == 'staked receipt':
        sw = round(capital * 0.003, 2); fees += [sw, sw]
    touched = [p['chains'][0] if p['chains'] else '']
    if len(p['chains']) >= 3: touched.append(p['chains'][1])
    for ch in touched:
        if ch.strip().lower() != 'ethereum': fees.append(2.0)
    for ch in touched:
        fees.append(round(gas_per_tx(ch), 2))
    fees.append(0.0)
    extra = round(sum(fees), 2)
    if abs(extra - pb['extraTotal']) > 0.005: pb_bad += 1; continue
    if abs(round(row['farm']['netEv'] - extra, 2) - pb['netEvFull']) > 0.005: pb_bad += 1
    if abs(round(row['farm']['netEvP25'] - extra, 2) - pb['netEvP25Full']) > 0.005: pb_bad += 1
    be_full = round(row['farm']['breakevenValue'] + (extra * p['tvl_usd']) / (0.08 * capital), 2)
    if abs(be_full - pb['breakevenFull']) > 0.005: pb_bad += 1
n_pb = sum(1 for r in board if r.get('playbook'))
check(f'playbook totals ({n_pb} playbooks)', pb_bad == 0, f'{pb_bad} mismatches')

# --- 7. Accounting ---
acc = radar['accounting']
check('accounting sums to 758', sum(g['count'] for g in acc['groups']) == 758 == acc['total'],
      f"sum={sum(g['count'] for g in acc['groups'])} total={acc['total']}")
check('watchlist total', abs(sum(r['implied_value_usd'] for r in board if r['is_watchlist']) / 1e9 - 0.347) < 0.001,
      f"${sum(r['implied_value_usd'] for r in board if r['is_watchlist'])/1e9:.3f}B")

print()
if fails:
    print(f'RECONCILIATION FAILED ({len(fails)}):')
    for f in fails: print('  -', f)
    sys.exit(1)
print('RECONCILIATION PASSED: ridge + odds fits, 200 implied/odds/multiples, ranks, verdicts, net EVs, playbook totals, accounting — all match the built board.')
