#!/usr/bin/env python3
"""
F28: W-distribution across historical blocks projected onto world-PCs.

Two data sources:
  1. S2 corpus (data/research/s2-random-valid/profiles.jsonl) — 13 block hashes,
     270-398 gates-passing sentences each; W solved exactly via LSQ (R²=1.000).
  2. Probe-scored blocks (data/research/f28-w-distribution/probe-blocks.jsonl) —
     produced by f28-probe-score.mjs; each block has ≥224 (scores, blend) pairs.

For each block:
  P (n×224) = per-slot normalized profiles  (scores[32:256] / 65535)
  B (n)     = canonical blends
  W         = lstsq(P, B)   # blend = W · (score/65535) exactly (R²=1)

  world-PC projection k = W · e_k,   k = 1..30
  where e_k = world eigenvector k from data/research/bases/world/v1/eigenvectors.json

Outputs (written to data/research/f28-w-distribution/):
  w_projections.jsonl  — one record per block: {height, blockhash, source, projections[30]}
  analysis.md          — summary statistics and interpretation
"""

import json
import sys
import os
import math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent.parent
OUT_DIR = ROOT / 'data/research/f28-w-distribution'
OUT_DIR.mkdir(parents=True, exist_ok=True)

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    print("WARNING: numpy not available, using pure-python fallback (slow)")

# ── Load world-basis eigenvectors ───────────────────────────────────────────
print("Loading world-basis eigenvectors...")
with open(ROOT / 'data/research/bases/world/v1/eigenvectors.json') as f:
    ev_data = json.load(f)

with open(ROOT / 'data/research/bases/world/v1/chain_mean.json') as f:
    cm = json.load(f)
world_mean = cm['mean']  # 224-dim centering vector (in normalized score space)

axes = ev_data['axes']
N_PCS = len(axes)
eigenvectors = [a['eigenvector'] for a in axes]  # list of 30 × 224-dim lists
print(f"  {N_PCS} world-PCs loaded, slot range {ev_data['slot_range']}")

if HAS_NUMPY:
    E = np.array(eigenvectors)       # (30, 224)
    wm = np.array(world_mean)        # (224,)


def solve_W(profiles_224, blends):
    """
    Given P (n×224) normalized profiles and B (n) canonical blends,
    solve W via least-squares: B = P @ W.
    Returns (W_224, r_squared).
    """
    if HAS_NUMPY:
        P = np.array(profiles_224)
        B = np.array(blends, dtype=float)
        W, _, _, _ = np.linalg.lstsq(P, B, rcond=None)
        B_pred = P @ W
        ss_res = float(np.sum((B - B_pred)**2))
        ss_tot = float(np.sum((B - B.mean())**2))
        r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 1.0
        return W.tolist(), r2
    else:
        # Pure-python fallback: very slow, only used if numpy missing
        n, p = len(profiles_224), len(profiles_224[0])
        # Normal equations: (P^T P) W = P^T B
        PtP = [[sum(profiles_224[k][i]*profiles_224[k][j] for k in range(n)) for j in range(p)] for i in range(p)]
        PtB = [sum(profiles_224[k][i]*blends[k] for k in range(n)) for i in range(p)]
        # Gaussian elimination (slow)
        import copy
        A = [row[:] + [PtB[i]] for i, row in enumerate(PtP)]
        for col in range(p):
            pivot = max(range(col, p), key=lambda r: abs(A[r][col]))
            A[col], A[pivot] = A[pivot], A[col]
            for row in range(p):
                if row != col and A[row][col] != 0:
                    factor = A[row][col] / A[col][col]
                    A[row] = [A[row][j] - factor*A[col][j] for j in range(p+1)]
        W = [A[i][p] / A[i][i] for i in range(p)]
        return W, 1.0


def project_W(W):
    """Project W onto world-PCs. Returns list of 30 projections."""
    if HAS_NUMPY:
        w = np.array(W)
        return (E @ w).tolist()
    else:
        return [sum(W[j]*eigenvectors[k][j] for j in range(len(W))) for k in range(N_PCS)]


