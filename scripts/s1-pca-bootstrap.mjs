#!/usr/bin/env node
// S1 — Sub-sampling stability of F26 (PCA bootstrap)
//
// Purpose. F26 produced the load-bearing claim that the chain-winner cloud's
// top-4 principal components correspond to the four named corners (Well-Sig,
// Factor A, Riddle, dom-56 bulletin). That claim rests on one PCA run on one
// chain-winner corpus. This script tests robustness by running the same PCA on
// 100 random 50% sub-samples and comparing each sub-sample's top-K eigenvectors
// to the F26 reference via cosine similarity (sign-invariant).
//
// If the F26 basis is robust: mean |cos(PC_k_subsample, PC_k_F26)| ≥ 0.95 for
// k = 1..4 across all 100 sub-samples. Cumulative variance of top-4 stable to
// ±2%. → H1 strongly supported.
//
// If the F26 basis is fragile: mean |cos| < 0.7 on average; PC identity shifts
// across folds (PC5 of one fold matches PC3 of F26, etc). → H1 foundation
// weakens; H3/H2 picks up evidence.
//
// See docs/findings.md § "2026-05-13 — six new structural tests for H1/H2/H3"
// for the full rationale.

import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";

const PROFILES = "data/research/scorer-cluster/test-1-corpus/profiles.jsonl";
const F26_REFERENCE = "data/research/scorer-cluster/f26-judge-covariance/eigenvectors.json";
const OUTPUT_DIR = "data/research/s1-pca-bootstrap";
const SLOT_COUNT = 224;

// Bootstrap parameters.
const N_BOOTSTRAP = 100; // number of sub-samples
const SUBSAMPLE_FRACTION = 0.5;
const K_PCS = 10; // extract top-K from each sub-sample (we mainly care about top-4)
const POWER_ITER = 200;
const RNG_SEED = 42;

// ---------- Reproducible RNG (mulberry32) ----------
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Linear algebra (mirrors f26-judge-covariance.mjs) ----------
function meanVec(vectors) {
  const m = new Array(SLOT_COUNT).fill(0);
  for (const v of vectors) for (let i = 0; i < SLOT_COUNT; i++) m[i] += v[i];
  for (let i = 0; i < SLOT_COUNT; i++) m[i] /= Math.max(1, vectors.length);
  return m;
}

function vecDot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function vecNorm(a) { return Math.sqrt(vecDot(a, a)); }
function vecScale(a, s) { return a.map((x) => x * s); }

function covarianceMatrix(vectors, mean) {
  // 224×224 covariance using row-centered samples (centers on the fly to save memory).
  const n = vectors.length;
  const cov = Array.from({ length: SLOT_COUNT }, () => new Array(SLOT_COUNT).fill(0));
  const centered = new Array(SLOT_COUNT);
  for (const v of vectors) {
    for (let i = 0; i < SLOT_COUNT; i++) centered[i] = v[i] - mean[i];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const ci = centered[i];
      const row = cov[i];
      for (let j = i; j < SLOT_COUNT; j++) row[j] += ci * centered[j];
    }
  }
  for (let i = 0; i < SLOT_COUNT; i++) for (let j = i; j < SLOT_COUNT; j++) {
    cov[i][j] /= Math.max(1, n - 1);
    cov[j][i] = cov[i][j];
  }
  return cov;
}

function topEigenvectors(matrix, k, iterations, rng) {
  const n = matrix.length;
  // Deflate in-place to save memory.
  const m = matrix.map((row) => row.slice());
  const eigenvectors = [];
  const eigenvalues = [];
  for (let r = 0; r < k; r++) {
    let v = new Array(n).fill(0).map(() => rng() - 0.5);
    let nv = vecNorm(v);
    v = vecScale(v, 1 / nv);
    for (let it = 0; it < iterations; it++) {
      const Av = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        let s = 0;
        const mi = m[i];
        for (let j = 0; j < n; j++) s += mi[j] * v[j];
        Av[i] = s;
      }
      const newNorm = vecNorm(Av);
      if (newNorm === 0) break;
      v = vecScale(Av, 1 / newNorm);
    }
    const Mv = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const mi = m[i];
      for (let j = 0; j < n; j++) s += mi[j] * v[j];
      Mv[i] = s;
    }
    const lambda = vecDot(v, Mv);
    eigenvectors.push(v);
    eigenvalues.push(lambda);
    // Deflate: M := M - lambda * v v^T
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) m[i][j] -= lambda * v[i] * v[j];
  }
  return { eigenvectors, eigenvalues };
}

