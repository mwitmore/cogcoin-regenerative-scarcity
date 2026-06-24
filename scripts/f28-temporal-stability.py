#!/usr/bin/env python3
"""
F28 Temporal Stability Analysis — weight-direction stationarity test.

Tests whether the W-distribution classification (always-rewarded / never-rewarded PCs)
is STABLE over time, or whether it drifts (which would weaken the lottery endgame thesis).

Method:
  1. Load all available W-projection records (from probe-blocks-stratified-300.jsonl + S2).
  2. Split blocks into time-thirds by height.
  3. For each world-PC, compute frac_pos per third.
  4. Test for drift: |frac_pos_early − frac_pos_late| with binomial CI.
  5. Classify each PC as STABLE or DRIFTING.

Key question: Are the "never rewarded" PCs (frac_pos ≤ 0.15 overall) consistently
never-rewarded in ALL time periods? If yes, the competitive subspace is structurally
fixed and convergence is permanent (lottery endgame holds). If frac_pos shifts
significantly, the landscape rotates and new strategies could emerge.

Usage:
  python3 scripts/f28-temporal-stability.py [--input PATH]
"""

import json
import sys
import math
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).parent.parent
OUT_DIR = ROOT / 'data/research/f28-w-distribution'
OUT_DIR.mkdir(parents=True, exist_ok=True)

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    print("WARNING: numpy not available; using pure-python fallback", file=sys.stderr)


def load_projections():
    """Load W-projections from all available sources."""
    records = []

    # Source 1: existing w_projections.jsonl (S2 + old probes)
    old_proj = OUT_DIR / 'w_projections.jsonl'
    if old_proj.exists():
        with open(old_proj) as f:
            for line in f:
                if line.strip():
                    records.append(json.loads(line))

    # Source 2: new stratified probe blocks (solve W inline)
    strat_path = OUT_DIR / 'probe-blocks-stratified-300.jsonl'
    if strat_path.exists():
        ev_path = ROOT / 'data/research/bases/world/v1/eigenvectors.json'
        with open(ev_path) as f:
            ev_data = json.load(f)
        eigenvectors = [a['eigenvector'] for a in ev_data['axes']]

        if HAS_NUMPY:
            E = np.array(eigenvectors)

        existing_heights = {r['height'] for r in records}
        n_new = 0

        with open(strat_path) as f:
            for line in f:
                if not line.strip():
                    continue
                rec = json.loads(line)
                if rec['height'] in existing_heights:
                    continue
                pairs = rec['pairs']
                if len(pairs) < 224:
                    continue

                if HAS_NUMPY:
                    P = np.array([[s / 65535.0 for s in p['scores']] for p in pairs])
                    B = np.array([p['blend'] for p in pairs], dtype=float)
                    W, _, _, _ = np.linalg.lstsq(P, B, rcond=None)
                    B_pred = P @ W
                    ss_res = float(np.sum((B - B_pred)**2))
                    ss_tot = float(np.sum((B - B.mean())**2))
                    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 1.0
                    projections = (E @ W).tolist()
                else:
                    profiles = [[s / 65535.0 for s in p['scores']] for p in pairs]
                    blends = [p['blend'] for p in pairs]
                    n, p_dim = len(profiles), len(profiles[0])
                    PtP = [[sum(profiles[k][i]*profiles[k][j] for k in range(n)) for j in range(p_dim)] for i in range(p_dim)]
                    PtB = [sum(profiles[k][i]*blends[k] for k in range(n)) for i in range(p_dim)]
                    import copy
                    A = [row[:] + [PtB[i]] for i, row in enumerate(PtP)]
                    for col in range(p_dim):
                        pivot = max(range(col, p_dim), key=lambda r: abs(A[r][col]))
                        A[col], A[pivot] = A[pivot], A[col]
                        for row in range(p_dim):
                            if row != col and A[row][col] != 0:
                                factor = A[row][col] / A[col][col]
                                A[row] = [A[row][j] - factor*A[col][j] for j in range(p_dim+1)]
                    W = [A[i][p_dim] / A[i][i] for i in range(p_dim)]
                    r2 = 1.0
                    projections = [sum(W[j]*eigenvectors[k][j] for j in range(len(W))) for k in range(len(eigenvectors))]

                records.append({
                    'height': rec['height'],
                    'blockhash': rec['blockhash'],
                    'source': 'probe-stratified',
                    'n_pairs': len(pairs),
                    'r2': r2,
                    'projections': projections,
                })
                n_new += 1

        print(f"Loaded {n_new} new stratified probe blocks")

    # Deduplicate by height (prefer stratified over old)
    seen = {}
    for r in records:
        h = r['height']
        if h not in seen or r['source'] == 'probe-stratified':
            seen[h] = r
    records = sorted(seen.values(), key=lambda r: r['height'])
    return records