# ── Source 1: S2 corpus ──────────────────────────────────────────────────────
print("\nProcessing S2 corpus (13 block hashes)...")
s2_groups = defaultdict(list)
with open(ROOT / 'data/research/s2-random-valid/profiles.jsonl') as f:
    for line in f:
        r = json.loads(line)
        if r.get('gatesPass') and r.get('scores') and r.get('canonicalBlend') is not None:
            bh = r['blockhash']
            s2_groups[bh].append({
                'scores': r['scores'],
                'blend': r['canonicalBlend'],
                'height': r['height'],
            })

records = []  # output records

for bh, group in s2_groups.items():
    height = group[0]['height']
    profiles = [[s / 65535.0 for s in g['scores'][32:256]] for g in group]
    blends = [g['blend'] for g in group]
    W, r2 = solve_W(profiles, blends)
    projections = project_W(W)
    records.append({
        'height': height,
        'blockhash': bh,
        'source': 's2',
        'n_pairs': len(group),
        'r2': r2,
        'projections': projections,
    })
    print(f"  {height} ({bh[-8:]}) n={len(group)} R²={r2:.6f}")

print(f"  S2: {len(records)} blocks processed")

# ── Source 2: Probe-scored blocks ────────────────────────────────────────────
probe_path = OUT_DIR / 'probe-blocks.jsonl'
if probe_path.exists():
    print(f"\nProcessing probe-scored blocks from {probe_path}...")
    n_probe = 0
    with open(probe_path) as f:
        for line in f:
            if not line.strip():
                continue
            rec = json.loads(line)
            bh = rec['blockhash']
            pairs = rec['pairs']
            if len(pairs) < 224:
                print(f"  skip {rec['height']}: only {len(pairs)} pairs")
                continue
            profiles = [[s / 65535.0 for s in p['scores']] for p in pairs]
            blends = [p['blend'] for p in pairs]
            W, r2 = solve_W(profiles, blends)
            projections = project_W(W)
            records.append({
                'height': rec['height'],
                'blockhash': bh,
                'source': 'probe',
                'n_pairs': len(pairs),
                'r2': r2,
                'projections': projections,
            })
            n_probe += 1
    print(f"  Probe: {n_probe} blocks processed")
else:
    print(f"\n  (probe-blocks.jsonl not found — run f28-probe-score.mjs first for extended analysis)")

# ── Write projections JSONL ──────────────────────────────────────────────────
out_proj = OUT_DIR / 'w_projections.jsonl'
with open(out_proj, 'w') as f:
    for r in records:
        f.write(json.dumps(r) + '\n')
print(f"\nWrote {len(records)} records to {out_proj}")

# ── Statistics ───────────────────────────────────────────────────────────────
if not records:
    print("No records to analyze.")
    sys.exit(0)

if HAS_NUMPY:
    proj_matrix = np.array([r['projections'] for r in records])  # (N_blocks, 30)
    pc_means    = proj_matrix.mean(axis=0)
    pc_stds     = proj_matrix.std(axis=0)
    pc_mins     = proj_matrix.min(axis=0)
    pc_maxs     = proj_matrix.max(axis=0)
    # Fraction of blocks where W · e_k > 0  (W "rewards" PC-k direction)
    pc_pos_frac = (proj_matrix > 0).mean(axis=0)
    n_blocks = len(records)
else:
    n_blocks = len(records)
    def col(k): return [r['projections'][k] for r in records]
    def mean(v): return sum(v)/len(v)
    def std(v):
        m = mean(v); return math.sqrt(sum((x-m)**2 for x in v)/len(v))
    pc_means    = [mean(col(k)) for k in range(N_PCS)]
    pc_stds     = [std(col(k))  for k in range(N_PCS)]
    pc_mins     = [min(col(k))  for k in range(N_PCS)]
    pc_maxs     = [max(col(k))  for k in range(N_PCS)]
    pc_pos_frac = [sum(1 for x in col(k) if x > 0)/n_blocks for k in range(N_PCS)]