// ---------- Sub-sampling ----------
function bootstrapIndices(populationSize, fraction, rng) {
  // Reservoir-style sample without replacement.
  const k = Math.floor(populationSize * fraction);
  const indices = new Array(populationSize).fill(0).map((_, i) => i);
  // Fisher-Yates partial shuffle of first k.
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (populationSize - i));
    const tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
  }
  return indices.slice(0, k);
}

// ---------- Sign-invariant cosine + best-match assignment ----------
function absCos(u, v) {
  const num = Math.abs(vecDot(u, v));
  const den = vecNorm(u) * vecNorm(v);
  return den === 0 ? 0 : num / den;
}

function bestMatchAssignment(referenceVecs, bootstrapVecs, k = 4) {
  // Greedy best-match: for each reference PC k=1..K, find the bootstrap PC that maximizes |cos|.
  // Allow each bootstrap PC to be matched at most once (Hungarian-style but greedy is fine for K<=10).
  const usedBoot = new Set();
  const assignment = [];
  for (let r = 0; r < k; r++) {
    let bestB = -1;
    let bestCos = -1;
    for (let b = 0; b < bootstrapVecs.length; b++) {
      if (usedBoot.has(b)) continue;
      const c = absCos(referenceVecs[r], bootstrapVecs[b]);
      if (c > bestCos) { bestCos = c; bestB = b; }
    }
    usedBoot.add(bestB);
    assignment.push({ refPc: r + 1, bootPc: bestB + 1, absCos: bestCos });
  }
  return assignment;
}

// ---------- Data loading ----------
async function loadProfiles() {
  const rl = readline.createInterface({ input: fs.createReadStream(PROFILES), crlfDelay: Infinity });
  const out = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!r.gatesPass) continue;
    if (r.tag?.rank !== 1) continue;
    if (!Array.isArray(r.scores) || r.scores.length !== 256) continue;
    out.push(r.scores.slice(32, 256).map((v) => v / 65535));
  }
  return out;
}

function loadF26Reference() {
  const raw = JSON.parse(fs.readFileSync(F26_REFERENCE, "utf-8"));
  return {
    totalVariance: raw.total_variance,
    K90: raw.K90,
    axes: raw.axes.map((a) => ({
      pc: a.pc,
      eigenvalue: a.eigenvalue,
      varShare: a.var_share,
      cumVarShare: a.cum_var_share,
      eigenvector: a.eigenvector,
      classification: a.classification,
    })),
  };
}