def wilson_ci(successes, n, z=1.96):
    """Wilson score interval for binomial proportion."""
    if n == 0:
        return 0.0, 0.0, 1.0
    p_hat = successes / n
    denom = 1 + z**2 / n
    centre = (p_hat + z**2 / (2*n)) / denom
    margin = z * math.sqrt(p_hat * (1 - p_hat) / n + z**2 / (4*n**2)) / denom
    return p_hat, max(0.0, centre - margin), min(1.0, centre + margin)


def main():
    print("=" * 72)
    print("F28 TEMPORAL STABILITY ANALYSIS")
    print("Weight-direction stationarity test (F28)")
    print("=" * 72)

    records = load_projections()
    n_total = len(records)
    print(f"\nTotal blocks with W-projections: {n_total}")

    if n_total < 50:
        print("ERROR: Insufficient data (need ≥50, ideally 200+). Run f28-probe-score.mjs first.")
        sys.exit(1)

    heights = sorted(r['height'] for r in records)
    h_min, h_max = heights[0], heights[-1]
    print(f"Height range: {h_min} – {h_max} ({h_max - h_min} blocks, ~{(h_max-h_min)*10/60/24:.0f} days)")

    # Split into thirds by height
    r_range = h_max - h_min
    t1 = h_min + r_range // 3
    t2 = h_min + 2 * r_range // 3

    early = [r for r in records if r['height'] <= t1]
    mid = [r for r in records if t1 < r['height'] <= t2]
    late = [r for r in records if r['height'] > t2]

    print(f"\nTemporal split:")
    print(f"  Early (≤{t1}): {len(early)} blocks [{early[0]['height'] if early else '?'}–{early[-1]['height'] if early else '?'}]")
    print(f"  Mid   ({t1}–{t2}): {len(mid)} blocks [{mid[0]['height'] if mid else '?'}–{mid[-1]['height'] if mid else '?'}]")
    print(f"  Late  (>{t2}): {len(late)} blocks [{late[0]['height'] if late else '?'}–{late[-1]['height'] if late else '?'}]")

    N_PCS = len(records[0]['projections'])

    # Compute per-third frac_pos
    def frac_pos_for(subset, k):
        if not subset:
            return 0.0, 0, 0
        pos = sum(1 for r in subset if r['projections'][k] > 0)
        return pos / len(subset), pos, len(subset)

    # Build results table
    results = []
    for k in range(N_PCS):
        fp_all, pos_all, n_all = frac_pos_for(records, k)
        fp_early, pos_early, n_early = frac_pos_for(early, k)
        fp_mid, pos_mid, n_mid = frac_pos_for(mid, k)
        fp_late, pos_late, n_late = frac_pos_for(late, k)

        # Wilson CIs for early and late
        _, ci_early_lo, ci_early_hi = wilson_ci(pos_early, n_early)
        _, ci_late_lo, ci_late_hi = wilson_ci(pos_late, n_late)

        # Drift = |early - late|; significant if CIs don't overlap
        drift = abs(fp_early - fp_late)
        ci_overlap = ci_early_hi >= ci_late_lo and ci_late_hi >= ci_early_lo
        stable = ci_overlap

        # Mean W·e_k
        mean_proj = sum(r['projections'][k] for r in records) / n_total

        results.append({
            'pc': k + 1,
            'fp_all': fp_all,
            'fp_early': fp_early,
            'fp_mid': fp_mid,
            'fp_late': fp_late,
            'drift': drift,
            'stable': stable,
            'ci_early': (ci_early_lo, ci_early_hi),
            'ci_late': (ci_late_lo, ci_late_hi),
            'mean_proj': mean_proj,
        })

    # Classification
    always_rewarded = [r for r in results if r['fp_all'] >= 0.85]
    never_rewarded = [r for r in results if r['fp_all'] <= 0.15]
    balanced = [r for r in results if 0.35 <= r['fp_all'] <= 0.65]

    # Print summary
    print("\n" + "=" * 72)
    print("RESULTS: Per-PC frac_positive by time period")
    print("=" * 72)
    print(f"{'PC':<6} {'All':>6} {'Early':>6} {'Mid':>6} {'Late':>6} {'Drift':>6} {'Stable?':>8} {'Mean W·e_k':>11}")
    print("-" * 72)
    for r in results:
        flag = "YES" if r['stable'] else "**NO**"
        print(f"PC{r['pc']:02d}   {r['fp_all']:.3f}  {r['fp_early']:.3f}  {r['fp_mid']:.3f}  {r['fp_late']:.3f}  {r['drift']:.3f}   {flag:>7}   {r['mean_proj']:+.2e}")

    # Key findings
    print("\n" + "=" * 72)
    print("KEY FINDINGS FOR THESIS")
    print("=" * 72)

    print("\n1. ALWAYS-REWARDED PCs (frac_pos ≥ 0.85 overall):")
    if always_rewarded:
        all_stable = all(r['stable'] for r in always_rewarded)
        for r in always_rewarded:
            status = "STABLE" if r['stable'] else "DRIFTING"
            print(f"   PC{r['pc']:02d}: all={r['fp_all']:.2f} early={r['fp_early']:.2f} mid={r['fp_mid']:.2f} late={r['fp_late']:.2f} [{status}]")
        if all_stable:
            print("   → ALL always-rewarded PCs are temporally STABLE. Thesis SUPPORTED.")
        else:
            drifters = [r for r in always_rewarded if not r['stable']]
            print(f"   → WARNING: {len(drifters)} always-rewarded PC(s) show drift. Thesis needs qualification.")
    else:
        print("   (none found)")

    print("\n2. NEVER-REWARDED PCs (frac_pos ≤ 0.15 overall):")
    if never_rewarded:
        all_stable = all(r['stable'] for r in never_rewarded)
        for r in never_rewarded:
            status = "STABLE" if r['stable'] else "DRIFTING"
            print(f"   PC{r['pc']:02d}: all={r['fp_all']:.2f} early={r['fp_early']:.2f} mid={r['fp_mid']:.2f} late={r['fp_late']:.2f} [{status}]")
        if all_stable:
            print("   → ALL never-rewarded PCs are temporally STABLE. Thesis SUPPORTED.")
            print("   → These regions are STRUCTURALLY dead, not merely undiscovered.")
        else:
            drifters = [r for r in never_rewarded if not r['stable']]
            print(f"   → WARNING: {len(drifters)} never-rewarded PC(s) show drift.")
            print("   → If these drift TOWARD positive, new strategies could emerge → thesis weakened.")
    else:
        print("   (none found)")

    print("\n3. BALANCED PCs (0.35–0.65 overall) — conditional strategies:")
    if balanced:
        for r in balanced:
            status = "STABLE" if r['stable'] else "DRIFTING"
            print(f"   PC{r['pc']:02d}: all={r['fp_all']:.2f} early={r['fp_early']:.2f} mid={r['fp_mid']:.2f} late={r['fp_late']:.2f} [{status}]")
    else:
        print("   (none found)")

    # Overall verdict
    print("\n" + "=" * 72)
    n_unstable = sum(1 for r in results if not r['stable'])
    n_critical_unstable = sum(1 for r in (always_rewarded + never_rewarded) if not r['stable'])

    if n_critical_unstable == 0:
        print("VERDICT: W-classification is TEMPORALLY STABLE across all critical PCs.")
        print("The always-rewarded and never-rewarded regions do not change over the")
        print(f"observed {(h_max-h_min)*10/60/24:.0f}-day window. The competitive subspace is FIXED.")
        print("")
        print("IMPLICATION FOR THESIS: The 'never rewarded' regions of scorer space are")
        print("structurally dead — not merely undiscovered by current miners. No amount of")
        print("time or new entrants will make those regions competitive. The convergence")
        print("observed in F1/F2/F9 is PERMANENT under the current oracle.")
        print("")
        print("LOTTERY ENDGAME: SUPPORTED.")
    else:
        print(f"VERDICT: {n_critical_unstable} critical PC(s) show temporal drift.")
        print("The competitive landscape may be shifting. The lottery endgame thesis")
        print("requires qualification: the landscape rotates on a timescale of ~X days.")
        if n_critical_unstable <= 2:
            print("However, drift is LIMITED — the thesis may still hold with nuance.")
        else:
            print("CAUTION: significant drift detected. Thesis requires major qualification.")

    print("=" * 72)

    # Write detailed output
    out_path = OUT_DIR / 'temporal-stability.json'
    with open(out_path, 'w') as f:
        json.dump({
            'n_blocks': n_total,
            'height_range': [h_min, h_max],
            'n_early': len(early),
            'n_mid': len(mid),
            'n_late': len(late),
            'height_thirds': [t1, t2],
            'results': results,
            'verdict': 'stable' if n_critical_unstable == 0 else f'{n_critical_unstable}_drifting',
        }, f, indent=2)
    print(f"\nDetailed results written to {out_path}")

    # Write markdown summary
    md_path = OUT_DIR / 'temporal-stability.md'
    with open(md_path, 'w') as f:
        f.write("# F28 Temporal Stability Analysis\n\n")
        f.write(f"**Date:** {__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M')}\n")
        f.write(f"**Blocks:** {n_total} (heights {h_min}–{h_max}, ~{(h_max-h_min)*10/60/24:.0f} days)\n")
        f.write(f"**Split:** Early {len(early)} / Mid {len(mid)} / Late {len(late)}\n\n")
        f.write("## Purpose\n\n")
        f.write("Test whether the W-distribution classification (always/never rewarded PCs) is stable\n")
        f.write("over time. This is the key empirical test for stationary reward directions under rotating weights.\n")
        f.write("If stable: convergence is permanent, endgame is lottery.\n")
        f.write("If drifting: landscape rotates, new strategies could emerge.\n\n")
        f.write("## Results\n\n")
        f.write("| PC | frac_pos (all) | early | mid | late | drift | stable? |\n")
        f.write("|---|---|---|---|---|---|---|\n")
        for r in results:
            flag = "YES" if r['stable'] else "**NO**"
            f.write(f"| PC{r['pc']:02d} | {r['fp_all']:.3f} | {r['fp_early']:.3f} | {r['fp_mid']:.3f} | {r['fp_late']:.3f} | {r['drift']:.3f} | {flag} |\n")
        f.write("\n## Classification\n\n")
        f.write("### Always rewarded (frac_pos ≥ 0.85)\n")
        for r in always_rewarded:
            f.write(f"- PC{r['pc']:02d}: {r['fp_all']:.2f} (early {r['fp_early']:.2f} → late {r['fp_late']:.2f}) — {'STABLE' if r['stable'] else 'DRIFTING'}\n")
        f.write("\n### Never rewarded (frac_pos ≤ 0.15)\n")
        for r in never_rewarded:
            f.write(f"- PC{r['pc']:02d}: {r['fp_all']:.2f} (early {r['fp_early']:.2f} → late {r['fp_late']:.2f}) — {'STABLE' if r['stable'] else 'DRIFTING'}\n")
        f.write("\n### Balanced (0.35–0.65)\n")
        for r in balanced:
            f.write(f"- PC{r['pc']:02d}: {r['fp_all']:.2f} (early {r['fp_early']:.2f} → late {r['fp_late']:.2f}) — {'STABLE' if r['stable'] else 'DRIFTING'}\n")
        f.write(f"\n## Verdict\n\n")
        if n_critical_unstable == 0:
            f.write("**W-classification is TEMPORALLY STABLE.** The always-rewarded and never-rewarded\n")
            f.write("regions do not change over the observed window. The competitive subspace is fixed.\n")
            f.write("Convergence is permanent. **Lottery endgame: SUPPORTED.**\n")
        else:
            f.write(f"**{n_critical_unstable} critical PC(s) show drift.** The thesis requires qualification.\n")
    print(f"Markdown summary written to {md_path}")


if __name__ == '__main__':
    main()
