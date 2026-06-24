#!/usr/bin/env node
/**
 * F46 — H1 ↔ H2 subspace alignment.
 *
 * Question (operator): if the W-selected winner manifold (H1) and the
 * random-but-valid structural sweep (H2) align on their highest-variance
 * directions, that reduces the probability that H2 hides high-paying ridges
 * the chain has never exploited. Make that rigorous.
 *
 * Method:
 *   H1 = chain rank-1 winner principal axes  (F26 eigenvectors, top-K of a
 *        224-dim judge covariance over slots [32,256), n=3566 winners).
 *   H2 = principal axes of 5,000 random-but-valid sentences
 *        (data/research/s2-random-valid/profiles.jsonl), same slot range,
 *        computed here by power iteration + Gram–Schmidt deflation.
 *
 * Outputs:
 *   1. Principal angles between the top-K H1 and top-K H2 subspaces
 *      (cos θ_i = singular values of H1ᵀH2). Subspace-overlap energy
 *      = mean(cos²θ_i) ∈ [0,1].
 *   2. Variance of the random (H2) cloud captured by the chain (H1) axes,
 *      cumulatively, vs. H2's own eigen-spectrum — i.e. does the chain's
 *      geometry also describe where random valid sentences spread?
 *   3. Blend-score ceiling gap: how much higher do real winners reach than
 *      the best of 5,000 random valid sentences (the "ridge height" gap).
 */
import { readFileSync, writeFileSync } from 'fs';

const ROOT = process.cwd();
const F26 = `${ROOT}/data/research/scorer-cluster/f26-judge-covariance/eigenvectors.json`;
const RAND = `${ROOT}/data/research/s2-random-valid/profiles.jsonl`;
const SUMMARY = `${ROOT}/data/research/s2-random-valid/s2-analysis-summary.json`;
const OUT = `${ROOT}/data/research/s2-random-valid/f46-h1h2-subspace.json`;
const K = 30; // match F26 K

// ---- linear algebra helpers (small, dependency-free) ----
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const norm = (a) => Math.sqrt(dot(a, a));
function normalize(a) { const n = norm(a) || 1; return a.map((x) => x / n); }
function matVec(C, v) { const n = v.length, out = new Array(n).fill(0); for (let i = 0; i < n; i++) { const row = C[i]; let s = 0; for (let j = 0; j < n; j++) s += row[j] * v[j]; out[i] = s; } return out; }

// top-K eigenvectors of symmetric matrix C via power iteration + deflation
function topEigenvectors(C, k, iters = 300) {
  const n = C.length;
  const Cdef = C.map((r) => r.slice());
  const vecs = [], vals = [];
  for (let e = 0; e < k; e++) {
    let v = normalize(Array.from({ length: n }, () => Math.random() - 0.5));
    let lambda = 0;
    for (let it = 0; it < iters; it++) {
      let w = matVec(Cdef, v);
      const nw = norm(w) || 1e-12;
      lambda = nw;
      v = w.map((x) => x / nw);
    }
    // Rayleigh quotient for signed eigenvalue
    lambda = dot(v, matVec(Cdef, v));
    vecs.push(v); vals.push(lambda);
    // deflate: C -= lambda v vᵀ
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) Cdef[i][j] -= lambda * v[i] * v[j];
  }
  return { vecs, vals };
}

// eigenvalues+vectors of small symmetric matrix via cyclic Jacobi
function jacobi(Ain, sweeps = 100) {
  const n = Ain.length;
  const A = Ain.map((r) => r.slice());
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let s = 0; s < sweeps; s++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    if (off < 1e-18) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-15) continue;
      const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let i = 0; i < n; i++) {
        const aip = A[i][p], aiq = A[i][q];
        A[i][p] = c * aip - sn * aiq; A[i][q] = sn * aip + c * aiq;
      }
      for (let i = 0; i < n; i++) {
        const api = A[p][i], aqi = A[q][i];
        A[p][i] = c * api - sn * aqi; A[q][i] = sn * api + c * aqi;
      }
      for (let i = 0; i < n; i++) {
        const vip = V[i][p], viq = V[i][q];
        V[i][p] = c * vip - sn * viq; V[i][q] = sn * vip + c * viq;
      }
    }
  }
  return A.map((r, i) => r[i]); // eigenvalues (diagonal)
}

function pct(arr, p) { const s = arr.slice().sort((a, b) => a - b); const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length)); return s[idx]; }

// ---- load H1 (chain) ----
const f26 = JSON.parse(readFileSync(F26, 'utf8'));
const [lo, hi] = f26.slot_range; // [32,256]
const D = hi - lo; // 224
const H1 = f26.axes.slice(0, K).map((a) => a.eigenvector.slice()); // K x D, already unit
console.log(`H1: ${H1.length} chain axes, dim ${H1[0].length}, slot_range [${lo},${hi})`);

