# Cogcoin regenerative-scarcity — replication package

Companion replication package for **Wasting Assets and Regenerative Scarcity: An Empirical Study of Competitive Text Under Public Scoring** (Witmore, 2026; arXiv forthcoming).

- **Protocol specification:** [cogcoin.org/whitepaper.md](https://cogcoin.org/whitepaper.md)
- **Related work (prompt lab):** [RELATED-WORK.md](RELATED-WORK.md)

This repository holds on-chain corpora and analysis code for measured claims in heights **941,224–951,464**. It does not include mining prompts, live client configuration, or infrastructure setup.

## Verify headline statistics

Requirements: **Node.js ≥ 20**, **npm**. Optional: **Python 3** for temporal-stability checks in `reproduce:full`.

```bash
git clone https://github.com/mwitmore/cogcoin-regenerative-scarcity.git
cd cogcoin-regenerative-scarcity
npm install
npm run reproduce
```

Runtime: about **1–3 minutes** on a laptop (JSONL linear algebra; no LLM API; no Bitcoin node).

The command re-runs analyses on frozen data and checks **eleven headline statistics** against tolerances in `replication/paper-claims.json`.

### Full WASM replication

Re-scores sentences with the public `@cogcoin/scoring` WASM bundle (~10–45 min):

```bash
npm run reproduce:full
```

| Step | Script | Claim |
|------|--------|-------|
| Blend linearity | `scripts/verify-blendseed.mjs` | 1 |
| Gate tolerance | `scripts/tier3-form-tolerance.mjs` | 6 |
| W-churn | `scripts/f44c-counterfactual-w.mjs` | 10 |
| W temporal stability | `scripts/f28-temporal-stability.py` | 2 |

## Claims and scripts

| Claim | Summary | Script(s) |
|-------|---------|-----------|
| 1 | Blend linearity | `verify-blendseed.mjs` |
| 2 | Reward-direction stability | `f28-temporal-stability.py` |
| 3 | Winner PCA + bootstrap | `f26-judge-covariance.mjs`, `s1-pca-bootstrap.mjs` |
| 4a | Participation ratio (chain / random) | `a4-effective-rank.mjs` |
| 4b | Random-valid vs chain mean blend | `s2-project-on-f26.mjs` |
| 5 | H1↔H2 principal angle; ceiling fraction | `f46-h1h2-subspace.mjs` |
| 6 | Gate vs blend (SVO fails; declarative passes) | `tier3-form-tolerance.mjs` |
| 9 | Thin rank-1 margins | `f44b-winner-margin-template.mjs` |
| 10 | Effective winner count | `f44c-counterfactual-w.mjs` |

Weight-recovery for claim 2 via `f28-w-distribution.py` needs a large probe corpus (~275 MB) not shipped here; frozen `w_projections.jsonl` and `temporal-stability.json` are included.

## Data

See [DATA.md](DATA.md) for provenance and file sizes.

```
data/research/scorer-cluster/test-1-corpus/profiles.jsonl   # chain winner profiles
data/research/s2-random-valid/profiles.jsonl                # 5,000 gate-passing random sentences
data/ecosystem/dashboard-winners-cache.jsonl                # on-chain placements
data/research/scorer-cluster/blockhashes.jsonl              # referenced block hashes
```

## Individual scripts

```bash
npm run f26       # winner PCA
npm run s1        # PCA bootstrap
npm run a4        # participation ratio
npm run s2        # random-valid projections
npm run f46       # principal angles
npm run f44b      # rank margins
npm run f44c      # W-churn (WASM)
npm run f44-gate  # gate-tolerance experiment (WASM)
npm run f4        # blend linearity (WASM)
npm run f28       # temporal stability (Python)
```

## Authorship

The field report is published under **Michael Witmore** (arXiv). On-chain mining activity in the report is described by domain name where relevant.

Prose and analysis scripts were developed with LLM-assisted editing; headline statistics are independently checkable via `npm run reproduce` on release v1.0.0.

## Citation

```bibtex
@software{witmore2026cogcoin_regenerative_scarcity_replication,
  author = {Witmore, Michael},
  title = {Replication package: Wasting Assets and Regenerative Scarcity},
  year = {2026},
  url = {https://github.com/mwitmore/cogcoin-regenerative-scarcity}
}
```

See also [CITATION.cff](CITATION.cff).

## License

MIT — [LICENSE](LICENSE). On-chain sentence text remains public chain data. `@cogcoin/scoring` is subject to its upstream license.
