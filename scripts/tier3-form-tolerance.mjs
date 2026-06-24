#!/usr/bin/env node
/**
 * Tier-3 form-tolerance experiment (gate vs blend panel, Table 1).
 *
 * Controlled test of the required-words convergence claim: holding the five
 * required words and the per-block weight vector W constant, does sentence FORM
 * cause a difference in oracle score, and is the riddle/classification advantage
 * robust across arbitrary (mostly-noun) word draws?
 *
 * Design (see docs/findings.md 2026-05-28 cont. 3 + the chat draft):
 *   - 6 FORM families, 4 hand-authored templates each, exactly 5 required-word
 *     slots {A}..{E} per template (so the f28 encode/permute/score path reuses).
 *   - WORDSET: real block-derived 5-word sets via getWords over N blocks
 *     (the genuine BIP-39 distribution the form must absorb).
 *   - SLOT-ORDER: sample K permutations of the 5 words per template (nuisance,
 *     averaged out).
 *   - Each filled sentence scored TWICE:
 *       blendWild = score under that block's own blendSeed  -> E_W competitiveness
 *       blendRef  = score under one FIXED reference blendSeed (W held constant)
 *                   -> isolates word-sensitivity (M2 tolerance) from W luck.
 *
 * Metrics emitted per family:
 *   M1 affordance  = mean blendWild (ecological competitiveness)
 *   M2 tolerance   = inverse CV of per-block mean blendRef (W fixed; low spread
 *                    across word draws = tolerant)
 *   M4 gate-pass   = fraction of attempted fills that pass the protocol gates
 * Plus Cohen's d + block-bootstrap CIs for the key family contrasts, per-template
 * means (idiosyncrasy check), and mean token length (confound to report).
 *
 * Offline only. No satoshi, no chain writes, no LLM calls.
 *
 * Usage:
 *   node scripts/tier3-form-tolerance.mjs [--blocks N] [--perms K] [--domain D] \
 *        [--input PATH] [--out DIR]
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');

const { assaySentences, getWords, deriveBlendSeed, scoreSentences, encodeSentence } =
  await import(join(ROOT, 'node_modules/@cogcoin/scoring/dist/index.js'));

// ---------- CLI ----------
const args = process.argv.slice(2);
const getArg = (flag, fb) => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fb;
};
const maxBlocks = parseInt(getArg('--blocks', '150'), 10) || 150;
const numPerms = parseInt(getArg('--perms', '6'), 10) || 6;
const domainId = parseInt(getArg('--domain', '2'), 10) || 2;
const inputPath = getArg('--input', join(ROOT, 'data/research/scorer-cluster/blockhashes.jsonl'));
const outDir = getArg('--out', join(ROOT, 'data/research/tier3-form-tolerance'));

// ---------- Form families (4 templates each, exactly 5 slots A..E) ----------
const FAMILIES = {
  riddle: [
    (A, B, C, D, E) => `What is the ${A} of a ${B} between the ${C} and the ${D} above the ${E}?`,
    (A, B, C, D, E) => `Which ${A} hides the ${B}, the ${C}, and the ${D} beneath the ${E}?`,
    (A, B, C, D, E) => `What ${A} joins the ${B} to the ${C}, the ${D} to the ${E}?`,
    (A, B, C, D, E) => `Where is the ${A} of the ${B}, the ${C} of the ${D}, the heart of the ${E}?`,
  ],
  classification: [
    (A, B, C, D, E) => `The ${A} is the ${B} of the ${C}, and the ${D} is the ${E}.`,
    (A, B, C, D, E) => `Every ${A} is a ${B}, every ${C} a ${D}, and all of them the ${E}.`,
    (A, B, C, D, E) => `The ${A} of the ${B} is the ${C}; the ${D} is the ${E}.`,
    (A, B, C, D, E) => `A ${A} is to a ${B} as a ${C} is to a ${D}, and each a kind of ${E}.`,
  ],
  list: [
    (A, B, C, D, E) => `Here are the ${A} and the ${B}, the ${C}, the ${D}, and the ${E}.`,
    (A, B, C, D, E) => `The ${A}, that ${B} of the ${C}, rests with the ${D} and the ${E}.`,
    (A, B, C, D, E) => `Of all the things, the ${A}, the ${B}, the ${C}, the ${D}, none is the ${E}.`,
    (A, B, C, D, E) => `The ${A}, the ${B}, the ${C}, the ${D}, and the ${E}, together at last.`,
  ],
  // mid-control: plain declaratives that clear the gate (discourse-marker +
  // existential/possessive enumeration). Empirically selected to pass.
  plain_declarative: [
    (A, B, C, D, E) => `Now there is a ${A} and a ${B}, a ${C}, a ${D}, and a ${E}.`,
    (A, B, C, D, E) => `So we keep the ${A} and the ${B}, the ${C}, the ${D}, and the ${E}.`,
    (A, B, C, D, E) => `Now we have a ${A} and a ${B}, a ${C}, a ${D}, and a ${E}.`,
    (A, B, C, D, E) => `Then we keep the ${A} and the ${B}, the ${C}, the ${D}, and the ${E}.`,
  ],
  metrical: [
    (A, B, C, D, E) => `Now ${A} and ${B} shall meet the ${C}, the ${D}, the ${E}.`,
    (A, B, C, D, E) => `The ${A} doth hold the ${B} and ${C} and ${D} and ${E}.`,
    (A, B, C, D, E) => `Upon the ${A} there lies a ${B} and ${C}, a ${D}, an ${E}.`,
    (A, B, C, D, E) => `So sang the ${A}, the ${B}, the ${C}, the ${D}, the ${E}.`,
  ],
  rhymed: [
    (A, B, C, D, E) => `The morning brings the ${A}, ${B}, and ${C}; the evening keeps the ${D} and ${E}.`,
    (A, B, C, D, E) => `They came to find the ${A} and ${B}, they stayed to keep the ${C}, ${D}, ${E}.`,
    (A, B, C, D, E) => `I saw the ${A} beside the ${B}, and near the ${C} the ${D}, the ${E}.`,
    (A, B, C, D, E) => `Oh ${A}, oh ${B}, oh ${C} divine, the ${D}, the ${E}, forever mine.`,
  ],
  // deliberately gate-lethal contrast: transitive SVO event-assertion. Random
  // nouns force implausible events the fluency gates reject. Expected M4 ~ 0;
  // its near-zero gate-pass rate is the finding, not a defect.
  action_narrative: [
    (A, B, C, D, E) => `The ${A} saw the ${B} near the ${C} and gave the ${D} to the ${E}.`,
    (A, B, C, D, E) => `I held the ${A} with the ${B} below the ${C} beyond the ${D} and the ${E}.`,
    (A, B, C, D, E) => `The ${A} met the ${B}, then left the ${C} and the ${D} for the ${E}.`,
    (A, B, C, D, E) => `After the ${A} and the ${B}, the ${C} took the ${D} from the ${E}.`,
  ],
};
const FAMILY_NAMES = Object.keys(FAMILIES);

// ---------- helpers ----------
function samplePermutations(arr, k) {
  // k random permutations of a 5-element array (without obvious dup effort).
  const out = [];
  const seen = new Set();
  const maxUnique = 120; // 5!
  const target = Math.min(k, maxUnique);
  let guard = 0;
  while (out.length < target && guard < target * 50) {
    guard++;
    const p = [...arr];
    for (let i = p.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    const key = p.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function sd(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
}
function cohensD(a, b) {
  const ma = mean(a), mb = mean(b);
  const sa = sd(a), sb = sd(b);
  const pooled = Math.sqrt((sa * sa + sb * sb) / 2) || 1e-9;
  return (ma - mb) / pooled;
}
// block-clustered bootstrap CI on difference of grand means (resample blocks).
function bootstrapDiffCI(perBlockA, perBlockB, B = 2000) {
  const blocks = Object.keys(perBlockA).filter(h => perBlockB[h] !== undefined);
  const diffs = [];
  for (let b = 0; b < B; b++) {
    let sumA = 0, nA = 0, sumB = 0, nB = 0;
    for (let i = 0; i < blocks.length; i++) {
      const h = blocks[Math.floor(Math.random() * blocks.length)];
      sumA += perBlockA[h].sum; nA += perBlockA[h].n;
      sumB += perBlockB[h].sum; nB += perBlockB[h].n;
    }
    diffs.push(sumA / nA - sumB / nB);
  }
  diffs.sort((x, y) => x - y);
  return [diffs[Math.floor(0.025 * B)], diffs[Math.floor(0.975 * B)]];
}

// ---------- main ----------
const lines = readFileSync(inputPath, 'utf8').trim().split('\n');
const blocks = lines.slice(0, maxBlocks).map(l => JSON.parse(l));
process.stderr.write(`Tier-3 form tolerance: ${blocks.length} blocks, ${numPerms} perms/template, domain ${domainId}\n`);
process.stderr.write(`Families: ${FAMILY_NAMES.join(', ')} (4 templates each)\n`);

// reference blendSeed (W held fixed) = first block's seed, constant across the run.
const refBlockhash = blocks[0].blockhash;
const refBlendSeed = deriveBlendSeed(refBlockhash);

// records: { family -> { wild:[], ref:[], attempts, passes,
//                        perTemplate: {idx -> wildArr},
//                        perBlockRef: {h->{sum,n}}, perBlockWild:{h->{sum,n}}, tokenLen } }
const R = {};
for (const f of FAMILY_NAMES) {
  R[f] = {
    wild: [], ref: [], attempts: 0, passes: 0,
    perTemplate: {}, perBlockRef: {}, perBlockWild: {}, tokenLenSum: 0, tokenLenN: 0,
  };
}

let processed = 0;
for (const { height, blockhash } of blocks) {
  try {
    const words = await getWords(domainId, blockhash);
    if (!words || words.length < 5) continue;

    // Build the sentence set for this block: family x template x perms.
    const built = []; // { family, tmplIdx, sentence }
    for (const family of FAMILY_NAMES) {
      const tmpls = FAMILIES[family];
      const perms = samplePermutations(words.slice(0, 5), numPerms);
      for (let ti = 0; ti < tmpls.length; ti++) {
        for (const [A, B, C, D, E] of perms) {
          built.push({ family, tmplIdx: ti, sentence: tmpls[ti](A, B, C, D, E) });
        }
      }
    }

    // bip39WordIndices: from one probe sentence for this block/domain.
    const probe = await assaySentences(domainId, blockhash, [built[0].sentence]);
    const bip39WordIndices = probe[0]?.bip39WordIndices;
    if (!bip39WordIndices) { process.stderr.write(`  skip ${height}: no bip39 indices\n`); continue; }

    // encode
    const encoded = [];
    const meta = [];
    for (const b of built) {
      try {
        const enc = await encodeSentence(b.sentence);
        const rawSentenceBytes = enc instanceof Uint8Array ? enc : new Uint8Array(Object.values(enc));
        encoded.push({ rawSentenceBytes, bip39WordIndices });
        meta.push(b);
      } catch (_) { /* skip malformed */ }
    }

    const blendSeed = deriveBlendSeed(blockhash);
    const wildRes = await scoreSentences({ blendSeed, sentences: encoded, verbose: true });
    const refRes = await scoreSentences({ blendSeed: refBlendSeed, sentences: encoded, verbose: true });

    for (let i = 0; i < meta.length; i++) {
      const { family, tmplIdx, sentence } = meta[i];
      R[family].attempts++;
      const w = wildRes[i], r = refRes[i];
      if (!w?.gatesPass || !r?.gatesPass) continue;
      const bw = Number(w.canonicalBlend), br = Number(r.canonicalBlend);
      if (!bw || !br) continue;
      R[family].passes++;
      R[family].wild.push(bw);
      R[family].ref.push(br);
      (R[family].perTemplate[tmplIdx] ||= []).push(bw);
      (R[family].perBlockWild[height] ||= { sum: 0, n: 0 });
      R[family].perBlockWild[height].sum += bw; R[family].perBlockWild[height].n++;
      (R[family].perBlockRef[height] ||= { sum: 0, n: 0 });
      R[family].perBlockRef[height].sum += br; R[family].perBlockRef[height].n++;
      R[family].tokenLenSum += sentence.split(/\s+/).length; R[family].tokenLenN++;
    }

    processed++;
    if (processed % 10 === 0) process.stderr.write(`  ${processed}/${blocks.length} blocks\n`);
  } catch (err) {
    process.stderr.write(`  error at ${height}: ${err.message}\n`);
  }
}

