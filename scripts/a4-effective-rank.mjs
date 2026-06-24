#!/usr/bin/env node
// A4 — Effective-rank estimate of Q ∩ A via the S2 random-valid corpus.
//
// Purpose. Quantify the intrinsic dimensionality of the gates-passing scoring
// geometry directly, escaping the chain-winner sampling bias that limits F26.
// If the 5,000 random-valid sentences (S2) span ~30 dimensions, F26's chain
// estimate is the right ballpark. If they span 100+, the geometry is much
// richer than chain history suggests and H2 gets further support.
//
// Method.
//   1. Load S2 random-valid sentences (5,000) and chain rank-1 winners (3,566)
//      for direct comparison.
//   2. For each corpus, compute the 224×224 covariance matrix centered on its
//      own mean (we want the intrinsic spread, not relative to the other).
//   3. Compute eigenvalues via power iteration (top 100 PCs for each).
//   4. Report effective-rank metrics:
//      - K_90, K_95, K_99: smallest K where cumulative variance reaches that
//        threshold. Smaller = lower effective rank.
//      - Participation ratio: PR = (Σ λ_i)² / Σ λ_i². Insensitive to small
//        eigenvalues; reflects how spread-out the variance is.
//      - Stable rank: SR = trace(C) / λ_max. How many "PC1-sized" axes the
//        covariance contains.
//      - Top-3 share: the % of variance carried by the top 3 PCs (anti-
//        diagonal metric: lower = higher effective rank).
//   5. Random-projection sanity check: project onto random k-dim subspaces
//      for k ∈ {5, 10, 20, 30, 50, 100} and measure variance preservation.
//
// Output. data/research/a4-effective-rank/
//   - summary.json: all metrics for both corpora
//   - report.md: side-by-side comparison
//
// See docs/findings.md § "2026-05-13 — six new structural tests for H1/H2/H3".

import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";

const SLOT_COUNT = 224;
const CHAIN_CORPUS = "data/research/scorer-cluster/test-1-corpus/profiles.jsonl";
const RANDOM_CORPUS = "data/research/s2-random-valid/profiles.jsonl";
const OUTPUT_DIR = "data/research/a4-effective-rank";

const K_PCS = 100;
const POWER_ITER = 250;
const RNG_SEED = 13;

// ---------- RNG ----------
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

// ---------- Linear algebra ----------
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

function topEigenvalues(matrix, k, iterations, rng) {
  const n = matrix.length;
  const m = matrix.map((row) => row.slice());
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
    eigenvalues.push(lambda);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) m[i][j] -= lambda * v[i] * v[j];
  }
  return eigenvalues;
}

// ---------- Data loading ----------
async function loadRank1FromChain() {
  const rl = readline.createInterface({ input: fs.createReadStream(CHAIN_CORPUS), crlfDelay: Infinity });
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

async function loadS2() {
  const rl = readline.createInterface({ input: fs.createReadStream(RANDOM_CORPUS), crlfDelay: Infinity });
  const out = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!r.gatesPass) continue;
    if (!Array.isArray(r.scores) || r.scores.length !== 256) continue;
    out.push(r.scores.slice(32, 256).map((v) => v / 65535));
  }
  return out;
}

