#!/usr/bin/env node
// S2 analysis — Project random-valid sentences onto F26 PCs and compare to chain winners.
//
// The S2 generation script (src/research/s2-random-valid/run.ts) produced
// 5,000 gates-passing random sentences. This script:
//   1. Loads the random-valid corpus.
//   2. Loads the chain rank-1 winner corpus (the F26 reference data).
//   3. Computes the chain population mean (centering point).
//   4. Projects both populations onto F26 PC1-PC30 (using the chain mean as origin).
//   5. Compares projection distributions on each PC:
//      a) PC1-PC4 (named corners): do random sentences cluster near chain winners?
//      b) PC11, PC22, PC27, PC28 (unnamed axes): do random sentences reach high
//         values on these axes that chain winners do not?
//   6. Computes the family-score distribution (S3 methodology) on random
//      sentences and compares purity stats.
//   7. Reports headline stats and writes a markdown summary.
//
// See docs/findings.md § "2026-05-13 — six new structural tests for H1/H2/H3".

import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";

const CHAIN_CORPUS = "data/research/scorer-cluster/test-1-corpus/profiles.jsonl";
const F26_REFERENCE = "data/research/scorer-cluster/f26-judge-covariance/eigenvectors.json";
const RANDOM_CORPUS = "data/research/s2-random-valid/profiles.jsonl";
const OUTPUT_DIR = "data/research/s2-random-valid";

const SLOT_COUNT = 224;
const UNNAMED_PCS = [11, 22, 27, 28];
const NAMED_PCS = [1, 2, 3, 4];

const NAMED_FAMILIES = {
  "Factor A": [128, 130, 132, 133, 134, 136, 139, 186, 213],
  "Well-Sig": [
    216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234,
    248, 249, 250, 251, 252,
  ],
  "Riddle": [129, 135, 142, 189, 196, 214, 225],
  "dom-56": [137, 150, 153, 156, 163, 180, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215],
};
const FAMILIES = Object.keys(NAMED_FAMILIES);

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
    out.push({
      slots: r.scores.slice(32, 256).map((v) => v / 65535),
      rawScores: r.scores,
      blend: Number(r.canonicalBlend),
      sentence: r.sentence,
    });
  }
  return out;
}

async function loadS2Random() {
  const rl = readline.createInterface({ input: fs.createReadStream(RANDOM_CORPUS), crlfDelay: Infinity });
  const out = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!r.gatesPass) continue;
    if (!Array.isArray(r.scores) || r.scores.length !== 256) continue;
    out.push({
      slots: r.scores.slice(32, 256).map((v) => v / 65535),
      rawScores: r.scores,
      blend: Number(r.canonicalBlend),
      sentence: r.sentence,
      template: r.template,
      height: r.height,
      domainId: r.domainId,
    });
  }
  return out;
}

function loadF26Reference() {
  const raw = JSON.parse(fs.readFileSync(F26_REFERENCE, "utf-8"));
  return {
    totalVariance: raw.total_variance,
    K90: raw.K90,
    axes: raw.axes,
  };
}

function meanVec(vectors) {
  const m = new Array(SLOT_COUNT).fill(0);
  for (const v of vectors) for (let i = 0; i < SLOT_COUNT; i++) m[i] += v[i];
  for (let i = 0; i < SLOT_COUNT; i++) m[i] /= Math.max(1, vectors.length);
  return m;
}

function projectVec(slots, mean, eigenvector) {
  let s = 0;
  for (let i = 0; i < SLOT_COUNT; i++) s += (slots[i] - mean[i]) * eigenvector[i];
  return s;
}

function familyScore(rawScores256, familySlots) {
  let s = 0;
  for (const slot of familySlots) s += rawScores256[slot] / 65535;
  return s / familySlots.length;
}

function labelWinner(rawScores256) {
  const scores = FAMILIES.map((f) => familyScore(rawScores256, NAMED_FAMILIES[f]));
  const sum = scores.reduce((a, b) => a + b, 0);
  let bestI = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[bestI]) bestI = i;
  return {
    family: FAMILIES[bestI],
    purity: sum === 0 ? 0 : scores[bestI] / sum,
    scores,
  };
}

