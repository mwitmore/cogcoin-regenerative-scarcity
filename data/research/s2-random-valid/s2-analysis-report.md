# S2 — Random-valid-sentence baseline (analysis)

Generated: 2026-06-24T20:07:09.253Z
Chain corpus: 3566 rank-1 winners from `data/research/scorer-cluster/test-1-corpus/profiles.jsonl`
Random corpus: 5000 gates-passing sentences from `data/research/s2-random-valid/profiles.jsonl`
F26 reference: `data/research/scorer-cluster/f26-judge-covariance/eigenvectors.json`

## Headline

**Blend comparison (the doubly-filtered bias check):**
- Chain rank-1 winners: blend mean 416M (p10 349M, p90 489M)
- Random valid sentences: blend mean 413M (p10 356M, p90 473M)

Expected: chain >> random in mean blend (chain is mempool-winner-filtered).

**Unnamed-PC reach (the H2 existence question):**

| PC | classification | family (best match) | random max\|z\| | random n\|z\|≥2 | random n\|z\|≥3 | chain max\|z\| | chain n\|z\|≥2 |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| **11** | unnamed | — | 4.78 | 271 | 91 | 3.94 | 170 |
| **22** | weakly-named | dom-56 bulletin (F22 — Operator C / @claudes) | 5.34 | 233 | 84 | 4.67 | 195 |
| **27** | unnamed | — | 4.25 | 431 | 52 | 3.64 | 165 |
| **28** | unnamed | — | 4.53 | 697 | 109 | 4.11 | 178 |

## Per-PC projection comparison (top 14 PCs)

Projections normalized to **z-score against chain population** (1 σ = sqrt of F26 eigenvalue). Positive/negative direction is arbitrary (eigenvector sign convention).

| PC | classification | chain σ (=1) | chain p10/p90 | random σ | random p10/p90 | random max\|z\| | random n\|z\|≥2 |
| ---: | --- | ---: | --- | ---: | --- | ---: | ---: |
| 1 | named: Well-Sig | 1.000 | -1.40/1.16 | 0.81 | -0.54/1.68 | 2.74 | 217 |
| 2 | weakly: dom-56 | 1.000 | -1.30/1.29 | 0.49 | -2.06/-0.79 | 2.71 | 654 |
| 3 | named: Factor | 1.000 | -1.32/1.28 | 0.99 | -1.46/1.20 | 2.89 | 172 |
| 4 | weakly: Riddle | 1.000 | -1.36/1.19 | 1.09 | -2.41/0.44 | 5.44 | 879 |
| 5 | named: Well-Sig | 1.000 | -1.29/1.29 | 0.88 | -0.85/1.49 | 2.91 | 121 |
| 6 | weakly: Well-Sig | 1.000 | -1.30/1.28 | 0.89 | -1.36/0.95 | 3.45 | 129 |
| 7 | named: Well-Sig | 1.000 | -1.27/1.53 | 0.65 | -0.70/0.93 | 2.56 | 70 |
| 8 | named: Well-Sig | 1.000 | -1.36/1.25 | 0.97 | -1.73/0.83 | 3.93 | 315 |
| 9 | named: Well-Sig | 1.000 | -1.39/1.15 | 0.91 | -1.23/0.95 | 4.44 | 181 |
| 10 | weakly: Well-Sig | 1.000 | -1.23/1.30 | 0.93 | -1.16/1.19 | 3.56 | 205 |
| 11 | **unnamed** | 1.000 | -1.23/1.21 | 0.98 | -1.59/0.77 | 4.78 | 271 |
| 12 | named: Well-Sig | 1.000 | -1.24/1.23 | 0.93 | -1.13/1.24 | 3.44 | 173 |
| 13 | named: Well-Sig | 1.000 | -1.28/1.28 | 1.07 | -0.75/1.96 | 4.66 | 519 |
| 14 | weakly: Well-Sig | 1.000 | -1.29/1.25 | 0.87 | -0.60/1.62 | 3.50 | 224 |

## Family-label distribution (S3 methodology applied to random)

Labeling: each sentence is assigned to the family whose mean slot-value over its slot list is highest.

| Family | chain n | chain % | random n | random % |
| --- | ---: | ---: | ---: | ---: |
| Factor A | 2224 | 62.4% | 2468 | 49.4% |
| Well-Sig | 989 | 27.7% | 1084 | 21.7% |
| Riddle | 6 | 0.2% | 0 | 0.0% |
| dom-56 | 347 | 9.7% | 1448 | 29.0% |

## Purity comparison

Purity ∈ [0.25, 1.0]: 0.25 = winner fires all 4 families equally; 1.0 = winner fires only one family.

| corpus | mean | std | p10 | p50 | p90 | max | n ≥ 0.5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| chain rank-1 | 0.310 | 0.027 | 0.281 | 0.305 | 0.349 | 0.443 | 0 |
| random-valid | 0.313 | 0.028 | 0.285 | 0.306 | 0.352 | 0.460 | 0 |

## Interpretation

Random valid sentences reached |z| ≥ 2 on **1922** instances across PC1-PC4 (named corners) and **1632** instances across the four F26-flagged unnamed axes (PC11, PC22, PC27, PC28).

**Result: Random valid sentences reach the unnamed PCs at non-trivial rates** (1632 hits at |z|≥2). This is strong evidence that the geometry is **densely populated with reachable points** outside the named-corner axes; the chain's 4-corner concentration reflects a *discovery* phenomenon, not a *geometric* one. → **H2 strongly supported; the v6-v10 program is well-motivated and likely to find more existence proofs.**

**Purity finding:** Random-valid mean purity (0.313) is very close to chain-rank-1 mean purity (0.310). The "all winners fire all families" pattern observed in S3 is **not** an artifact of LLM filtering — it's a property of the protocol's scoring structure itself. → **Strong evidence that the 4 corners are continuous axes of variation, not discrete categorical modes.**

See `docs/findings.md` § "2026-05-13 — six new structural tests for H1/H2/H3" for the test design.