// ---------- aggregate ----------
function perBlockMeans(perBlock) {
  return Object.values(perBlock).map(o => o.sum / o.n);
}
const summary = { config: { maxBlocks, numPerms, domainId, refBlockhash, processedBlocks: processed }, families: {} };
for (const f of FAMILY_NAMES) {
  const d = R[f];
  const refBlockMeans = perBlockMeans(d.perBlockRef);
  const wildBlockMeans = perBlockMeans(d.perBlockWild);
  const m1 = d.wild.length ? mean(d.wild) : 0;
  const refMeanOfBlockMeans = refBlockMeans.length ? mean(refBlockMeans) : 0;
  const refSdOfBlockMeans = sd(refBlockMeans);
  const m2cv = refMeanOfBlockMeans ? refSdOfBlockMeans / refMeanOfBlockMeans : 0;
  summary.families[f] = {
    n_attempt: d.attempts,
    n_pass: d.passes,
    gate_pass_rate: d.attempts ? d.passes / d.attempts : 0,
    M1_affordance_meanWild: m1,
    sdWild: sd(d.wild),
    M2_tolerance_cv_refBlockMeans: m2cv, // lower = more tolerant (W fixed)
    refBlockMean: refMeanOfBlockMeans,
    refBlockSd: refSdOfBlockMeans,
    wildBlockSd: sd(wildBlockMeans),
    mean_token_len: d.tokenLenN ? d.tokenLenSum / d.tokenLenN : 0,
    perTemplate_meanWild: Object.fromEntries(
      Object.entries(d.perTemplate).map(([k, v]) => [k, mean(v)])
    ),
  };
}

