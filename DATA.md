# Data provenance

All files in `data/` are **frozen snapshots** for the observation window unless noted.

## Observation window

| Field | Value |
|-------|-------|
| Height range | 941,224 – 951,464 |
| Blocks with mining activity | 6,834 |
| Companion report | *Wasting Assets and Regenerative Scarcity: An Empirical Study of Competitive Text Under Public Scoring* (Witmore, 2026) |

The winners cache may include rows slightly outside this window; scripts that need the window should filter on `height`.

## Corpora

### `data/research/scorer-cluster/test-1-corpus/profiles.jsonl`

- **n ≈ 7,682** scored sentences from on-chain winners (ranks 1–5 in the export pass used for winner PCA).
- Each line: height, domain, sentence text, 256-dim verbose profile, blend, gates.
- **Source:** on-chain winner export, re-scored locally with `@cogcoin/scoring` WASM.
- **Used by:** `f26-judge-covariance.mjs`, `s1-pca-bootstrap.mjs`, `a4-effective-rank.mjs`, `s2-project-on-f26.mjs` (chain side).

### `data/research/s2-random-valid/profiles.jsonl`

- **n = 5,000** gate-passing sentences from structural templates + random BIP-39 fillers.
- **Seed:** 7; **50** block contexts sampled from chain corpus (`meta.json`).
- **No LLM** — WASM scoring only.
- **Used by:** `a4-effective-rank.mjs`, `s2-project-on-f26.mjs`, `f46-h1h2-subspace.mjs`.

### `data/ecosystem/dashboard-winners-cache.jsonl`

- **n ≈ 24,883** placement rows (multiple domains per block).
- Fields include height, domainId, rank, canonicalBlend, sentence text, COG reward.
- **Source:** indexer export of on-chain placements during the analysis period.
- **Used by:** `f44b-winner-margin-template.mjs`, `f44c-counterfactual-w.mjs`.

### `data/research/scorer-cluster/blockhashes.jsonl`

- Referenced block hashes for heights in the study window.
- **Used by:** `tier3-form-tolerance.mjs`, `f44c-counterfactual-w.mjs` (with mempool.space fallback for gaps).

## Reference outputs (shipped for diff / claim checks)

| Path | Observation |
|------|-------------|
| `data/research/scorer-cluster/f26-judge-covariance/eigenvectors.json` | Obs. 3 |
| `data/research/s2-random-valid/f46-h1h2-subspace.json` | Obs. 5 |
| `data/research/s2-random-valid/s2-analysis-summary.json` | Obs. 4b |
| `data/research/a4-effective-rank/summary.json` | Obs. 4a |
| `data/research/tier3-form-tolerance/summary.json` | Obs. 6 |
| `data/research/f44b-winner-margin/summary.json` | Obs. 9, 11 |
| `data/research/f44c-counterfactual-w/summary.json` | Obs. 10 |
| `data/research/s1-pca-bootstrap/summary.json` | Obs. 3 stability |
| `data/research/f28-w-distribution/temporal-stability.json` | Obs. 2 |

## Approximate sizes

| File | Size |
|------|------|
| `test-1-corpus/profiles.jsonl` | ~15 MB |
| `s2-random-valid/profiles.jsonl` | ~9 MB |
| `dashboard-winners-cache.jsonl` | ~7 MB |
| `blockhashes.jsonl` | ~640 KB |
| **Total `data/`** | ~33 MB |

## Regenerating from chain (advanced)

This package is designed to **reproduce headline numbers from frozen data** without a Bitcoin node.

Full rebuild from live chain requires a synced Cogcoin indexer export, WASM re-scoring via the pinned `@cogcoin/scoring` version in `package.json`, and optional regeneration of the 5k random-valid sweep. Those steps are outside this repository; the frozen outputs here let reviewers run `npm run reproduce` only.

## Integrity

After cloning, run `npm run reproduce`. Claim tolerances are defined in `replication/paper-claims.json`.
