// F6 v0 — random-template sentence generator
//
// Templates are sentence skeletons with placeholder slots. Tokens like:
//   "R0" .. "R4"  -> the i-th required BIP-39 word
//   "F"           -> a random BIP-39 filler from the pool
//   anything else -> literal token (typically non-BIP-39 function words)
//
// The terminal punctuation token is always included as a literal at the end.
//
// Templates are deliberately diverse in shape (declarative, question, imperative,
// list-like, comma-pivot) and length (10-25 tokens) to give the search broad
// coverage of gate-passable shapes. The 50% BIP-39 cap (gate 12) means each
// template must include enough non-BIP function words (the/and/of/in/etc) to
// dilute the required words plus fillers to ≤50%.
//
// Required words are inserted with non-required tokens interspersed so the
// max-consecutive-BIP-39 cap (gate 10, max=3) is not violated.

interface Slot { kind: "lit" | "req" | "filler"; value: string; }

export interface SentenceTemplate {
  id: string;
  shape: string;
  minFillers: number;
  maxFillers: number;
  build: (
    requiredWords: readonly string[],
    fillers: readonly string[],
    rng: { next: () => number; pick: <T>(a: readonly T[]) => T; intRange: (lo: number, hi: number) => number },
  ) => string;
}

const VERBS_NON_BIP = ["is", "was", "were", "saw", "held", "made", "took", "gave", "set", "told"];
const VERBS_BIP_OK = ["watch", "hold", "find", "wait", "stand", "walk", "turn", "carry", "press", "trust"];
const ADJ = ["small", "quiet", "old", "first", "last", "near", "open", "true", "low", "still"];
const ARTICLES = ["the", "a"];
const CONJ = ["and", "but", "yet", "or", "so", "then", "while"];
const PREPS = ["of", "in", "on", "near", "above", "below", "before", "after", "by", "with", "from"];
const PUNCT_TERM = [".", ".", ".", "?", "!"];

function maybe<R extends { next: () => number }>(rng: R, p: number): boolean {
  return rng.next() < p;
}

// Determiner pool — varied to keep any single token (especially "the") below
// the gate-14 25% repetition threshold. Each call picks "", "the", "a", or "this".
function det<R extends { next: () => number; pick: <T>(a: readonly T[]) => T }>(rng: R): string {
  const x = rng.next();
  if (x < 0.45) return "the ";
  if (x < 0.7) return "a ";
  if (x < 0.85) return "this ";
  return ""; // bare noun
}

