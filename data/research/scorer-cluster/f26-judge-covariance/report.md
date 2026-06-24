# F26 — Judge-judge covariance PCA on the chain-winner corpus

Generated: 2026-06-24T20:06:52.467Z
Profiles: `data/research/scorer-cluster/test-1-corpus/profiles.jsonl`
Filter: rank-1, gates-passing, all domains.
N = 3566 profiles, 224 slots (32–255).

## Headline

Top **30** principal components reach **81.6%** cumulative variance.
Of those, **8** load onto already-named slot families (Factor A, Well-Sig, Riddle, dom-56),
**19** are weakly named (2-3 slot overlap), and **3** are unnamed (candidate fifth-corner axes).

## Top 30 PCs — variance share and classification

| PC | λ | var share | cum var | top-3 loading slots | classification | named family (best match) |
| ---: | ---: | ---: | ---: | --- | --- | --- |
| 1 | 0.8119 | 20.5% | 20.5% | 219(-0.24), 227(-0.22), 252(+0.21) | **named** | Well-Sig (F10b — dominant-well signature) (8/10) |
| 2 | 0.4134 | 10.5% | 31.0% | 204(+0.37), 203(+0.28), 208(+0.24) | **weakly-named** | dom-56 bulletin (F22 — Operator C / @claudes) (2/10) |
| 3 | 0.3133 | 7.9% | 38.9% | 133(-0.46), 143(+0.42), 136(-0.31) | **named** | Factor A (F10b — Operator A / @crypto corner) (4/10) |
| 4 | 0.1789 | 4.5% | 43.4% | 239(+0.25), 242(-0.25), 204(+0.24) | **weakly-named** | Riddle (F13 — domain-58 anti-fluency family) (3/10) |
| 5 | 0.1313 | 3.3% | 46.8% | 227(+0.59), 219(-0.39), 223(-0.35) | **named** | Well-Sig (F10b — dominant-well signature) (6/10) |
| 6 | 0.1226 | 3.1% | 49.8% | 239(+0.28), 242(-0.28), 187(-0.23) | **weakly-named** | Well-Sig (F10b — dominant-well signature) (3/10) |
| 7 | 0.1105 | 2.8% | 52.6% | 190(-0.94), 221(+0.15), 223(-0.15) | **named** | Well-Sig (F10b — dominant-well signature) (4/10) |
| 8 | 0.1089 | 2.8% | 55.4% | 227(+0.53), 223(+0.49), 221(-0.49) | **named** | Well-Sig (F10b — dominant-well signature) (5/10) |
| 9 | 0.0933 | 2.4% | 57.8% | 228(-0.66), 227(-0.24), 239(+0.23) | **named** | Well-Sig (F10b — dominant-well signature) (6/10) |
| 10 | 0.0925 | 2.3% | 60.1% | 239(-0.46), 242(+0.46), 187(-0.24) | **weakly-named** | Well-Sig (F10b — dominant-well signature) (2/10) |
| 11 | 0.0803 | 2.0% | 62.1% | 236(+0.58), 246(+0.45), 187(+0.28) | **unnamed** | — |
| 12 | 0.0760 | 1.9% | 64.0% | 228(+0.57), 219(-0.37), 236(+0.29) | **named** | Well-Sig (F10b — dominant-well signature) (5/10) |
| 13 | 0.0703 | 1.8% | 65.8% | 236(+0.39), 187(-0.39), 246(+0.31) | **named** | Well-Sig (F10b — dominant-well signature) (4/10) |
| 14 | 0.0591 | 1.5% | 67.3% | 219(-0.62), 196(+0.32), 255(+0.22) | **weakly-named** | Well-Sig (F10b — dominant-well signature) (2/10) |
| 15 | 0.0552 | 1.4% | 68.7% | 153(-0.55), 196(-0.48), 150(-0.26) | **weakly-named** | Well-Sig (F10b — dominant-well signature) (2/10) |
| 16 | 0.0497 | 1.3% | 70.0% | 153(+0.58), 214(+0.33), 149(+0.19) | **weakly-named** | dom-56 bulletin (F22 — Operator C / @claudes) (3/10) |
| 17 | 0.0467 | 1.2% | 71.2% | 229(+0.39), 196(-0.28), 204(-0.23) | **weakly-named** | Well-Sig (F10b — dominant-well signature) (2/10) |
| 18 | 0.0414 | 1.0% | 72.2% | 200(-0.48), 158(-0.35), 231(-0.30) | **weakly-named** | Factor A (F10b — Operator A / @crypto corner) (2/10) |
| 19 | 0.0381 | 1.0% | 73.2% | 238(-0.38), 237(-0.31), 149(+0.31) | **weakly-named** | Well-Sig (F10b — dominant-well signature) (2/10) |
| 20 | 0.0368 | 0.9% | 74.1% | 235(+0.81), 231(-0.22), 229(+0.21) | **weakly-named** | Well-Sig (F10b — dominant-well signature) (2/10) |
| 21 | 0.0362 | 0.9% | 75.0% | 149(+0.48), 162(+0.34), 150(-0.32) | **weakly-named** | dom-56 bulletin (F22 — Operator C / @claudes) (2/10) |
| 22 | 0.0343 | 0.9% | 75.9% | 237(+0.72), 231(-0.37), 238(+0.23) | **weakly-named** | dom-56 bulletin (F22 — Operator C / @claudes) (2/10) |
| 23 | 0.0339 | 0.9% | 76.7% | 238(+0.52), 149(+0.37), 150(+0.29) | **weakly-named** | Well-Sig (F10b — dominant-well signature) (3/10) |
| 24 | 0.0322 | 0.8% | 77.6% | 231(+0.53), 149(-0.35), 237(+0.32) | **weakly-named** | Well-Sig (F10b — dominant-well signature) (3/10) |
| 25 | 0.0306 | 0.8% | 78.3% | 162(+0.61), 149(-0.35), 187(-0.31) | **weakly-named** | Well-Sig (F10b — dominant-well signature) (2/10) |
| 26 | 0.0280 | 0.7% | 79.0% | 224(-0.50), 162(+0.39), 157(+0.28) | **weakly-named** | Well-Sig (F10b — dominant-well signature) (2/10) |
| 27 | 0.0274 | 0.7% | 79.7% | 224(+0.47), 157(-0.35), 150(-0.28) | **unnamed** | — |
| 28 | 0.0260 | 0.7% | 80.4% | 238(+0.41), 160(+0.32), 254(+0.29) | **unnamed** | — |
| 29 | 0.0250 | 0.6% | 81.0% | 150(-0.54), 214(+0.32), 152(+0.30) | **weakly-named** | dom-56 bulletin (F22 — Operator C / @claudes) (2/10) |
| 30 | 0.0242 | 0.6% | 81.6% | 157(-0.59), 224(-0.43), 254(-0.30) | **weakly-named** | Well-Sig (F10b — dominant-well signature) (2/10) |