// ---- load H2 (random valid) profiles, slice slot range ----
const lines = readFileSync(RAND, 'utf8').trim().split('\n');
const X = [];
for (const ln of lines) {
  const o = JSON.parse(ln);
  if (!o.scores || o.scores.length < hi) continue;
  X.push(o.scores.slice(lo, hi).map(Number));
}
const N = X.length;
const mean = new Array(D).fill(0);
for (const row of X) for (let j = 0; j < D; j++) mean[j] += row[j];
for (let j = 0; j < D; j++) mean[j] /= N;
// covariance
const C = Array.from({ length: D }, () => new Array(D).fill(0));
for (const row of X) { const d = row.map((v, j) => v - mean[j]); for (let i = 0; i < D; i++) { const di = d[i]; const Ci = C[i]; for (let j = i; j < D; j++) Ci[j] += di * d[j]; } }
for (let i = 0; i < D; i++) for (let j = i; j < D; j++) { C[i][j] /= (N - 1); C[j][i] = C[i][j]; }
const totalVar = (() => { let s = 0; for (let i = 0; i < D; i++) s += C[i][i]; return s; })();
console.log(`H2: ${N} random-valid profiles, total variance ${totalVar.toExponential(3)}`);

// H2 top-K eigenvectors
const { vecs: H2, vals: H2vals } = topEigenvectors(C, K);

// ---- (1) principal angles between H1 and H2 ----
// M = H1 (KxD) · H2ᵀ (DxK) -> KxK ; cosθ = singular values of M
const M = H1.map((u) => H2.map((v) => dot(u, v)));
// singular values: sqrt(eig(MᵀM))
const MtM = Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_, j) => { let s = 0; for (let r = 0; r < K; r++) s += M[r][i] * M[r][j]; return s; }));
const sv2 = jacobi(MtM).map((x) => Math.max(0, x)).sort((a, b) => b - a);
const cos = sv2.map(Math.sqrt);
const angles = cos.map((c) => (Math.acos(Math.min(1, c)) * 180) / Math.PI);
const overlapEnergy = sv2.reduce((a, b) => a + b, 0) / K; // mean cos²θ

// ---- (2) variance of random captured by H1 axes, cumulative ----
let h1Captured = 0;
const h1CumFrac = [];
for (let i = 0; i < K; i++) { h1Captured += dot(H1[i], matVec(C, H1[i])); h1CumFrac.push(h1Captured / totalVar); }
let h2Captured = 0; const h2CumFrac = [];
for (let i = 0; i < K; i++) { h2Captured += H2vals[i]; h2CumFrac.push(h2Captured / totalVar); }

// ---- (3) blend ceiling gap ----
const summary = JSON.parse(readFileSync(SUMMARY, 'utf8'));
const blend = summary.blend;

const result = {
  generated: new Date().toISOString(),
  K, dim: D, slot_range: [lo, hi], n_chain_winners: f26.n_profiles, n_random_valid: N,
  principal_angles: {
    cos_theta: cos.map((x) => +x.toFixed(4)),
    angle_deg: angles.map((x) => +x.toFixed(2)),
    subspace_overlap_energy_mean_cos2: +overlapEnergy.toFixed(4),
    n_axes_within_30deg: angles.filter((a) => a <= 30).length,
    n_axes_within_45deg: angles.filter((a) => a <= 45).length,
  },
  variance_capture: {
    note: 'Fraction of the random (H2) cloud variance explained, cumulatively, by the chain (H1) axes vs by H2 own axes.',
    h1_axes_on_random_cumfrac: h1CumFrac.map((x) => +x.toFixed(4)),
    h2_own_cumfrac: h2CumFrac.map((x) => +x.toFixed(4)),
    h1_captures_of_random_at_K: +h1CumFrac[K - 1].toFixed(4),
    h2_captures_of_random_at_K: +h2CumFrac[K - 1].toFixed(4),
    efficiency_h1_vs_h2: +(h1CumFrac[K - 1] / h2CumFrac[K - 1]).toFixed(4),
  },
  blend_ceiling: {
    chain: { mean: blend.chain.mean, p99: blend.chain.p99, max: blend.chain.max },
    random: { mean: blend.random.mean, p99: blend.random.p99, max: blend.random.max },
    random_best_as_frac_of_chain_best: +(blend.random.max / blend.chain.max).toFixed(4),
    random_p99_as_frac_of_chain_p99: +(blend.random.p99 / blend.chain.p99).toFixed(4),
    chain_best_excess_over_random_best_pct: +(100 * (blend.chain.max / blend.random.max - 1)).toFixed(2),
  },
};

writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log('\n=== F45 H1↔H2 subspace alignment ===');
console.log('principal-angle cosines (top 10):', result.principal_angles.cos_theta.slice(0, 10).join(', '));
console.log('angles deg (top 10):', result.principal_angles.angle_deg.slice(0, 10).join(', '));
console.log('subspace overlap energy (mean cos²θ):', result.principal_angles.subspace_overlap_energy_mean_cos2);
console.log('axes within 30°:', result.principal_angles.n_axes_within_30deg, '/', K, ' within 45°:', result.principal_angles.n_axes_within_45deg);
console.log('H1 axes capture', (100 * result.variance_capture.h1_captures_of_random_at_K).toFixed(1) + '% of random variance;',
  'H2 own axes capture', (100 * result.variance_capture.h2_captures_of_random_at_K).toFixed(1) + '% (efficiency', result.variance_capture.efficiency_h1_vs_h2 + ')');
console.log('blend ceiling: random best =', result.blend_ceiling.random_best_as_frac_of_chain_best, 'of chain best; chain best excess', result.blend_ceiling.chain_best_excess_over_random_best_pct + '%');
console.log('wrote', OUT);