// key contrasts (Cohen's d on wild blends + block-bootstrap CI on mean diff)
const contrasts = [
  ['riddle', 'plain_declarative'],
  ['riddle', 'metrical'],
  ['riddle', 'rhymed'],
  ['classification', 'plain_declarative'],
  ['list', 'plain_declarative'],
  ['plain_declarative', 'metrical'],
  ['plain_declarative', 'rhymed'],
];
summary.contrasts = {};
for (const [a, b] of contrasts) {
  const d = cohensD(R[a].wild, R[b].wild);
  const ci = bootstrapDiffCI(R[a].perBlockWild, R[b].perBlockWild);
  summary.contrasts[`${a}_vs_${b}`] = {
    cohens_d_wild: d,
    mean_diff_wild: mean(R[a].wild) - mean(R[b].wild),
    bootstrap95_meanDiff: ci,
  };
}

// ---------- write + print ----------
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, 'summary.json');
writeFileSync(outPath, JSON.stringify(summary, null, 2));

const fmt = (x) => (x / 1e6).toFixed(2) + 'M';
process.stdout.write('\n=== Tier-3 form-tolerance results ===\n');
process.stdout.write(`blocks=${processed} perms=${numPerms} domain=${domainId}\n\n`);
process.stdout.write('family          M1(meanWild)  M2(CV refW)  gatePass  tokens  n\n');
for (const f of FAMILY_NAMES) {
  const s = summary.families[f];
  process.stdout.write(
    `${f.padEnd(14)}  ${fmt(s.M1_affordance_meanWild).padStart(11)}  ` +
    `${(s.M2_tolerance_cv_refBlockMeans * 100).toFixed(2).padStart(9)}%  ` +
    `${(s.gate_pass_rate * 100).toFixed(0).padStart(7)}%  ` +
    `${s.mean_token_len.toFixed(1).padStart(6)}  ${String(s.n_pass).padStart(5)}\n`
  );
}
process.stdout.write('\nKey contrasts (Cohen d on wild blend; +d means first scores higher):\n');
for (const [k, v] of Object.entries(summary.contrasts)) {
  process.stdout.write(
    `  ${k.padEnd(28)} d=${v.cohens_d_wild.toFixed(3).padStart(7)}  ` +
    `Δmean=${fmt(v.mean_diff_wild).padStart(8)}  ` +
    `95%CI[${fmt(v.bootstrap95_meanDiff[0])}, ${fmt(v.bootstrap95_meanDiff[1])}]\n`
  );
}
process.stdout.write(`\nwrote ${outPath}\n`);