export const TEMPLATES: SentenceTemplate[] = [
  {
    id: "first-person-list",
    shape: "I VERB DET R0 and DET R1 PREP DET R2 of DET R3 near DET R4 .",
    minFillers: 0,
    maxFillers: 2,
    build: (req, _fillers, rng) => {
      const v = rng.pick(VERBS_NON_BIP);
      const p1 = rng.pick(PREPS);
      const p2 = rng.pick(PREPS);
      const p3 = rng.pick(PREPS);
      const term = rng.pick(PUNCT_TERM);
      return `I ${v} ${det(rng)}${req[0]} and ${det(rng)}${req[1]} ${p1} ${det(rng)}${req[2]} ${p2} ${det(rng)}${req[3]} ${p3} ${det(rng)}${req[4]}${term}`;
    },
  },
  {
    id: "declarative-pivot",
    shape: "DET R0 was ADJ , and DET R1 VERB DET R2 PREP DET R3 by DET R4 .",
    minFillers: 0,
    maxFillers: 0,
    build: (req, _fillers, rng) => {
      const adj = rng.pick(ADJ);
      const v = rng.pick(VERBS_NON_BIP);
      const conj = rng.pick(CONJ);
      const p = rng.pick(PREPS);
      const p2 = rng.pick(PREPS);
      const term = rng.pick(PUNCT_TERM);
      return `${capitalize(det(rng) + req[0])} was ${adj}, ${conj} ${det(rng)}${req[1]} ${v} ${det(rng)}${req[2]} ${p} ${det(rng)}${req[3]} ${p2} ${det(rng)}${req[4]}${term}`;
    },
  },
  {
    id: "what-is",
    shape: "What is DET R0 of DET R1 between DET R2 and DET R3 above DET R4 ?",
    minFillers: 0,
    maxFillers: 0,
    build: (req, _fillers, rng) => {
      return `What is ${det(rng)}${req[0]} of ${det(rng)}${req[1]} between ${det(rng)}${req[2]} and ${det(rng)}${req[3]} above ${det(rng)}${req[4]}?`;
    },
  },
  {
    id: "imperative-chain",
    shape: "VERB DET R0 and DET R1 , then VERB DET R2 of DET R3 by DET R4 .",
    minFillers: 0,
    maxFillers: 0,
    build: (req, _fillers, rng) => {
      const v1 = rng.pick(VERBS_BIP_OK);
      const v2 = rng.pick(VERBS_BIP_OK);
      const p = rng.pick(PREPS);
      const p2 = rng.pick(PREPS);
      const term = rng.pick(PUNCT_TERM);
      return `${capitalize(v1)} ${det(rng)}${req[0]} and ${det(rng)}${req[1]}, then ${v2} ${det(rng)}${req[2]} ${p} ${det(rng)}${req[3]} ${p2} ${det(rng)}${req[4]}${term}`;
    },
  },
  {
    id: "narrative-with-fillers",
    shape: "I VERB DET F1 PREP DET R0 and DET F2 near DET R1 , CONJ DET R2 VERB DET R3 PREP DET R4 .",
    minFillers: 2,
    maxFillers: 2,
    build: (req, fillers, rng) => {
      const f1 = fillers[0] ?? "thing";
      const f2 = fillers[1] ?? "thing";
      const v1 = rng.pick(VERBS_NON_BIP);
      const v2 = rng.pick(VERBS_NON_BIP);
      const p1 = rng.pick(PREPS);
      const p2 = rng.pick(PREPS);
      const conj = rng.pick(CONJ);
      const term = rng.pick(PUNCT_TERM);
      return `I ${v1} ${det(rng)}${f1} ${p1} ${det(rng)}${req[0]} and ${det(rng)}${f2} ${p2} ${det(rng)}${req[1]}, ${conj} ${det(rng)}${req[2]} ${v2} ${det(rng)}${req[3]} ${rng.pick(PREPS)} ${det(rng)}${req[4]}${term}`;
    },
  },
  {
    id: "aphoristic-balanced",
    shape: "DET R0 is DET R1 of DET R2 , and DET R3 is DET R4 of DET same .",
    minFillers: 0,
    maxFillers: 1,
    build: (req, _fillers, rng) => {
      const term = rng.pick(PUNCT_TERM);
      return `${capitalize(det(rng) + req[0])} is ${det(rng)}${req[1]} of ${det(rng)}${req[2]}, and ${det(rng)}${req[3]} is ${det(rng)}${req[4]} of ${det(rng)}same${term}`;
    },
  },
  {
    id: "comma-pivot-scene",
    shape: "ADJ R0 PREP DET R1 , and I VERB DET R2 PREP DET R3 PREP DET R4 .",
    minFillers: 0,
    maxFillers: 0,
    build: (req, _fillers, rng) => {
      const adj = rng.pick(ADJ);
      const v = rng.pick(VERBS_NON_BIP);
      const p1 = rng.pick(PREPS);
      const p2 = rng.pick(PREPS);
      const term = rng.pick(PUNCT_TERM);
      return `${capitalize(adj)} ${req[0]} ${p1} ${det(rng)}${req[1]}, and I ${v} ${det(rng)}${req[2]} ${p2} ${det(rng)}${req[3]} ${rng.pick(PREPS)} ${det(rng)}${req[4]}${term}`;
    },
  },
  {
    id: "long-fillers",
    shape: "VERB DET R0 PREP DET F1 and DET R1 PREP DET F2 , CONJ DET R2 by DET F3 and DET R3 PREP DET F4 of DET R4 .",
    minFillers: 4,
    maxFillers: 6,
    build: (req, fillers, rng) => {
      const v = rng.pick(VERBS_NON_BIP);
      const conn1 = rng.pick(PREPS);
      const conn2 = rng.pick(PREPS);
      const conn3 = rng.pick(PREPS);
      const conn4 = rng.pick(CONJ);
      const term = rng.pick(PUNCT_TERM);
      const f1 = fillers[0] ?? "thing";
      const f2 = fillers[1] ?? "thing";
      const f3 = fillers[2] ?? "thing";
      const f4 = fillers[3] ?? "thing";
      return `${capitalize(v)} ${det(rng)}${req[0]} ${conn1} ${det(rng)}${f1} and ${det(rng)}${req[1]} ${conn2} ${det(rng)}${f2}, ${conn4} ${det(rng)}${req[2]} by ${det(rng)}${f3} and ${det(rng)}${req[3]} ${conn3} ${det(rng)}${f4} of ${det(rng)}${req[4]}${term}`;
    },
  },
];

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

interface RngLike {
  next: () => number;
  pick: <T>(arr: readonly T[]) => T;
  intRange: (lo: number, hi: number) => number;
}

export function generateRandomSentence(
  template: SentenceTemplate,
  requiredWords: readonly string[],
  fillers: readonly string[],
  rng: RngLike,
): string {
  // Shuffle required words across the template's req slots so different runs
  // produce different word orderings, helping diversify the search distribution.
  const shuffled = [...requiredWords];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return template.build(shuffled, fillers, rng);
}