## Detailed loadings — top 10 PCs

### PC1 — variance share 20.5%, cumulative 20.5%

Classification: **named** — best match: **Well-Sig (F10b — dominant-well signature)** (8/10 top loadings overlap)

| rank | slot | loading |
| ---: | ---: | ---: |
| 1 | 219 | -0.242 |
| 2 | 227 | -0.219 |
| 3 | 252 | +0.213 |
| 4 | 248 | -0.213 |
| 5 | 218 | -0.180 |
| 6 | 217 | -0.172 |
| 7 | 232 | -0.170 |
| 8 | 206 | -0.167 |
| 9 | 255 | -0.163 |
| 10 | 234 | -0.157 |
| 11 | 220 | -0.147 |
| 12 | 222 | -0.145 |

### PC2 — variance share 10.5%, cumulative 31.0%

Classification: **weakly-named** — best match: **dom-56 bulletin (F22 — Operator C / @claudes)** (2/10 top loadings overlap)

| rank | slot | loading |
| ---: | ---: | ---: |
| 1 | 204 | +0.373 |
| 2 | 203 | +0.277 |
| 3 | 208 | +0.243 |
| 4 | 255 | -0.194 |
| 5 | 240 | +0.155 |
| 6 | 210 | -0.153 |
| 7 | 250 | -0.143 |
| 8 | 185 | +0.132 |
| 9 | 133 | +0.130 |
| 10 | 189 | +0.128 |
| 11 | 125 | -0.128 |
| 12 | 124 | -0.125 |

