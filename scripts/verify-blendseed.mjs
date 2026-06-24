#!/usr/bin/env node
/**
 * F4 — blendSeed independence of per-scorer outputs (slots 32–255).
 * Standalone replication script; no LLM, no chain writes.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  deriveBlendSeed,
  displayToInternalBlockhash,
  encodeSentence,
  scoreSentences,
} from '@cogcoin/scoring';

const OUT = join(process.cwd(), 'data/research/scorer-cluster/f4-blendseed-independence');

async function loadBip39Words() {
  const raw = await readFile(join('node_modules', '@cogcoin', 'genesis', 'bip39_english.txt'), 'utf8');
  return raw.split(/\r?\n/).map((w) => w.trim()).filter(Boolean);
}

async function scoreOnce(label, sentence, fixedBip39Words, blockhash, bip39WordList) {
  const internal = displayToInternalBlockhash(blockhash);
  const bip39WordIndices = fixedBip39Words.map((word) => {
    const idx = bip39WordList.indexOf(word);
    if (idx < 0) throw new Error(`Word ${word} missing from BIP-39 list.`);
    return idx;
  });
  const rawSentenceBytes = await encodeSentence(sentence);
  const [result] = await scoreSentences({
    blendSeed: deriveBlendSeed(internal),
    verbose: true,
    sentences: [{ rawSentenceBytes, bip39WordIndices }],
  });
  const scores = result.scores ? [...result.scores] : [];
  return {
    label,
    blockhash,
    gatesPass: result.gatesPass,
    canonicalBlend: result.canonicalBlend.toString(),
    slots32to255: scores.slice(32, 256),
  };
}

function cosineDistance(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 1 : 1 - dot / denom;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const bip39WordList = await loadBip39Words();
  const sentence =
    'The elephant moved with a curious grace, as if no label had ever touched it, as if the pull of the earth itself had taught its talent for gentleness.';
  const fixedBip39Words = ['label', 'pull', 'talent', 'curious', 'elephant'];
  const blockhashA = '00000000000000000000fa028ef4a99fc84fdcc7f16f85d6d36567bc1765eb63';
  const blockhashB = '00000000000000000000ad45d5cf740f30134e984910108fa3ca3eef851b83de';

  const runA = await scoreOnce('blockhash_A', sentence, fixedBip39Words, blockhashA, bip39WordList);
  const runB = await scoreOnce('blockhash_B', sentence, fixedBip39Words, blockhashB, bip39WordList);
  const cosine = cosineDistance(runA.slots32to255, runB.slots32to255);

  const verdict =
    cosine <= 0.02
      ? 'CONFIRMED: per-scorer outputs are sentence-determined.'
      : cosine <= 0.10
        ? 'PARTIAL: moderate blendSeed dependence.'
        : 'REJECTED: heavy blendSeed dependence.';

  const json = { sentence, fixedBip39Words, blockhashA, blockhashB, cosine_distance: cosine, verdict };
  await writeFile(join(OUT, 'result.json'), JSON.stringify(json, null, 2));
  await writeFile(join(OUT, 'summary.md'), `# F4 blendSeed independence\n\nCosine distance (slots 32–255): **${cosine.toFixed(6)}**\n\n${verdict}\n`);
  console.log(`[f4] cosine=${cosine.toFixed(6)} — ${verdict}`);
  if (cosine > 0.02) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