function meanOf(xs) { return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length); }
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

function distributionStats(xs) {
  if (xs.length === 0) return null;
  return {
    n: xs.length,
    mean: meanOf(xs),
    std: stdOf(xs),
    min: Math.min(...xs),
    max: Math.max(...xs),
    p1: quantile(xs, 0.01),
    p10: quantile(xs, 0.10),
    p25: quantile(xs, 0.25),
    p50: quantile(xs, 0.50),
    p75: quantile(xs, 0.75),
    p90: quantile(xs, 0.90),
    p99: quantile(xs, 0.99),
  };
}

async function main() {
  console.log("S2 analysis — Project random-valid sentences onto F26 PCs");
  console.log();

  console.log("Loading chain rank-1 winners…");
  const chainWinners = await loadRank1FromChain();
  console.log(`Loaded ${chainWinners.length} chain rank-1 winners.`);

  console.log("Loading S2 random-valid sentences…");
  const randomValid = await loadS2Random();
  console.log(`Loaded ${randomValid.length} random-valid sentences.`);

  console.log("Loading F26 reference…");
  const ref = loadF26Reference();
  console.log(`F26: ${ref.axes.length} PCs, K90 = ${ref.K90}.`);

  console.log("Computing chain population mean (the F26 centering point)…");
  const chainMean = meanVec(chainWinners.map((w) => w.slots));

  // Project all axes (PC1..PC30) for both populations
  console.log("Projecting chain winners onto F26 PC1..PC30…");
  const chainProj = chainWinners.map((w) =>
    ref.axes.map((a) => projectVec(w.slots, chainMean, a.eigenvector))
  );

  console.log("Projecting random-valid sentences onto F26 PC1..PC30…");
  const randomProj = randomValid.map((s) =>
    ref.axes.map((a) => projectVec(s.slots, chainMean, a.eigenvector))
  );

  // Normalize: divide each projection by sqrt(eigenvalue) to get z-scores against chain.
  // (i.e., the projection of a chain winner onto PCk has stddev = sqrt(eigenvalue_k))
  const sigmas = ref.axes.map((a) => Math.sqrt(a.eigenvalue));
  const chainZ = chainProj.map((p) => p.map((v, k) => sigmas[k] === 0 ? 0 : v / sigmas[k]));
  const randomZ = randomProj.map((p) => p.map((v, k) => sigmas[k] === 0 ? 0 : v / sigmas[k]));

  // For each PC, compute distribution stats for chain and random
  const perPcCompare = [];
  for (let k = 0; k < ref.axes.length; k++) {
    const chainK = chainZ.map((p) => p[k]);
    const randomK = randomZ.map((p) => p[k]);
    perPcCompare.push({
      pc: k + 1,
      named: ref.axes[k].classification,
      chain: distributionStats(chainK),
      random: distributionStats(randomK),
      // Did any random sentence land at extreme |z| > 2 or > 3 on this axis?
      n_random_above_z2: randomK.filter((x) => Math.abs(x) >= 2).length,
      n_random_above_z3: randomK.filter((x) => Math.abs(x) >= 3).length,
      n_chain_above_z2: chainK.filter((x) => Math.abs(x) >= 2).length,
      n_chain_above_z3: chainK.filter((x) => Math.abs(x) >= 3).length,
    });
  }

  // Blend comparison
  const chainBlendStats = distributionStats(chainWinners.map((w) => w.blend));
  const randomBlendStats = distributionStats(randomValid.map((s) => s.blend));

  // Family purity comparison (S3 methodology applied to random)
  const chainPurities = chainWinners.map((w) => labelWinner(w.rawScores).purity);
  const randomPurities = randomValid.map((s) => labelWinner(s.rawScores).purity);
  const chainPurityStats = distributionStats(chainPurities);
  const randomPurityStats = distributionStats(randomPurities);

  // Family label distribution
  const chainLabels = chainWinners.map((w) => labelWinner(w.rawScores).family);
  const randomLabels = randomValid.map((s) => labelWinner(s.rawScores).family);
  const chainLabelCounts = {};
  const randomLabelCounts = {};
  for (const f of FAMILIES) {
    chainLabelCounts[f] = 0;
    randomLabelCounts[f] = 0;
  }
  for (const l of chainLabels) chainLabelCounts[l]++;
  for (const l of randomLabels) randomLabelCounts[l]++;

  // Key headline: do random sentences ever hit unnamed PCs at |z| > 2?
  const unnamedHits = {};
  for (const pc of UNNAMED_PCS) {
    const row = perPcCompare[pc - 1];
    unnamedHits[`PC${pc}`] = {
      classification: row.named.classification,
      family: row.named.family,
      n_random_above_z2: row.n_random_above_z2,
      n_random_above_z3: row.n_random_above_z3,
      n_chain_above_z2: row.n_chain_above_z2,
      n_chain_above_z3: row.n_chain_above_z3,
      random_max_abs_z: Math.max(Math.abs(row.random.min), Math.abs(row.random.max)),
      chain_max_abs_z: Math.max(Math.abs(row.chain.min), Math.abs(row.chain.max)),
    };
  }

  // Write summary
  const summary = {
    chain_n: chainWinners.length,
    random_n: randomValid.length,
    blend: { chain: chainBlendStats, random: randomBlendStats },
    purity: { chain: chainPurityStats, random: randomPurityStats },
    family_label_distribution: { chain: chainLabelCounts, random: randomLabelCounts },
    unnamed_pc_hits: unnamedHits,
    per_pc_compare: perPcCompare,
  };
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, "s2-analysis-summary.json"), JSON.stringify(summary, null, 2));

  // Markdown report
  const md = [];
  md.push(`# S2 — Random-valid-sentence baseline (analysis)`);
  md.push("");
  md.push(`Generated: ${new Date().toISOString()}`);
  md.push(`Chain corpus: ${chainWinners.length} rank-1 winners from \`${CHAIN_CORPUS}\``);
  md.push(`Random corpus: ${randomValid.length} gates-passing sentences from \`${RANDOM_CORPUS}\``);
  md.push(`F26 reference: \`${F26_REFERENCE}\``);
  md.push("");

  // HEADLINE
  md.push(`## Headline`);
  md.push("");
  md.push(`**Blend comparison (the doubly-filtered bias check):**`);
  md.push(`- Chain rank-1 winners: blend mean ${(chainBlendStats.mean / 1e6).toFixed(0)}M (p10 ${(chainBlendStats.p10 / 1e6).toFixed(0)}M, p90 ${(chainBlendStats.p90 / 1e6).toFixed(0)}M)`);
  md.push(`- Random valid sentences: blend mean ${(randomBlendStats.mean / 1e6).toFixed(0)}M (p10 ${(randomBlendStats.p10 / 1e6).toFixed(0)}M, p90 ${(randomBlendStats.p90 / 1e6).toFixed(0)}M)`);
  md.push("");
  md.push(`Expected: chain >> random in mean blend (chain is mempool-winner-filtered).`);
  md.push("");

  md.push(`**Unnamed-PC reach (the H2 existence question):**`);
  md.push("");
  md.push(`| PC | classification | family (best match) | random max\\|z\\| | random n\\|z\\|≥2 | random n\\|z\\|≥3 | chain max\\|z\\| | chain n\\|z\\|≥2 |`);
  md.push(`| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |`);
  for (const pc of UNNAMED_PCS) {
    const u = unnamedHits[`PC${pc}`];
    const fam = u.family ? u.family : "—";
    md.push(`| **${pc}** | ${u.classification} | ${fam} | ${u.random_max_abs_z.toFixed(2)} | ${u.n_random_above_z2} | ${u.n_random_above_z3} | ${u.chain_max_abs_z.toFixed(2)} | ${u.n_chain_above_z2} |`);
  }
  md.push("");

  md.push(`## Per-PC projection comparison (top 14 PCs)`);
  md.push("");
  md.push(`Projections normalized to **z-score against chain population** (1 σ = sqrt of F26 eigenvalue). Positive/negative direction is arbitrary (eigenvector sign convention).`);
  md.push("");
  md.push(`| PC | classification | chain σ (=1) | chain p10/p90 | random σ | random p10/p90 | random max\\|z\\| | random n\\|z\\|≥2 |`);
  md.push(`| ---: | --- | ---: | --- | ---: | --- | ---: | ---: |`);
  for (let k = 0; k < 14; k++) {
    const r = perPcCompare[k];
    const cls = r.named.classification === "named"
      ? `named: ${r.named.family.split(" ")[0]}`
      : r.named.classification === "weakly-named"
        ? `weakly: ${r.named.family.split(" ")[0]}`
        : "**unnamed**";
    const randMax = Math.max(Math.abs(r.random.min), Math.abs(r.random.max));
    md.push(`| ${r.pc} | ${cls} | 1.000 | ${r.chain.p10.toFixed(2)}/${r.chain.p90.toFixed(2)} | ${r.random.std.toFixed(2)} | ${r.random.p10.toFixed(2)}/${r.random.p90.toFixed(2)} | ${randMax.toFixed(2)} | ${r.n_random_above_z2} |`);
  }
  md.push("");

  md.push(`## Family-label distribution (S3 methodology applied to random)`);
  md.push("");
  md.push(`Labeling: each sentence is assigned to the family whose mean slot-value over its slot list is highest.`);
  md.push("");
  md.push(`| Family | chain n | chain % | random n | random % |`);
  md.push(`| --- | ---: | ---: | ---: | ---: |`);
  for (const f of FAMILIES) {
    md.push(`| ${f} | ${chainLabelCounts[f]} | ${(100 * chainLabelCounts[f] / chainWinners.length).toFixed(1)}% | ${randomLabelCounts[f]} | ${(100 * randomLabelCounts[f] / randomValid.length).toFixed(1)}% |`);
  }
  md.push("");

  md.push(`## Purity comparison`);
  md.push("");
  md.push(`Purity ∈ [0.25, 1.0]: 0.25 = winner fires all 4 families equally; 1.0 = winner fires only one family.`);
  md.push("");
  md.push(`| corpus | mean | std | p10 | p50 | p90 | max | n ≥ 0.5 |`);
  md.push(`| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
  md.push(`| chain rank-1 | ${chainPurityStats.mean.toFixed(3)} | ${chainPurityStats.std.toFixed(3)} | ${chainPurityStats.p10.toFixed(3)} | ${chainPurityStats.p50.toFixed(3)} | ${chainPurityStats.p90.toFixed(3)} | ${chainPurityStats.max.toFixed(3)} | ${chainPurities.filter((x) => x >= 0.5).length} |`);
  md.push(`| random-valid | ${randomPurityStats.mean.toFixed(3)} | ${randomPurityStats.std.toFixed(3)} | ${randomPurityStats.p10.toFixed(3)} | ${randomPurityStats.p50.toFixed(3)} | ${randomPurityStats.p90.toFixed(3)} | ${randomPurityStats.max.toFixed(3)} | ${randomPurities.filter((x) => x >= 0.5).length} |`);
  md.push("");

  // Interpretation
  md.push(`## Interpretation`);
  md.push("");

  // Did random sentences reach unnamed PCs at z > 2?
  const totalUnnamedZ2 = UNNAMED_PCS.reduce((s, pc) => s + unnamedHits[`PC${pc}`].n_random_above_z2, 0);
  const totalUnnamedZ3 = UNNAMED_PCS.reduce((s, pc) => s + unnamedHits[`PC${pc}`].n_random_above_z3, 0);
  const totalNamedZ2 = NAMED_PCS.reduce((s, pc) => s + perPcCompare[pc - 1].n_random_above_z2, 0);

  md.push(`Random valid sentences reached |z| ≥ 2 on **${totalNamedZ2}** instances across PC1-PC4 (named corners) and **${totalUnnamedZ2}** instances across the four F26-flagged unnamed axes (PC11, PC22, PC27, PC28).`);
  md.push("");

  if (totalUnnamedZ2 === 0) {
    md.push(`**Result: Random valid sentences do NOT reach the unnamed PCs at extreme values.** This means the unnamed axes in F26 are *not* reachable by random structural valid sentences — they require something specific (template choice, word combination, or LLM-driven optimization) to fire. → **The F26 "candidate fifth-corner" axes are real geometric features of the chain corpus but are NOT easily reachable by random valid input. Mixed evidence: H1 supported insofar as the geometry is restrictive; H3 supported insofar as the unnamed axes exist but need targeted prompting.**`);
  } else if (totalUnnamedZ2 > totalNamedZ2 / 4) {
    md.push(`**Result: Random valid sentences reach the unnamed PCs at non-trivial rates** (${totalUnnamedZ2} hits at |z|≥2). This is strong evidence that the geometry is **densely populated with reachable points** outside the named-corner axes; the chain's 4-corner concentration reflects a *discovery* phenomenon, not a *geometric* one. → **H2 strongly supported; the v6-v10 program is well-motivated and likely to find more existence proofs.**`);
  } else {
    md.push(`**Result: Random valid sentences reach the unnamed PCs at moderate rates** (${totalUnnamedZ2} hits at |z|≥2 vs ${totalNamedZ2} on named PCs). Mixed evidence — some structural diversity beyond named corners is achievable by random sentences, but the named corners dominate. → **H3 supported; the v6-v10 program should focus on PCs where random hit rate is highest.**`);
  }
  md.push("");

  // Purity comparison — does random match chain's low-purity story?
  if (Math.abs(randomPurityStats.mean - chainPurityStats.mean) < 0.05) {
    md.push(`**Purity finding:** Random-valid mean purity (${randomPurityStats.mean.toFixed(3)}) is very close to chain-rank-1 mean purity (${chainPurityStats.mean.toFixed(3)}). The "all winners fire all families" pattern observed in S3 is **not** an artifact of LLM filtering — it's a property of the protocol's scoring structure itself. → **Strong evidence that the 4 corners are continuous axes of variation, not discrete categorical modes.**`);
  } else {
    md.push(`**Purity finding:** Random-valid mean purity (${randomPurityStats.mean.toFixed(3)}) differs from chain-rank-1 mean purity (${chainPurityStats.mean.toFixed(3)}). The "all winners fire all families" pattern observed in S3 may be partly an LLM/discovery artifact rather than purely geometric.`);
  }
  md.push("");

  md.push(`See \`docs/findings.md\` § "2026-05-13 — six new structural tests for H1/H2/H3" for the test design.`);

  fs.writeFileSync(path.join(OUTPUT_DIR, "s2-analysis-report.md"), md.join("\n"));
  console.log(`Wrote ${OUTPUT_DIR}/s2-analysis-summary.json and s2-analysis-report.md`);
  console.log();
  console.log(`Random reaches |z|≥2 on PC1-PC4 (named): ${totalNamedZ2} times`);
  console.log(`Random reaches |z|≥2 on PC11/22/27/28 (unnamed): ${totalUnnamedZ2} times`);
  console.log(`Random reaches |z|≥3 on PC11/22/27/28 (unnamed): ${totalUnnamedZ3} times`);
  console.log(`Chain rank-1 mean blend: ${(chainBlendStats.mean / 1e6).toFixed(0)}M`);
  console.log(`Random mean blend: ${(randomBlendStats.mean / 1e6).toFixed(0)}M`);
  console.log(`Chain purity mean: ${chainPurityStats.mean.toFixed(3)}`);
  console.log(`Random purity mean: ${randomPurityStats.mean.toFixed(3)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