### PC3 — variance share 7.9%, cumulative 38.9%

Classification: **named** — best match: **Factor A (F10b — Operator A / @crypto corner)** (4/10 top loadings overlap)

| rank | slot | loading |
| ---: | ---: | ---: |
| 1 | 133 | -0.457 |
| 2 | 143 | +0.425 |
| 3 | 136 | -0.310 |
| 4 | 139 | -0.270 |
| 5 | 204 | +0.222 |
| 6 | 153 | +0.160 |
| 7 | 255 | -0.150 |
| 8 | 228 | -0.147 |
| 9 | 227 | +0.146 |
| 10 | 132 | -0.141 |
| 11 | 130 | -0.129 |
| 12 | 203 | +0.124 |

### PC4 — variance share 4.5%, cumulative 43.4%

Classification: **weakly-named** — best match: **Riddle (F13 — domain-58 anti-fluency family)** (3/10 top loadings overlap)

| rank | slot | loading |
| ---: | ---: | ---: |
| 1 | 239 | +0.248 |
| 2 | 242 | -0.248 |
| 3 | 204 | +0.243 |
| 4 | 196 | -0.237 |
| 5 | 231 | +0.195 |
| 6 | 214 | -0.186 |
| 7 | 240 | -0.168 |
| 8 | 202 | +0.161 |
| 9 | 189 | -0.159 |
| 10 | 203 | +0.149 |
| 11 | 153 | +0.146 |
| 12 | 238 | -0.145 |

### PC5 — variance share 3.3%, cumulative 46.8%

Classification: **named** — best match: **Well-Sig (F10b — dominant-well signature)** (6/10 top loadings overlap)

| rank | slot | loading |
| ---: | ---: | ---: |
| 1 | 227 | +0.585 |
| 2 | 219 | -0.387 |
| 3 | 223 | -0.352 |
| 4 | 221 | +0.352 |
| 5 | 224 | -0.113 |
| 6 | 229 | -0.100 |
| 7 | 194 | -0.097 |
| 8 | 133 | +0.095 |
| 9 | 143 | -0.093 |
| 10 | 190 | +0.091 |
| 11 | 238 | +0.086 |
| 12 | 239 | +0.085 |

### PC6 — variance share 3.1%, cumulative 49.8%

Classification: **weakly-named** — best match: **Well-Sig (F10b — dominant-well signature)** (3/10 top loadings overlap)

| rank | slot | loading |
| ---: | ---: | ---: |
| 1 | 239 | +0.281 |
| 2 | 242 | -0.281 |
| 3 | 187 | -0.229 |
| 4 | 193 | -0.171 |
| 5 | 158 | -0.164 |
| 6 | 200 | -0.162 |
| 7 | 134 | -0.154 |
| 8 | 223 | +0.143 |
| 9 | 221 | -0.143 |
| 10 | 219 | +0.142 |
| 11 | 202 | -0.137 |
| 12 | 78 | +0.136 |

### PC7 — variance share 2.8%, cumulative 52.6%

Classification: **named** — best match: **Well-Sig (F10b — dominant-well signature)** (4/10 top loadings overlap)

| rank | slot | loading |
| ---: | ---: | ---: |
| 1 | 190 | -0.941 |
| 2 | 221 | +0.155 |
| 3 | 223 | -0.155 |
| 4 | 219 | -0.104 |
| 5 | 214 | -0.069 |
| 6 | 153 | +0.069 |
| 7 | 187 | -0.066 |
| 8 | 160 | +0.066 |
| 9 | 227 | -0.065 |
| 10 | 206 | -0.052 |
| 11 | 228 | -0.051 |
| 12 | 255 | -0.047 |

