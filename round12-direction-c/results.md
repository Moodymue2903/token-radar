=== DIRECTION C — CATEGORY COMPS WITH HIERARCHICAL SHRINKAGE ===
peers n=95 (fit peers, listed_at present) | categories=30 | metric<=0 excluded=0 (logged; none)
kernel h=1.7269 (0.75 dex, frozen) | bootstrap 1000 resamples, mulberry32(555000) | blind seed 11 (only if parity)

--- LOO (primary, n=95) ---
C factor = exp(median |log err|) = x3.42 | median |log err| = 1.2287 | within-3x = 44.2% | empty peer sets = 11/95
ridge LOO cross-check (lib, same folds) = x2.74 (frozen baseline x2.74)
improvement vs ridge LOO = -24.7%  (bar: >= +5% PASS clear; <= -2% KILL; within ±2% parity)
bootstrap 95% CI: C factor [x2.46, x4.97] | improvement [-81.5%, 10.3%] (reporting only)
variance components (median over LOO folds): tau2=3.5675 | sigma2=3.6576 | rho_bar=-1.4717 | cats/fold=30 | n_c=1 cats/fold (median)=11 | n_c=0 cats/fold (median)=0
lam distribution (LOO): median=0.790 | n_eff median=3.75 | nPeers median=6

--- WF (secondary, train 64 / test 31) ---
C factor = x5.25 | within-3x = 32.3% | empty peer sets = 14/31
improvement vs ridge WF (x2.19) = -139.6%
bootstrap 95% CI: C factor [x3.07, x5.71]
WF variance components: tau2=0.0000 | sigma2=4.2617 | rho_bar=-1.6582 | s2_btw=2.1207 | mean(1/n_c)=0.5740 | cats=23 | n_c=1 cats=8 | n_c=0 cats=7

--- VERDICT (pre-registered) ---
improvement vs ridge LOO = -24.7% | blind run = false | blind score = n/a
VERDICT: UNDECIDED — worse than -2% on the quant bar, but the literal table requires blind <= 3-2 for KILL and blind is only run in the parity band, so it was not run; no blind outcome can reach PASS (quant bar failed decisively: LOO -24.7%, WF -139.6%); substantive recommendation is KILL — see VERDICT.md
