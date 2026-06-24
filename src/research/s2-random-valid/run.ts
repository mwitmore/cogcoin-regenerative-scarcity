// S2 — Random-valid-sentence baseline (Q ∩ A geometry probe)
//
// Generates random sentences via compute-miner templates against a diverse
// sample of recent blockhashes, scores each locally, and saves every
// gates-passing sentence with its full 256-dim score vector.
//
// Purpose: produce an *unfiltered* sample of points in Q ∩ A (gates-passing
// sentences). The chain corpus is doubly-filtered (LLM-generated AND mempool-
// winner). This sample is filtered only by the protocol's structural gates,
// so its F26 projection reveals what regions of the variance hypercube are
// reachable by sentences-in-general — not just sentences-that-won.
//
// Method:
//   1. Sample N_BLOCKS distinct (height, domain) blockhashes from the chain
//      corpus (data/research/scorer-cluster/test-1-corpus/profiles.jsonl).
//   2. For each blockhash, generate up to SAMPLES_PER_BLOCK random sentences
//      using compute-miner templates with diverse word-fillers.
//   3. Score each; keep only gates-passing.
//   4. Stop when total gates-passing reaches TARGET_VALID, or all blockhashes
//      processed.
//   5. Save profiles.jsonl in the same format as chain corpus for direct
//      comparison.
//
// Output. data/research/s2-random-valid/profiles.jsonl
//
// See docs/findings.md § "2026-05-13 — six new structural tests for H1/H2/H3".