### PC8 — variance share 2.8%, cumulative 55.4%

Classification: **named** — best match: **Well-Sig (F10b — dominant-well signature)** (5/10 top loadings overlap)

| rank | slot | loading |
| ---: | ---: | ---: |
| 1 | 227 | +0.531 |
| 2 | 223 | +0.487 |
| 3 | 221 | -0.487 |
| 4 | 190 | -0.197 |
| 5 | 229 | -0.163 |
| 6 | 228 | -0.120 |
| 7 | 204 | +0.106 |
| 8 | 239 | -0.101 |
| 9 | 242 | +0.101 |
| 10 | 153 | -0.092 |
| 11 | 255 | +0.078 |
| 12 | 196 | -0.078 |

### PC9 — variance share 2.4%, cumulative 57.8%

Classification: **named** — best match: **Well-Sig (F10b — dominant-well signature)** (6/10 top loadings overlap)

| rank | slot | loading |
| ---: | ---: | ---: |
| 1 | 228 | -0.663 |
| 2 | 227 | -0.237 |
| 3 | 239 | +0.227 |
| 4 | 242 | -0.227 |
| 5 | 219 | -0.222 |
| 6 | 204 | -0.206 |
| 7 | 240 | +0.182 |
| 8 | 218 | +0.150 |
| 9 | 229 | -0.147 |
| 10 | 233 | +0.124 |
| 11 | 187 | +0.110 |
| 12 | 254 | +0.106 |

### PC10 — variance share 2.3%, cumulative 60.1%

Classification: **weakly-named** — best match: **Well-Sig (F10b — dominant-well signature)** (2/10 top loadings overlap)

| rank | slot | loading |
| ---: | ---: | ---: |
| 1 | 239 | -0.457 |
| 2 | 242 | +0.457 |
| 3 | 187 | -0.244 |
| 4 | 194 | +0.202 |
| 5 | 219 | -0.200 |
| 6 | 153 | +0.184 |
| 7 | 193 | -0.176 |
| 8 | 190 | +0.164 |
| 9 | 228 | -0.156 |
| 10 | 160 | -0.144 |
| 11 | 229 | -0.137 |
| 12 | 185 | -0.123 |

## Unnamed high-variance axes (candidate fifth-corner directions)

Found **3** unnamed axes in the top 30 PCs:

- **PC11** (var share 2.0%): slot 236 (+0.576), slot 246 (+0.447), slot 187 (+0.276), slot 239 (-0.245), slot 242 (+0.245)
- **PC27** (var share 0.7%): slot 224 (+0.469), slot 157 (-0.348), slot 150 (-0.280), slot 162 (+0.278), slot 238 (+0.233)
- **PC28** (var share 0.7%): slot 238 (+0.409), slot 160 (+0.322), slot 254 (+0.290), slot 240 (-0.232), slot 195 (+0.223)

These are the candidate axes for **F25 (judge-probing)** to explore. For each, design a prompt that maximally activates the top-loading slots and measure whether the resulting sentences score competitively. If yes, the corpus contains an undiscovered fifth corner.

## Methodology note

Eigenvectors extracted via 300-iteration power iteration with deflation. The 224×224 covariance matrix is symmetric positive semi-definite, so power iteration is stable; deflation accuracy degrades after the first ~30 components but is sufficient for the top-30 ranking we need here. Cumulative-variance ratios are exact.

Named families used for classification:

- **Factor A (F10b — Operator A / @crypto corner)**: slots 128, 130, 132, 133, 134, 136, 139, 186, 213
- **Well-Sig (F10b — dominant-well signature)**: slots 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 248, 249, 250, 251, 252
- **Riddle (F13 — domain-58 anti-fluency family)**: slots 129, 135, 142, 189, 196, 214, 225
- **dom-56 bulletin (F22 — Operator C / @claudes)**: slots 137, 150, 153, 156, 163, 180, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215

Classification rule: an axis is "named" if ≥4 of its top-10 loading slots overlap a named family; "weakly-named" if 2-3 overlap; "unnamed" if 0-1 overlap.