// ---------- Stats helpers ----------
function meanOf(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function stdOf(xs) {
  const m = meanOf(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
}
function quantile(xs, q) {
  const sorted = [...xs].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos), frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

// ---------- Main ----------
async function main() {
  console.log(`S1 — PCA bootstrap stability test`);
  console.log(`Seed: ${RNG_SEED}, N bootstrap: ${N_BOOTSTRAP}, fraction: ${SUBSAMPLE_FRACTION}, K_PCS: ${K_PCS}, power iter: ${POWER_ITER}`);
  console.log();

  console.log("Loading profiles…");
  const vecs = await loadProfiles();
  console.log(`Loaded ${vecs.length} rank-1 gates-passing profiles, ${SLOT_COUNT} slots each.`);

  console.log("Loading F26 reference eigenvectors…");
  const ref = loadF26Reference();
  console.log(`F26 K90 = ${ref.K90} (PCs to reach 90% cum variance).`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const rng = makeRng(RNG_SEED);
  const results = [];

  const t0 = Date.now();
  for (let b = 0; b < N_BOOTSTRAP; b++) {
    const idx = bootstrapIndices(vecs.length, SUBSAMPLE_FRACTION, rng);
    const sample = idx.map((i) => vecs[i]);
    const mean = meanVec(sample);
    const cov = covarianceMatrix(sample, mean);
    let totalVar = 0;
    for (let i = 0; i < SLOT_COUNT; i++) totalVar += cov[i][i];
    const { eigenvectors, eigenvalues } = topEigenvectors(cov, K_PCS, POWER_ITER, rng);

    const refTop4 = ref.axes.slice(0, 4).map((a) => a.eigenvector);
    const assignment = bestMatchAssignment(refTop4, eigenvectors, 4);

    const cumVarTop4 = (eigenvalues[0] + eigenvalues[1] + eigenvalues[2] + eigenvalues[3]) / totalVar;

    results.push({
      bootstrap: b + 1,
      n_samples: sample.length,
      total_variance: totalVar,
      cum_var_top4: cumVarTop4,
      eigenvalues_top4: eigenvalues.slice(0, 4),
      assignment: assignment, // for each F26 PC 1..4: best matching boot PC + |cos|
    });

    if ((b + 1) % 10 === 0 || b === 0) {
      const elapsed = (Date.now() - t0) / 1000;
      const eta = elapsed * (N_BOOTSTRAP - b - 1) / Math.max(1, b + 1);
      const lastAbsCoses = assignment.map((a) => a.absCos.toFixed(3)).join(", ");
      console.log(`  [${b + 1}/${N_BOOTSTRAP}] cum_var_top4=${(cumVarTop4 * 100).toFixed(1)}% | |cos|=[${lastAbsCoses}] | elapsed ${elapsed.toFixed(0)}s, ETA ${eta.toFixed(0)}s`);
    }
  }

  // Aggregate stats per F26 PC k = 1..4
  console.log();
  console.log("Aggregating…");
  const perPcAbsCos = [[], [], [], []];
  const perPcBootIdMatch = [0, 0, 0, 0]; // how often the best-matching boot PC has the same rank
  for (const r of results) {
    for (let k = 0; k < 4; k++) {
      perPcAbsCos[k].push(r.assignment[k].absCos);
      if (r.assignment[k].bootPc === k + 1) perPcBootIdMatch[k]++;
    }
  }

  const cumVarTop4Vals = results.map((r) => r.cum_var_top4);

  const summary = {
    bootstrap_count: N_BOOTSTRAP,
    subsample_fraction: SUBSAMPLE_FRACTION,
    subsample_n_each: results[0].n_samples,
    f26_reference: F26_REFERENCE,
    f26_cum_var_top4: ref.axes.slice(0, 4).reduce((s, a) => s + a.varShare, 0),
    cum_var_top4: {
      mean: meanOf(cumVarTop4Vals),
      std: stdOf(cumVarTop4Vals),
      min: Math.min(...cumVarTop4Vals),
      max: Math.max(...cumVarTop4Vals),
      p10: quantile(cumVarTop4Vals, 0.10),
      p50: quantile(cumVarTop4Vals, 0.50),
      p90: quantile(cumVarTop4Vals, 0.90),
    },
    per_pc_absCos: perPcAbsCos.map((arr, k) => ({
      ref_pc: k + 1,
      mean: meanOf(arr),
      std: stdOf(arr),
      min: Math.min(...arr),
      max: Math.max(...arr),
      p10: quantile(arr, 0.10),
      p50: quantile(arr, 0.50),
      p90: quantile(arr, 0.90),
      n_above_0_95: arr.filter((x) => x >= 0.95).length,
      n_above_0_90: arr.filter((x) => x >= 0.90).length,
      n_below_0_70: arr.filter((x) => x < 0.70).length,
    })),
    per_pc_rank_match: perPcBootIdMatch.map((n, k) => ({
      ref_pc: k + 1,
      bootstrap_pc_k_matches: n,
      share: n / N_BOOTSTRAP,
    })),
  };

  fs.writeFileSync(path.join(OUTPUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(OUTPUT_DIR, "per_bootstrap.json"), JSON.stringify(results, null, 2));

  // Markdown report
  const md = [];
  md.push(`# S1 — PCA bootstrap stability test`);
  md.push("");
  md.push(`Generated: ${new Date().toISOString()}`);
  md.push(`Seed: ${RNG_SEED}, N bootstrap: ${N_BOOTSTRAP}, fraction: ${SUBSAMPLE_FRACTION}, K PCs: ${K_PCS}.`);
  md.push(`Reference: \`${F26_REFERENCE}\``);
  md.push("");
  md.push(`## Headline`);
  md.push("");
  const meanAbsCosTop4 = perPcAbsCos.flat().reduce((a, b) => a + b, 0) / (4 * N_BOOTSTRAP);
  md.push(`Across ${N_BOOTSTRAP} sub-samples of ${SUBSAMPLE_FRACTION * 100}% (n=${results[0].n_samples} each), the **mean |cos| between each sub-sample's PC1-PC4 and the F26 reference PC1-PC4 (after greedy best-match) is ${meanAbsCosTop4.toFixed(3)}**.`);
  md.push("");
  md.push(`F26 reference: top-4 cumulative variance = ${(summary.f26_cum_var_top4 * 100).toFixed(1)}%.`);
  md.push(`Bootstrap: top-4 cumulative variance mean = ${(summary.cum_var_top4.mean * 100).toFixed(1)}% (p10 ${(summary.cum_var_top4.p10 * 100).toFixed(1)}%, p90 ${(summary.cum_var_top4.p90 * 100).toFixed(1)}%).`);
  md.push("");
  md.push(`## Per-PC sign-invariant cosine to F26 reference`);
  md.push("");
  md.push(`| ref PC | mean \\|cos\\| | std | p10 | p50 | p90 | min | max | n ≥ 0.95 | n ≥ 0.90 | n < 0.70 |`);
  md.push(`| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
  for (const row of summary.per_pc_absCos) {
    md.push(`| ${row.ref_pc} | ${row.mean.toFixed(3)} | ${row.std.toFixed(3)} | ${row.p10.toFixed(3)} | ${row.p50.toFixed(3)} | ${row.p90.toFixed(3)} | ${row.min.toFixed(3)} | ${row.max.toFixed(3)} | ${row.n_above_0_95} | ${row.n_above_0_90} | ${row.n_below_0_70} |`);
  }
  md.push("");
  md.push(`## Per-PC rank stability`);
  md.push("");
  md.push(`How often the **best-matching bootstrap PC has the same rank k** as the reference (i.e., F26 PC k = bootstrap PC k after greedy assignment).`);
  md.push("");
  md.push(`| ref PC | n_match | share |`);
  md.push(`| ---: | ---: | ---: |`);
  for (const row of summary.per_pc_rank_match) {
    md.push(`| ${row.ref_pc} | ${row.bootstrap_pc_k_matches} | ${(row.share * 100).toFixed(1)}% |`);
  }
  md.push("");

  md.push(`## Interpretation`);
  md.push("");

  const meanByPc = summary.per_pc_absCos.map((r) => r.mean);
  const allHigh = meanByPc.every((m) => m >= 0.95);
  const someLow = meanByPc.some((m) => m < 0.70);
  if (allHigh) {
    md.push(`**Result: F26 basis is robust.** All four top PCs have mean |cos| ≥ 0.95 across 100 sub-samples. The 4-corner identification (Well-Sig / Factor A / Riddle / dom-56 bulletin) is not an artifact of the specific corpus sample. → **H1 foundation is firm; v6-v10 results will be interpretable relative to a stable basis.**`);
  } else if (someLow) {
    md.push(`**Result: F26 basis has at least one fragile PC.** At least one of the top-4 PCs has mean |cos| < 0.70 across sub-samples. The 4-corner identification is partially data-fragile. → **The named-corner story needs to be refined; v6-v10 results targeting unstable PCs should be interpreted with caution.**`);
  } else {
    md.push(`**Result: F26 basis is mostly robust with caveats.** Most top PCs have high mean |cos| but at least one is in the 0.70-0.95 band, indicating moderate fragility. → **H1 foundation is mostly firm; one PC may need re-investigation.**`);
  }
  md.push("");
  md.push(`See \`docs/findings.md\` § "2026-05-13 — six new structural tests for H1/H2/H3" for the test design and decision rules.`);

  fs.writeFileSync(path.join(OUTPUT_DIR, "report.md"), md.join("\n"));
  console.log(`Wrote ${OUTPUT_DIR}/summary.json, per_bootstrap.json, report.md`);
  console.log();
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