import { appendFile, mkdir, writeFile, readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";

import { scoreSentenceVerbose } from "../../scorer/verbose.js";
import { loadBip39Words, sampleWords } from "../compute-miner/bip39-pool.js";
import { generateRandomSentence, TEMPLATES } from "../compute-miner/templates.js";

const CHAIN_CORPUS = "data/research/scorer-cluster/test-1-corpus/profiles.jsonl";
const OUTPUT_DIR = "data/research/s2-random-valid";

// Generation parameters
const N_BLOCKS = 50; // distinct blockhashes to sample from chain corpus
const SAMPLES_PER_BLOCK_MAX = 400; // max random sentences to try per block
const TARGET_VALID = 5000; // stop when we hit this many gates-passing
const RNG_SEED = 7;

interface ChainProfile {
  height: number;
  domainId: number;
  blockhash: string;
  requiredWords: string[];
}

interface S2Profile {
  height: number;
  domainId: number;
  blockhash: string;
  requiredWords: string[];
  sentence: string;
  encodedSentenceHex: string | null;
  template: string;
  gatesPass: boolean;
  canonicalBlend: string | null;
  scores: number[] | null;
}

class Mulberry32 {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0; }
  next(): number {
    let t = (this.state += 0x6d2b79f5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  pick<T>(arr: readonly T[]): T {
    const idx = Math.floor(this.next() * arr.length);
    return arr[idx]!;
  }
  shuffle<T>(arr: T[]): T[] {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }
  intRange(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

async function loadDistinctBlocks(): Promise<ChainProfile[]> {
  const rl = createInterface({ input: createReadStream(CHAIN_CORPUS), crlfDelay: Infinity });
  const seen = new Set<string>();
  const out: ChainProfile[] = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    let r: any;
    try { r = JSON.parse(line); } catch { continue; }
    const key = `${r.height}:${r.domainId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      height: r.height,
      domainId: r.domainId,
      blockhash: r.blockhash,
      requiredWords: r.requiredWords,
    });
  }
  return out;
}

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log("S2 — Random-valid-sentence baseline");
  console.log(`Params: N_BLOCKS=${N_BLOCKS}, SAMPLES_PER_BLOCK_MAX=${SAMPLES_PER_BLOCK_MAX}, TARGET_VALID=${TARGET_VALID}, seed=${RNG_SEED}`);
  console.log();

  console.log("Loading distinct (height, domain) blocks from chain corpus…");
  const allBlocks = await loadDistinctBlocks();
  console.log(`Found ${allBlocks.length} distinct chain (height, domain) tuples.`);

  const rng = new Mulberry32(RNG_SEED);
  // Shuffle then take first N_BLOCKS
  const blocks = rng.shuffle(allBlocks).slice(0, N_BLOCKS);
  console.log(`Sampled ${blocks.length} blocks for random sentence generation.`);

  const bip39Pool = await loadBip39Words();
  console.log(`BIP-39 pool size: ${bip39Pool.length}.`);

  // Save metadata
  await writeFile(path.join(OUTPUT_DIR, "meta.json"), JSON.stringify({
    started: new Date().toISOString(),
    n_blocks: blocks.length,
    samples_per_block_max: SAMPLES_PER_BLOCK_MAX,
    target_valid: TARGET_VALID,
    seed: RNG_SEED,
    bip39_pool_size: bip39Pool.length,
    template_count: TEMPLATES.length,
    blocks: blocks.map((b) => ({ height: b.height, domainId: b.domainId, blockhash: b.blockhash })),
  }, null, 2));

  const profilesPath = path.join(OUTPUT_DIR, "profiles.jsonl");
  // Truncate any previous run
  await writeFile(profilesPath, "");

  const startTime = Date.now();
  let totalSamples = 0;
  let totalValid = 0;
  let totalScored = 0;
  let totalErrors = 0;
  const perBlockStats: Record<string, { samples: number; valid: number; bestBlend: bigint }> = {};

  for (const block of blocks) {
    if (totalValid >= TARGET_VALID) {
      console.log(`Hit TARGET_VALID (${TARGET_VALID}); stopping.`);
      break;
    }

    const blockKey = `${block.height}:${block.domainId}`;
    perBlockStats[blockKey] = { samples: 0, valid: 0, bestBlend: 0n };

    let blockSamples = 0;
    let blockValid = 0;
    const blockStart = Date.now();
    let lastLog = Date.now();

    while (blockSamples < SAMPLES_PER_BLOCK_MAX && totalValid < TARGET_VALID) {
      const template = rng.pick(TEMPLATES);
      const fillerCount = rng.intRange(template.minFillers, template.maxFillers);
      const fillers = sampleWords(bip39Pool, fillerCount, rng);
      const sentence = generateRandomSentence(template, block.requiredWords, fillers, rng);

      blockSamples++;
      totalSamples++;
      perBlockStats[blockKey]!.samples++;

      let result;
      try {
        result = await scoreSentenceVerbose(block.domainId, block.blockhash, sentence);
        totalScored++;
      } catch (e) {
        totalErrors++;
        continue;
      }

      if (result.gatesPass && result.scores) {
        blockValid++;
        totalValid++;
        perBlockStats[blockKey]!.valid++;
        const blend = BigInt(result.canonicalBlend ?? "0");
        if (blend > perBlockStats[blockKey]!.bestBlend) {
          perBlockStats[blockKey]!.bestBlend = blend;
        }

        const profile: S2Profile = {
          height: block.height,
          domainId: block.domainId,
          blockhash: block.blockhash,
          requiredWords: block.requiredWords,
          sentence,
          encodedSentenceHex: result.encodedSentenceHex,
          template: template.id,
          gatesPass: true,
          canonicalBlend: result.canonicalBlend,
          scores: result.scores,
        };

        await appendFile(profilesPath, JSON.stringify(profile) + "\n");
      }

      if (Date.now() - lastLog > 5000) {
        const elapsed = (Date.now() - blockStart) / 1000;
        const totalElapsed = (Date.now() - startTime) / 1000;
        const rate = blockSamples / elapsed;
        const overallRate = totalSamples / totalElapsed;
        console.log(
          `  block ${blockKey} required=${JSON.stringify(block.requiredWords)} ` +
          `samples=${blockSamples}/${SAMPLES_PER_BLOCK_MAX} valid=${blockValid} ` +
          `(${(rate).toFixed(1)} sps) | total samples=${totalSamples} valid=${totalValid}/${TARGET_VALID} ` +
          `(${(overallRate).toFixed(1)} sps overall, ${((totalElapsed) / 60).toFixed(1)} min)`
        );
        lastLog = Date.now();
      }
    }

    const blockElapsed = (Date.now() - blockStart) / 1000;
    console.log(`  done block ${blockKey} | samples=${blockSamples} valid=${blockValid} (${(blockValid / blockSamples * 100).toFixed(1)}%) in ${blockElapsed.toFixed(1)}s`);
  }

  const elapsedMs = Date.now() - startTime;
  const summary = {
    finished: new Date().toISOString(),
    elapsedMinutes: elapsedMs / 60000,
    blocks_processed: Object.keys(perBlockStats).length,
    total_samples: totalSamples,
    total_scored: totalScored,
    total_errors: totalErrors,
    total_valid: totalValid,
    overall_valid_rate: totalSamples > 0 ? totalValid / totalSamples : 0,
    samples_per_sec: totalSamples / (elapsedMs / 1000),
    per_block: Object.fromEntries(
      Object.entries(perBlockStats).map(([k, v]) => [k, {
        samples: v.samples,
        valid: v.valid,
        valid_rate: v.samples > 0 ? v.valid / v.samples : 0,
        best_blend: v.bestBlend.toString(),
      }]),
    ),
  };
  await writeFile(path.join(OUTPUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));

  console.log();
  console.log(`Done. Total ${totalValid} gates-passing profiles in ${(elapsedMs / 60000).toFixed(1)} min.`);
  console.log(`Overall valid rate: ${(totalValid / totalSamples * 100).toFixed(2)}%`);
  console.log(`Wrote ${profilesPath} and summary.json.`);
}

main().catch((err) => {
  console.error("S2 failed:", err);
  process.exit(1);
});