// ---------- Effective-rank metrics ----------
function computeMetrics(eigenvalues, totalTrace) {
  // Cumulative variance shares
  let cum = 0;
  const cumShares = [];
  for (const ev of eigenvalues) {
    cum += ev;
    cumShares.push(cum / totalTrace);
  }

  function smallestKForThreshold(threshold) {
    for (let i = 0; i < cumShares.length; i++) {
      if (cumShares[i] >= threshold) return i + 1;
    }
    return null; // not reached within K_PCS
  }

  const K_50 = smallestKForThreshold(0.50);
  const K_80 = smallestKForThreshold(0.80);
  const K_90 = smallestKForThreshold(0.90);
  const K_95 = smallestKForThreshold(0.95);
  const K_99 = smallestKForThreshold(0.99);

  // Participation ratio
  const sumLambda = eigenvalues.reduce((a, b) => a + b, 0);
  const sumLambdaSq = eigenvalues.reduce((a, b) => a + b * b, 0);
  const participationRatio = sumLambdaSq === 0 ? 0 : (sumLambda * sumLambda) / sumLambdaSq;

  // Stable rank: trace / max eigenvalue
  const stableRank = eigenvalues[0] === 0 ? 0 : totalTrace / eigenvalues[0];

  const top3Share = (eigenvalues[0] + eigenvalues[1] + eigenvalues[2]) / totalTrace;
  const top10Share = eigenvalues.slice(0, 10).reduce((a, b) => a + b, 0) / totalTrace;
  const top30Share = eigenvalues.slice(0, 30).reduce((a, b) => a + b, 0) / totalTrace;

  return {
    total_trace: totalTrace,
    eigenvalues_top10: eigenvalues.slice(0, 10),
    cumulative_shares_top10: cumShares.slice(0, 10),
    cumulative_shares_at: { k1: cumShares[0], k5: cumShares[4], k10: cumShares[9], k20: cumShares[19], k30: cumShares[29], k50: cumShares[49], k100: cumShares[99] },
    K_50, K_80, K_90, K_95, K_99,
    participation_ratio: participationRatio,
    stable_rank: stableRank,
    top3_share: top3Share,
    top10_share: top10Share,
    top30_share: top30Share,
  };
}

// ---------- Random projection sanity check ----------
function randomProjectionVariancePreserved(vectors, mean, k, rng) {
  // Generate a random orthogonal projection matrix (224 -> k) and measure
  // variance preservation: var(P*x) / var(x).
  // Use a simple Gaussian projection (Johnson-Lindenstrauss style).
  const P = Array.from({ length: k }, () => {
    const row = new Array(SLOT_COUNT);
    for (let i = 0; i < SLOT_COUNT; i++) {
      // Box-Muller from uniform rng
      const u1 = rng();
      const u2 = rng();
      row[i] = Math.sqrt(-2 * Math.log(Math.max(1e-12, u1))) * Math.cos(2 * Math.PI * u2) / Math.sqrt(k);
    }
    return row;
  });

  let origVar = 0;
  let projVar = 0;
  const centered = new Array(SLOT_COUNT);
  const projected = new Array(k);
  for (const v of vectors) {
    for (let i = 0; i < SLOT_COUNT; i++) centered[i] = v[i] - mean[i];
    let origSum = 0;
    for (let i = 0; i < SLOT_COUNT; i++) origSum += centered[i] * centered[i];
    origVar += origSum;
    for (let j = 0; j < k; j++) {
      let s = 0;
      const Pj = P[j];
      for (let i = 0; i < SLOT_COUNT; i++) s += Pj[i] * centered[i];
      projected[j] = s;
    }
    let projSum = 0;
    for (let j = 0; j < k; j++) projSum += projected[j] * projected[j];
    projVar += projSum;
  }
  return projVar / origVar;
}

