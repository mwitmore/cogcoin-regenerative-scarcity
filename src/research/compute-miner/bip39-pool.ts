import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadBip39Words(): Promise<string[]> {
  const filePath = path.join("node_modules", "@cogcoin", "genesis", "bip39_english.txt");
  const raw = await readFile(filePath, "utf8");
  return raw.split(/\r?\n/).map((w) => w.trim()).filter(Boolean);
}

interface MaybeRng { next: () => number; }

export function sampleWords<R extends MaybeRng>(pool: readonly string[], count: number, rng: R): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(pool[Math.floor(rng.next() * pool.length)]!);
  }
  return out;
}
