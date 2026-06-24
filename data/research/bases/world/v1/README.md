# world-basis v1

Built 2026-05-14T23:53:38Z from `data/research/s2-random-valid/profiles.jsonl` (n=5000, skipped=0).

- corpus sha256: `48624f2e9ab291f4...`
- slot range: [32, 256)
- rank-1 only filter: False
- supersedes: none
- git sha: `6d7c651b68c8`

## Notes

First world basis. Source: S2 random-valid corpus of 5000 gates-passing random structural sentences with no LLM involvement. Represents the geometry of what *can* score high in the cogcoin oracle, independent of mining strategy. Time-invariant unless the canonical scoring bundle changes on-chain.

## Top 10 PCs

| PC | eigenvalue | var_share | cum_var |
|---:|---:|---:|---:|
| 1 | 0.89837 | 24.90% | 24.90% |
| 2 | 0.39606 | 10.98% | 35.88% |
| 3 | 0.18324 | 5.08% | 40.95% |
| 4 | 0.13681 | 3.79% | 44.75% |
| 5 | 0.12870 | 3.57% | 48.31% |
| 6 | 0.10529 | 2.92% | 51.23% |
| 7 | 0.09009 | 2.50% | 53.73% |
| 8 | 0.08761 | 2.43% | 56.16% |
| 9 | 0.07784 | 2.16% | 58.31% |
| 10 | 0.07649 | 2.12% | 60.43% |

Total variance (sum of all eigenvalues, including PCs > 30): 3.60812

## Files

- `manifest.json` — provenance (this version is immutable; do not edit)
- `eigenvectors.json` — first 30 PCs with full eigenvectors
- `chain_mean.json` — 224-d centering vector required for projection
- `corpus-stats.json` — per-slot mean/std of the input corpus
- `build.log` — stdout from the build run