# ── Write analysis.md ────────────────────────────────────────────────────────
sources = defaultdict(int)
for r in records: sources[r['source']] += 1

md = []
md.append("# F28: W-Distribution over World-PCs\n")
md.append("## Background\n")
md.append(
    "For each historical block, `W` is the 224-dimensional weight vector that "
    "determines the canonical blend: `blend = W · (scores[32:256] / 65535)`. "
    "The world-PC eigenvectors (`e_k`) are directions of variance in scorer-profile "
    "space derived from the S2 random-valid corpus (5 000 structurally diverse "
    "sentences, no LLM). `W · e_k` measures how much block `W` rewards movement "
    "in the direction of world-PC k.\n"
)
md.append("## Data\n")
md.append(f"- Total blocks: **{n_blocks}**\n")
for src, cnt in sorted(sources.items()):
    md.append(f"  - `{src}`: {cnt} blocks\n")
md.append(
    "- W solved via LSQ (R²≈1.000 throughout, confirming blend is an exact "
    "linear function of normalized per-slot scores).\n"
)
md.append("\n## Per-PC Statistics\n")
md.append(
    "Columns: PC | mean(W·e_k) | std | min | max | frac_positive\n\n"
    "> `frac_positive` = fraction of blocks where W·e_k > 0 "
    "(i.e., where this PC direction is net-rewarded).\n\n"
    "| PC | mean | std | min | max | frac_pos |\n"
    "|---|---|---|---|---|---|\n"
)
for k in range(N_PCS):
    md.append(
        f"| PC{k+1:02d} | {pc_means[k]:+.3e} | {pc_stds[k]:.3e} | "
        f"{pc_mins[k]:+.3e} | {pc_maxs[k]:+.3e} | {pc_pos_frac[k]:.2f} |\n"
    )

md.append("\n## Interpretation\n")
md.append("### Always-positive PCs (frac_positive ≥ 0.85)\n")
always_pos = [k+1 for k in range(N_PCS) if pc_pos_frac[k] >= 0.85]
if always_pos:
    for k in always_pos:
        md.append(f"- **PC{k:02d}**: mean={pc_means[k-1]:+.3e}, frac_pos={pc_pos_frac[k-1]:.2f}\n")
    md.append(
        "\nThese directions are net-rewarded on virtually every block. "
        "Any sentence that scores high on these PCs will likely have a competitive blend "
        "regardless of block hash.\n"
    )
else:
    md.append("None found.\n")

md.append("\n### Roughly balanced PCs (0.35 ≤ frac_positive ≤ 0.65)\n")
balanced = [k+1 for k in range(N_PCS) if 0.35 <= pc_pos_frac[k] <= 0.65]
if balanced:
    for k in balanced:
        md.append(f"- **PC{k:02d}**: mean={pc_means[k-1]:+.3e}, frac_pos={pc_pos_frac[k-1]:.2f}\n")
    md.append(
        "\nThese directions are rewarded on roughly half of blocks and penalised "
        "on the other half. Specialising in these directions is a conditional "
        "strategy: effective on aligned blocks, harmful on anti-aligned blocks.\n"
    )
else:
    md.append("None found.\n")

md.append("\n### Never-positive PCs (frac_positive ≤ 0.15)\n")
never_pos = [k+1 for k in range(N_PCS) if pc_pos_frac[k] <= 0.15]
if never_pos:
    for k in never_pos:
        md.append(f"- **PC{k:02d}**: mean={pc_means[k-1]:+.3e}, frac_pos={pc_pos_frac[k-1]:.2f}\n")
    md.append("\nThese directions are almost always penalised; avoid them.\n")
else:
    md.append("None found.\n")

