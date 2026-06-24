#!/usr/bin/env node
// F26 — Judge-judge covariance PCA on the chain-winner corpus.
//
// Purpose. F10b ran covariance PCA on the *differential* between the dominant
// well and the outside-well singletons; that surfaced Factor A (slots
// 128-144) and Well-Sig (slots 216-234, 248-252) as the two axes that explain
// the inside-vs-outside separation. But F10b's projection (A, S) only covers
// ~33 of 224 slots, and the journal repeatedly notes (lines 3270, 3590, 3603,
// 3890) that the (A, S) framework "is collapsing real structure" — that there
// could be additional latent oppositions in the scoring surface that no
// existing analysis has surfaced.
//
// F26 closes that gap by running PCA on the *unconditional* judge-judge
// covariance across the full chain rank-1 winner population. This surfaces
// every latent direction along which the chain's winning sentences vary,
// regardless of whether those directions correlate with inside/outside-well
// membership.
//
// Method.
//   1. Load all rank-1 gates-passing profiles from test-1-corpus.
//   2. Restrict to the 224 non-gate slots (32-255).
//   3. Compute the 224×224 covariance matrix (centered on the population mean).
//   4. Extract the top 30 eigenvectors via power iteration with deflation.
//   5. For each eigenvector: report variance share, cumulative variance,
//      top 10 loading slots, and pair with the named slot families.
//   6. Flag any high-variance axis that does NOT load onto a named family
//      (Factor A, Well-Sig, Riddle, dom-56 bulletin) — these are the candidate
//      "fifth corner" axes.
//
// Output. data/research/scorer-cluster/f26-judge-covariance/
//   - eigenvectors.json: top 30 eigenvectors with eigenvalues and top loadings
//   - report.md: human-readable summary with named-family classification
//
// Pre-registered exit criterion. If all top-K eigenvectors (K chosen so
// cumulative variance reaches 90%) load primarily onto already-named families,
// the "no fifth corner" hypothesis is reinforced. If any high-eigenvalue axis
// loads on slots that none of the named families touch, that axis is a
// candidate region for F25 (judge-probing) to explore.

import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";

const PROFILES = "data/research/scorer-cluster/test-1-corpus/profiles.jsonl";
const OUTPUT_DIR = "data/research/scorer-cluster/f26-judge-covariance";
const SLOT_COUNT = 224; // slots 32..255

// Named slot families (from F10b, F13, F22 dom-56 inspection)
// Slot indices in the original 256-space (0-indexed).
const NAMED_FAMILIES = {
  "Factor A (F10b — Operator A / @crypto corner)": [128, 130, 132, 133, 134, 136, 139, 186, 213],
  "Well-Sig (F10b — dominant-well signature)": [
    216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234,
    248, 249, 250, 251, 252,
  ],
  "Riddle (F13 — domain-58 anti-fluency family)": [129, 135, 142, 189, 196, 214, 225],
  "dom-56 bulletin (F22 — Operator C / @claudes)": [
    137, 150, 153, 156, 163, 180, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215,
  ],
};

async function loadRank1Profiles() {
  const rl = readline.createInterface({ input: fs.createReadStream(PROFILES), crlfDelay: Infinity });
  const out = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    if (!r.gatesPass) continue;
    if (r.tag?.rank !== 1) continue;
    if (!Array.isArray(r.scores) || r.scores.length !== 256) continue;
    out.push({
      height: r.height,
      domainId: r.domainId,
      sentence: r.sentence,
      blend: typeof r.canonicalBlend === "string" ? Number(r.canonicalBlend) : r.canonicalBlend,
      // Keep only slots 32..255 (the 224 non-gate slots), normalized to [0,1]
      slots: r.scores.slice(32, 256).map((v) => v / 65535),
    });
  }
  return out;
}

function meanVec(vectors) {
  const m = new Array(SLOT_COUNT).fill(0);
  for (const v of vectors) for (let i = 0; i < SLOT_COUNT; i++) m[i] += v[i];
  for (let i = 0; i < SLOT_COUNT; i++) m[i] /= Math.max(1, vectors.length);
  return m;
}

function center(vectors, mean) {
  return vectors.map((v) => v.map((x, i) => x - mean[i]));
}

function vecDot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function vecNorm(a) { return Math.sqrt(vecDot(a, a)); }
function vecScale(a, s) { return a.map((x) => x * s); }

// 224×224 covariance from row-centered samples.
function covarianceMatrix(centered) {
  const n = centered.length;
  const cov = Array.from({ length: SLOT_COUNT }, () => new Array(SLOT_COUNT).fill(0));
  for (const v of centered) {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const vi = v[i];
      for (let j = i; j < SLOT_COUNT; j++) cov[i][j] += vi * v[j];
    }
  }
  for (let i = 0; i < SLOT_COUNT; i++) for (let j = i; j < SLOT_COUNT; j++) {
    cov[i][j] /= Math.max(1, n - 1);
    cov[j][i] = cov[i][j];
  }
  return cov;
}