// ---------- Main ----------
async function main() {
  console.log("A4 — Effective-rank estimate of Q ∩ A");
  console.log(`Params: K_PCS=${K_PCS}, POWER_ITER=${POWER_ITER}, seed=${RNG_SEED}`);
  console.log();

  console.log("Loading chain rank-1 winners…");
  const chain = await loadRank1FromChain();
  console.log(`Chain: ${chain.length} winners.`);

  console.log("Loading S2 random-valid sentences…");
  const random = await loadS2();
  console.log(`Random: ${random.length} sentences.`);

  const rng = makeRng(RNG_SEED);

  // Chain
  console.log();
  console.log("Computing chain covariance + eigenvalues…");
  const chainMean = meanVec(chain);
  const chainCov = covarianceMatrix(chain, chainMean);
  let chainTrace = 0;
  for (let i = 0; i < SLOT_COUNT; i++) chainTrace += chainCov[i][i];
  const chainEvals = topEigenvalues(chainCov, K_PCS, POWER_ITER, rng);
  const chainMetrics = computeMetrics(chainEvals, chainTrace);
  console.log(`Chain: trace=${chainTrace.toFixed(4)}, K90=${chainMetrics.K_90}, K95=${chainMetrics.K_95}, K99=${chainMetrics.K_99}, PR=${chainMetrics.participation_ratio.toFixed(2)}`);

  // Random
  console.log();
  console.log("Computing random-valid covariance + eigenvalues…");
  const randomMean = meanVec(random);
  const randomCov = covarianceMatrix(random, randomMean);
  let randomTrace = 0;
  for (let i = 0; i < SLOT_COUNT; i++) randomTrace += randomCov[i][i];
  const randomEvals = topEigenvalues(randomCov, K_PCS, POWER_ITER, rng);
  const randomMetrics = computeMetrics(randomEvals, randomTrace);
  console.log(`Random: trace=${randomTrace.toFixed(4)}, K90=${randomMetrics.K_90}, K95=${randomMetrics.K_95}, K99=${randomMetrics.K_99}, PR=${randomMetrics.participation_ratio.toFixed(2)}`);

  // Random projection sanity check on S2
  console.log();
  console.log("Random-projection sanity check on S2 corpus…");
  const projSweep = [];
  for (const k of [5, 10, 20, 30, 50, 100, 200]) {
    const preserved = randomProjectionVariancePreserved(random, randomMean, k, rng);
    projSweep.push({ k, variance_preserved: preserved });
    console.log(`  k=${k}: variance preserved = ${(preserved * 100).toFixed(1)}%`);
  }

  // Summary
  const summary = {
    chain: { n: chain.length, ...chainMetrics },
    random: { n: random.length, ...randomMetrics },
    random_projection_sweep: projSweep,
  };
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));

  // Markdown
  const md = [];
  md.push(`# A4 — Effective-rank estimate of Q ∩ A`);
  md.push("");
  md.push(`Generated: ${new Date().toISOString()}`);
  md.push(`Chain corpus: ${chain.length} rank-1 winners`);
  md.push(`Random corpus: ${random.length} gates-passing structural sentences (S2)`);
  md.push(`PCs computed: top ${K_PCS} (power iteration with deflation, ${POWER_ITER} iter).`);
  md.push("");
  md.push(`## Headline`);
  md.push("");
  md.push(`| Metric | chain rank-1 | random-valid (S2) | what it means |`);
  md.push(`| --- | ---: | ---: | --- |`);
  md.push(`| Total trace (within-corpus variance) | ${chainTrace.toFixed(3)} | ${randomTrace.toFixed(3)} | absolute spread of each corpus |`);
  md.push(`| K_50 (PCs to reach 50% var) | ${chainMetrics.K_50} | ${randomMetrics.K_50} | small = top PCs dominate; large = variance is spread |`);
  md.push(`| K_80 (PCs to reach 80%) | ${chainMetrics.K_80} | ${randomMetrics.K_80} | as above |`);
  md.push(`| **K_90 (PCs to reach 90%)** | **${chainMetrics.K_90}** | **${randomMetrics.K_90}** | **the standard effective-rank measure** |`);
  md.push(`| K_95 | ${chainMetrics.K_95 ?? "—"} | ${randomMetrics.K_95 ?? "—"} | tighter threshold |`);
  md.push(`| K_99 | ${chainMetrics.K_99 ?? "—"} | ${randomMetrics.K_99 ?? "—"} | near-complete reconstruction |`);
  md.push(`| **Participation ratio** | **${chainMetrics.participation_ratio.toFixed(2)}** | **${randomMetrics.participation_ratio.toFixed(2)}** | **"effective number of significant axes"; insensitive to small EVs** |`);
  md.push(`| Stable rank | ${chainMetrics.stable_rank.toFixed(2)} | ${randomMetrics.stable_rank.toFixed(2)} | trace / λ_max; "how many PC1-sized axes fit" |`);
  md.push(`| Top-3 var share | ${(chainMetrics.top3_share * 100).toFixed(1)}% | ${(randomMetrics.top3_share * 100).toFixed(1)}% | low = high effective rank |`);
  md.push(`| Top-10 var share | ${(chainMetrics.top10_share * 100).toFixed(1)}% | ${(randomMetrics.top10_share * 100).toFixed(1)}% | |`);
  md.push(`| Top-30 var share | ${(chainMetrics.top30_share * 100).toFixed(1)}% | ${(randomMetrics.top30_share * 100).toFixed(1)}% | F26 reported 81.6% for chain |`);
  md.push("");
  md.push(`## Top-10 eigenvalues side-by-side`);
  md.push("");
  md.push(`| rank | chain λ | chain cum % | random λ | random cum % |`);
  md.push(`| ---: | ---: | ---: | ---: | ---: |`);
  for (let i = 0; i < 10; i++) {
    md.push(`| ${i + 1} | ${chainEvals[i].toFixed(4)} | ${(chainMetrics.cumulative_shares_top10[i] * 100).toFixed(1)}% | ${randomEvals[i].toFixed(4)} | ${(randomMetrics.cumulative_shares_top10[i] * 100).toFixed(1)}% |`);
  }
  md.push("");
  md.push(`## Random-projection sanity check (S2 corpus)`);
  md.push("");
  md.push(`Project each centered S2 sentence onto a random k-dim Gaussian subspace; report variance preserved.`);
  md.push("");
  md.push(`| k | variance preserved |`);
  md.push(`| ---: | ---: |`);
  for (const r of projSweep) md.push(`| ${r.k} | ${(r.variance_preserved * 100).toFixed(1)}% |`);
  md.push("");

  md.push(`## Interpretation`);
  md.push("");

  const chainEffRank = chainMetrics.participation_ratio;
  const randomEffRank = randomMetrics.participation_ratio;

  if (randomEffRank > chainEffRank * 1.5) {
    md.push(`**Random-valid effective rank (${randomEffRank.toFixed(1)}) significantly EXCEEDS chain rank-1 effective rank (${chainEffRank.toFixed(1)}).** Random structural sentences span MORE independent dimensions of the scoring geometry than chain winners do. The chain's variance is concentrated along ${chainMetrics.K_90} principal directions; the geometry's true achievable spread is ${randomMetrics.K_90} dimensions or more. → **Strong H2 confirmation: the scoring oracle is genuinely high-dimensional and the chain explores only a fraction of it.**`);
  } else if (Math.abs(randomEffRank - chainEffRank) / chainEffRank < 0.15) {
    md.push(`**Random-valid effective rank (${randomEffRank.toFixed(1)}) is similar to chain rank-1 effective rank (${chainEffRank.toFixed(1)}).** The geometry's effective dimensionality is comparable whether sampled from chain or random sources. The scoring oracle has approximately ${randomMetrics.K_90}-dimensional intrinsic variation. → **The chain corpus captures most of the achievable spread; further discovery would be along the same dimensions, not new ones.**`);
  } else {
    md.push(`**Random-valid effective rank (${randomEffRank.toFixed(1)}) is LOWER than chain rank-1 effective rank (${chainEffRank.toFixed(1)}).** Chain history has explored more dimensions of variation than random sentences reach. This suggests LLM-driven and competitive optimization DO produce structural diversity beyond what random templates can produce. → **The chain's dimension-spanning is genuinely exploratory; H3 supported, with discovery driving novel-dimension exploration.**`);
  }
  md.push("");
  md.push(`**For comparison:** F26 reported 30 PCs cover 81.6% of chain variance. A4 confirms with K_90 = ${chainMetrics.K_90} for chain (consistent with F26 if K_80 is in the 25-35 range). The random corpus's K_90 = ${randomMetrics.K_90} is the comparable measure on a less-biased sample of Q ∩ A.`);
  md.push("");
  md.push(`See \`docs/findings.md\` § "2026-05-13 — six new structural tests for H1/H2/H3" for the test design.`);

  fs.writeFileSync(path.join(OUTPUT_DIR, "report.md"), md.join("\n"));
  console.log();
  console.log(`Wrote ${OUTPUT_DIR}/summary.json and report.md`);
}

main().catch((e) => { console.error(e); process.exit(1); });