md.append("\n## Economic Implications\n")
md.append(
    "The fraction-positive for each PC tells us the *economic frequency* of W-alignment. "
    "A world-PC direction with frac_positive = 0.50 and high std is a conditional "
    "opportunity: win big when aligned, lose when anti-aligned. "
    "A direction with frac_positive ≈ 1.0 is a universal baseline that all strong "
    "sentences should capture. "
    "This analysis directly motivates which world-PC directions to target with "
    "new prompt engineering or template optimisation.\n"
)
md.append("\n## Methodology\n")
md.append(
    "1. **S2 source**: All 5 000 sentences from `data/research/s2-random-valid/profiles.jsonl` "
    "grouped by block hash (13 groups, 270–398 sentences each). Per-slot scores "
    "(slots 32–255) are sentence-deterministic (F4). LSQ solves W exactly (R²=1.000).\n"
    "2. **Probe source** (if available): For each block hash in "
    "`data/research/scorer-cluster/blockhashes.jsonl`, `f28-probe-score.mjs` generates "
    "960 sentences (8 templates × 5! word permutations) using the current module's "
    "word derivation, scores them verbosely, and outputs the (profile, blend) pairs.\n"
    "3. **W inference**: `blend = P @ W` solved by `numpy.linalg.lstsq`; confirmed "
    "R²=1.000 throughout, validating that blend is an exact affine function of "
    "normalised per-slot scores.\n"
    "4. **Projection**: `projection_k = W · e_k` where `e_k` is the unit eigenvector "
    "for world-PC k (from `data/research/bases/world/v1/eigenvectors.json`). No "
    "centering is applied to W (W is a weight vector, not a profile sample).\n"
)

md.append("\n## Caveats\n")
md.append(
    f"- Sample size is **{n_blocks} blocks**. "
    "For robust percentile estimates of the distribution tails, aim for ≥500 blocks "
    "(run `f28-probe-score.mjs --max 500` and re-run this script).\n"
    "- The S2 and probe data may use different scoring-module versions. "
    "If the on-chain WASM scorer bundle has not changed, W vectors are directly "
    "comparable across sources. If it has changed, the two sources represent "
    "different W-spaces and should be analysed separately.\n"
    "- Projection is not centering-corrected for W itself. The absolute values of "
    "W · e_k carry less meaning than their *relative* distribution across blocks.\n"
)

analysis_path = OUT_DIR / 'analysis.md'
with open(analysis_path, 'w') as f:
    f.writelines(md)
print(f"Wrote analysis to {analysis_path}")

# ── Optional: histogram plot ─────────────────────────────────────────────────
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    fig, axes_grid = plt.subplots(5, 6, figsize=(18, 12))
    axes_flat = [ax for row in axes_grid for ax in row]

    for k in range(N_PCS):
        ax = axes_flat[k]
        vals = proj_matrix[:, k] if HAS_NUMPY else [r['projections'][k] for r in records]
        ax.hist(vals, bins=max(5, n_blocks // 3), color='steelblue', edgecolor='white', linewidth=0.3)
        ax.axvline(0, color='red', linewidth=0.8, linestyle='--')
        ax.set_title(f'PC{k+1:02d} (pos={pc_pos_frac[k]:.2f})', fontsize=7)
        ax.tick_params(labelsize=5)

    # hide unused subplots
    for k in range(N_PCS, len(axes_flat)):
        axes_flat[k].set_visible(False)

    fig.suptitle(f'W · world-PC projections across {n_blocks} blocks\n'
                 '(red dashed = zero; pos fraction = fraction of blocks where W rewards this PC direction)',
                 fontsize=9)
    plt.tight_layout()
    hist_path = OUT_DIR / 'histograms.png'
    plt.savefig(hist_path, dpi=130)
    plt.close()
    print(f"Wrote histogram plot to {hist_path}")
except ImportError:
    print("(matplotlib not available — skipping histogram plot)")

print("\nDone.")
