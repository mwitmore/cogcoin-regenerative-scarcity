import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  deriveBlendSeed,
  displayToInternalBlockhash,
  encodeSentence,
  getWords,
  scoreSentences as scoreEncodedSentences,
} from "@cogcoin/scoring";

export interface VerboseScoreResult {
  sentence: string;
  encodedSentenceHex: string | null;
  requiredWords: string[];
  bip39WordIndices: number[];
  gatesPass: boolean;
  canonicalBlend: string | null;
  scores: number[] | null;
  error: string | null;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadBip39Words(): Promise<string[]> {
  const filePath = path.join("node_modules", "@cogcoin", "genesis", "bip39_english.txt");
  const raw = await readFile(filePath, "utf8");
  return raw.split(/\r?\n/).map((word) => word.trim()).filter(Boolean);
}

export async function scoreSentenceVerbose(
  domainId: number,
  displayBlockhash: string,
  sentence: string,
): Promise<VerboseScoreResult> {
  const internalBlockhash = displayToInternalBlockhash(displayBlockhash);
  const requiredWords = [...getWords(domainId, internalBlockhash)];
  const bip39Words = await loadBip39Words();
  const bip39WordIndices = requiredWords.map((word) => {
    const index = bip39Words.indexOf(word);
    if (index < 0) throw new Error(`Required word ${word} was not found in BIP-39 list.`);
    return index;
  });

  try {
    const rawSentenceBytes = await encodeSentence(sentence);
    const [score] = await scoreEncodedSentences({
      blendSeed: deriveBlendSeed(internalBlockhash),
      verbose: true,
      sentences: [
        {
          rawSentenceBytes,
          bip39WordIndices,
        },
      ],
    });

    return {
      sentence,
      encodedSentenceHex: bytesToHex(rawSentenceBytes),
      requiredWords,
      bip39WordIndices,
      gatesPass: score?.gatesPass ?? false,
      canonicalBlend: score?.canonicalBlend?.toString() ?? null,
      scores: score?.scores ? [...score.scores] : null,
      error: null,
    };
  } catch (error) {
    return {
      sentence,
      encodedSentenceHex: null,
      requiredWords,
      bip39WordIndices,
      gatesPass: false,
      canonicalBlend: null,
      scores: null,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