// Power iteration with deflation for top-K eigenvectors of a symmetric matrix.
function topEigenvectors(matrix, k, iterations = 300) {
  const n = matrix.length;
  let m = matrix.map((row) => row.slice());
  const eigenvectors = [];
  const eigenvalues = [];
  for (let r = 0; r < k; r++) {
    let v = new Array(n).fill(0).map(() => Math.random() - 0.5);
    let norm = vecNorm(v);
    v = vecScale(v, 1 / norm);
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

function topLoadings(eigenvector, count = 12) {
  // eigenvector is in 224-space. Slot index i corresponds to original slot 32+i.
  const loadings = eigenvector.map((x, i) => ({ slot: i + 32, load: x, abs: Math.abs(x) }));
  loadings.sort((a, b) => b.abs - a.abs);
  return loadings.slice(0, count);
}

function classifyAxis(topLoads) {
  const top10 = topLoads.slice(0, 10).map((l) => l.slot);
  const matches = {};
  for (const [name, family] of Object.entries(NAMED_FAMILIES)) {
    const fam = new Set(family);
    const hits = top10.filter((s) => fam.has(s)).length;
    matches[name] = hits;
  }
  const ranked = Object.entries(matches).sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  const [name, hits] = best;
  if (hits >= 4) return { family: name, hits, classification: "named" };
  if (hits >= 2) return { family: name, hits, classification: "weakly-named" };
  return { family: null, hits: 0, classification: "unnamed" };
}

function fmtFloat(v, d = 3) { return v == null ? "—" : v.toFixed(d); }
function fmtPct(v, d = 1) { return (100 * v).toFixed(d) + "%"; }

async function main() {
  console.log("Loading profiles…");
  const profiles = await loadRank1Profiles();
  console.log(`Loaded ${profiles.length} rank-1 gates-passing profiles.`);
  if (profiles.length < 100) {
    console.error("Too few profiles for stable PCA. Aborting.");
    process.exit(1);
  }

  const vecs = profiles.map((p) => p.slots);
  console.log("Computing population mean and centering…");
  const mean = meanVec(vecs);
  const centered = center(vecs, mean);

  console.log("Computing 224×224 covariance matrix…");
  const cov = covarianceMatrix(centered);
  let totalVar = 0;
  for (let i = 0; i < SLOT_COUNT; i++) totalVar += cov[i][i];
  console.log(`Total within-corpus variance (trace of cov): ${totalVar.toFixed(4)}`);

  const K = 30;
  console.log(`Extracting top ${K} eigenvectors via power iteration (this takes a minute)…`);
  const { eigenvectors, eigenvalues } = topEigenvectors(cov, K);

  // Build per-axis report
  let cumvar = 0;
  const axes = [];
  for (let i = 0; i < K; i++) {
    cumvar += eigenvalues[i];
    const top = topLoadings(eigenvectors[i], 12);
    const cls = classifyAxis(top);
    axes.push({
      pc: i + 1,
      eigenvalue: eigenvalues[i],
      varShare: eigenvalues[i] / totalVar,
      cumVarShare: cumvar / totalVar,
      topLoadings: top,
      classification: cls,
    });
  }

  // Find K90 (number of PCs to reach 90% cumulative variance)
  let K90 = K;
  for (let i = 0; i < axes.length; i++) {
    if (axes[i].cumVarShare >= 0.9) { K90 = i + 1; break; }
  }

  const namedAtTop = axes.slice(0, K90).filter((a) => a.classification.classification === "named").length;
  const weaklyNamedAtTop = axes.slice(0, K90).filter((a) => a.classification.classification === "weakly-named").length;
  const unnamedAtTop = axes.slice(0, K90).filter((a) => a.classification.classification === "unnamed").length;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Eigenvectors JSON
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "eigenvectors.json"),
    JSON.stringify({
      n_profiles: profiles.length,
      slot_range: [32, 256],
      total_variance: totalVar,
      K,
      K90,
      axes: axes.map((a) => ({
        pc: a.pc,
        eigenvalue: a.eigenvalue,
        var_share: a.varShare,
        cum_var_share: a.cumVarShare,
        top_loadings: a.topLoadings.map((l) => ({ slot: l.slot, load: l.load })),
        classification: a.classification,
        eigenvector: eigenvectors[a.pc - 1],
      })),
    }, null, 2)
  );

  // Markdown report
  const lines = [];
  lines.push(`# F26 — Judge-judge covariance PCA on the chain-winner corpus`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Profiles: \`${PROFILES}\``);
  lines.push(`Filter: rank-1, gates-passing, all domains.`);
  lines.push(`N = ${profiles.length} profiles, ${SLOT_COUNT} slots (32–255).`);
  lines.push("");
  lines.push("## Headline");
  lines.push("");
  lines.push(`Top **${K90}** principal components reach **${fmtPct(axes[K90 - 1].cumVarShare)}** cumulative variance.`);
  lines.push(`Of those, **${namedAtTop}** load onto already-named slot families (Factor A, Well-Sig, Riddle, dom-56),`);
  lines.push(`**${weaklyNamedAtTop}** are weakly named (2-3 slot overlap), and **${unnamedAtTop}** are unnamed (candidate fifth-corner axes).`);
  lines.push("");
  lines.push("## Top 30 PCs — variance share and classification");
  lines.push("");
  lines.push(`| PC | λ | var share | cum var | top-3 loading slots | classification | named family (best match) |`);
  lines.push(`| ---: | ---: | ---: | ---: | --- | --- | --- |`);
  for (const a of axes) {
    const top3 = a.topLoadings.slice(0, 3).map((l) => `${l.slot}(${l.load >= 0 ? "+" : ""}${l.load.toFixed(2)})`).join(", ");
    const cls = a.classification.classification;
    const fam = a.classification.family ? `${a.classification.family} (${a.classification.hits}/10)` : "—";
    lines.push(`| ${a.pc} | ${a.eigenvalue.toFixed(4)} | ${fmtPct(a.varShare)} | ${fmtPct(a.cumVarShare)} | ${top3} | **${cls}** | ${fam} |`);
  }
  lines.push("");

  // Detailed per-axis breakdown for top 10
  lines.push(`## Detailed loadings — top 10 PCs`);
  lines.push("");
  for (const a of axes.slice(0, 10)) {
    lines.push(`### PC${a.pc} — variance share ${fmtPct(a.varShare)}, cumulative ${fmtPct(a.cumVarShare)}`);
    lines.push("");
    lines.push(`Classification: **${a.classification.classification}** — best match: **${a.classification.family ?? "none"}** (${a.classification.hits}/10 top loadings overlap)`);
    lines.push("");
    lines.push(`| rank | slot | loading |`);
    lines.push(`| ---: | ---: | ---: |`);
    for (let i = 0; i < a.topLoadings.length; i++) {
      const l = a.topLoadings[i];
      lines.push(`| ${i + 1} | ${l.slot} | ${l.load >= 0 ? "+" : ""}${l.load.toFixed(3)} |`);
    }
    lines.push("");
  }

  // Unnamed-axis spotlight
  const unnamed = axes.slice(0, K90).filter((a) => a.classification.classification === "unnamed");
  lines.push(`## Unnamed high-variance axes (candidate fifth-corner directions)`);
  lines.push("");
  if (unnamed.length === 0) {
    lines.push(`**None.** All top-${K90} PCs (covering ≥${fmtPct(axes[K90 - 1].cumVarShare)} of variance) load onto already-named slot families.`);
    lines.push("");
    lines.push(`This is direct empirical evidence that **the scoring surface, as exercised by the chain's actual rank-1 winners, has no latent dimension that the existing four-corner enumeration misses**. Any hypothetical fifth Type-2 corner would have to live in a sub-90%-variance direction (i.e., contribute less to chain-winner variation than the named families) — making it both harder to discover and lower-EV to occupy.`);
  } else {
    lines.push(`Found **${unnamed.length}** unnamed axes in the top ${K90} PCs:`);
    lines.push("");
    for (const a of unnamed) {
      const top5 = a.topLoadings.slice(0, 5).map((l) => `slot ${l.slot} (${l.load >= 0 ? "+" : ""}${l.load.toFixed(3)})`).join(", ");
      lines.push(`- **PC${a.pc}** (var share ${fmtPct(a.varShare)}): ${top5}`);
    }
    lines.push("");
    lines.push(`These are the candidate axes for **F25 (judge-probing)** to explore. For each, design a prompt that maximally activates the top-loading slots and measure whether the resulting sentences score competitively. If yes, the corpus contains an undiscovered fifth corner.`);
  }
  lines.push("");

  // Methodology note
  lines.push(`## Methodology note`);
  lines.push("");
  lines.push(`Eigenvectors extracted via 300-iteration power iteration with deflation. The 224×224 covariance matrix is symmetric positive semi-definite, so power iteration is stable; deflation accuracy degrades after the first ~30 components but is sufficient for the top-30 ranking we need here. Cumulative-variance ratios are exact.`);
  lines.push("");
  lines.push(`Named families used for classification:`);
  lines.push("");
  for (const [name, slots] of Object.entries(NAMED_FAMILIES)) {
    lines.push(`- **${name}**: slots ${slots.join(", ")}`);
  }
  lines.push("");
  lines.push(`Classification rule: an axis is "named" if ≥4 of its top-10 loading slots overlap a named family; "weakly-named" if 2-3 overlap; "unnamed" if 0-1 overlap.`);

  fs.writeFileSync(path.join(OUTPUT_DIR, "report.md"), lines.join("\n"));

  console.log("");
  console.log(`Wrote ${path.join(OUTPUT_DIR, "report.md")}`);
  console.log(`Wrote ${path.join(OUTPUT_DIR, "eigenvectors.json")}`);
  console.log("");
  console.log(`HEADLINE: top ${K90} PCs reach ${fmtPct(axes[K90 - 1].cumVarShare)} cumulative variance.`);
  console.log(`  named:         ${namedAtTop}`);
  console.log(`  weakly-named:  ${weaklyNamedAtTop}`);
  console.log(`  unnamed:       ${unnamedAtTop}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
