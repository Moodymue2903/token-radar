"""Verify Superbot High's two quantitative claims against the repo's own data:
1. FLAT BASELINE: predict every peer with a constant multiple (global median
   0.214, and per-split train median) on the SAME frozen splits M0 was scored on.
2. SPEARMAN(pred, TVL) for M0 on the board (degeneracy check).
Replicates the repo's mulberry32 + Fisher-Yates + looMetrics exactly.
"""
import json, math

SNAP = '/home/hatch/workspace/makefun/token-radar-01-kit/token-radar-01-kit/input/snapshot.json'
BOARD = '/home/hatch/workspace/makefun/token-radar/out/board.json'
SEEDS = [11, 23, 37, 41, 53]
TIME_CUT = '2025-01-01'

# ---- mulberry32 (JS semantics, unsigned 32-bit) ----
def imul(a, b):
    return ((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF)) & 0xFFFFFFFF

def mulberry32(seed):
    a = seed & 0xFFFFFFFF
    def rng():
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = imul(a ^ (a >> 15), 1 | a)
        t2 = imul(t ^ (t >> 7), 61 | t)
        t = ((t + t2) & 0xFFFFFFFF) ^ t
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    return rng

def median(xs):
    s = sorted(xs)
    n = len(s)
    if n == 0: return float('nan')
    return s[(n-1)//2] if n % 2 == 1 else 0.5*(s[n//2 - 1] + s[n//2])

def ranks(v):
    order = sorted(range(len(v)), key=lambda i: v[i])
    r = [0.0]*len(v)
    i = 0
    while i < len(order):
        j = i
        while j+1 < len(order) and v[order[j+1]] == v[order[i]]:
            j += 1
        avg = (i + j)/2 + 1
        for k in range(i, j+1):
            r[order[k]] = avg
        i = j + 1
    return r

def spearman(xs, ys):
    rx, ry = ranks(xs), ranks(ys)
    n = len(xs)
    mx = sum(rx)/n; my = sum(ry)/n
    sxy = sum((rx[i]-mx)*(ry[i]-my) for i in range(n))
    sxx = sum((x-mx)**2 for x in rx); syy = sum((y-my)**2 for y in ry)
    return sxy / math.sqrt(sxx*syy) if sxx and syy else 0.0

def loo_metrics(preds, acts):
    ape = [abs(p-a)/a for p, a in zip(preds, acts)]
    maxr = [max(p/a, a/p) for p, a in zip(preds, acts)]
    n = len(preds)
    return {
        'median1p': 1 + median(ape),
        'medianMax': median(maxr),
        'within2': 100*sum(1 for x in maxr if x <= 2)/n,
        'within3': 100*sum(1 for x in maxr if x <= 3)/n,
        'spearman': spearman(preds, acts),
    }

# ---- peers (isPeer: gecko_id + symbol + mcap>0 + tvl>0) ----
snap = json.load(open(SNAP))
peers = [p for p in snap['protocols']
         if p.get('gecko_id') is not None and p.get('symbol') is not None
         and p.get('mcap_usd') is not None and p['mcap_usd'] > 0 and p['tvl_usd'] > 0]
print(f"peers: {len(peers)} (expect 128)")
mults = [p['mcap_usd']/p['tvl_usd'] for p in peers]
print(f"global median multiple: {median(mults):.4f} (expect 0.214)")
print(f"p5={sorted(mults)[int(0.05*127)]:.4f} p95={sorted(mults)[int(0.95*127)]:.4f}")

# ---- blind splits (mulberry32 + Fisher-Yates, hold = first 26) ----
def blind_splits():
    out = []
    for seed in SEEDS:
        rng = mulberry32(seed)
        idx = list(range(len(peers)))
        for i in range(len(idx)-1, 0, -1):
            j = math.floor(rng()*(i+1))
            idx[i], idx[j] = idx[j], idx[i]
        hold = set(idx[:26])
        out.append(([peers[i] for i in range(len(peers)) if i not in hold],
                    [peers[i] for i in range(len(peers)) if i in hold]))
    return out

splits = blind_splits()
print(f"blind split sizes: train {len(splits[0][0])} / test {len(splits[0][1])} (expect 102/26)")

def flat_metrics(train, test, const):
    preds = [const * p['tvl_usd'] for p in test]
    acts = [p['mcap_usd'] for p in test]
    return loo_metrics(preds, acts)

# flat with GLOBAL median constant
g = median(mults)
per_seed_g = [flat_metrics(tr, te, g) for tr, te in splits]
print("\nFLAT-GLOBAL (const=0.214) blind x5, mean of per-seed:")
for k in ['median1p','within2','within3','spearman']:
    print(f"  {k}: {sum(m[k] for m in per_seed_g)/5:.4f}")

# flat with TRAIN median constant (the honest in-split version)
per_seed_t = []
for tr, te in splits:
    c = median([p['mcap_usd']/p['tvl_usd'] for p in tr])
    per_seed_t.append(flat_metrics(tr, te, c))
print("\nFLAT-TRAIN (const=train median) blind x5, mean of per-seed:")
for k in ['median1p','within2','within3','spearman']:
    print(f"  {k}: {sum(m[k] for m in per_seed_t)/5:.4f}")

# time-split flat
ts_train = [p for p in peers if p['listed_at'] is not None and p['listed_at'] < TIME_CUT]
ts_test = [p for p in peers if p['listed_at'] is not None and p['listed_at'] >= TIME_CUT]
print(f"\ntime-split sizes: train {len(ts_train)} / test {len(ts_test)} (expect 64/31)")
cts = median([p['mcap_usd']/p['tvl_usd'] for p in ts_train])
m_ts = flat_metrics(ts_train, ts_test, cts)
print(f"FLAT-TRAIN time-split: median1p x{m_ts['median1p']:.4f} within2 {m_ts['within2']:.1f}% within3 {m_ts['within3']:.1f}%")

# LOO flat (constant = median of the other 127; ~global median)
loo_preds, loo_acts = [], []
for i, p in enumerate(peers):
    others = [q['mcap_usd']/q['tvl_usd'] for j, q in enumerate(peers) if j != i]
    c = median(others)
    loo_preds.append(c * p['tvl_usd']); loo_acts.append(p['mcap_usd'])
m_loo = loo_metrics(loo_preds, loo_acts)
print(f"FLAT LOO: median1p x{m_loo['median1p']:.4f} within2 {m_loo['within2']:.1f}% within3 {m_loo['within3']:.1f}% spearman {m_loo['spearman']:.3f}")

# all-128 flat (global median) for reference
m_all = loo_metrics([g*p['tvl_usd'] for p in peers], [p['mcap_usd'] for p in peers])
print(f"FLAT-GLOBAL all-128: median1p x{m_all['median1p']:.4f} within2 {m_all['within2']:.1f}% within3 {m_all['within3']:.1f}%")

# ---- M0 Spearman(pred, TVL) on the board (degeneracy check) ----
board = json.load(open(BOARD))
rows = board['rows'] if isinstance(board, dict) else board
imp = [r['implied'] for r in rows]
tvl = [r['tvl_usd'] for r in rows]
print(f"\nboard rows: {len(rows)}")
print(f"Spearman(M0 implied, TVL) on board: {spearman(imp, tvl):.4f}")
print(f"Spearman(M0 implied, TVL) on board, watchlist only: "
      f"{spearman([r['implied'] for r in rows if r.get('watchlist')], [r['tvl_usd'] for r in rows if r.get('watchlist')]):.4f}")
# also: Spearman of the multiple vs TVL (does the multiple itself track TVL?)
mult_b = [r['implied']/r['tvl_usd'] for r in rows]
print(f"Spearman(M0 multiple, TVL) on board: {spearman(mult_b, tvl):.4f}")

print("\nM0 reported for comparison: blind median x1.8859 within2 23.8% within3 38.5% Spearman 0.409; "
      "time-split x1.8401; LOO x1.8865 within3 43.8% Spearman 0.367.")
