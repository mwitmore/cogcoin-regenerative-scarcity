# F4 — blendSeed independence of per-scorer outputs

Question: are slots 32..255 of the verbose scorer output predominantly sentence-determined, or do they depend on `blendSeed`?

Sentence: `"The elephant moved with a curious grace, as if no label had ever touched it, as if the pull of the earth itself had taught its talent for gentleness."`
Fixed BIP-39 word indices: `label, pull, talent, curious, elephant` (gates pass under both runs).

## Two scoring runs

| Run | Blockhash (display) | gatesPass | canonicalBlend |
|---|---|---|---|
| A | `00000000000000000000fa028ef4a99fc84fdcc7f16f85d6d36567bc1765eb63` | `true` | `361443158` |
| B | `00000000000000000000ad45d5cf740f30134e984910108fa3ca3eef851b83de` | `true` | `445093574` |

Note: canonicalBlend is expected to differ across runs because it is the per-block weighted blend; what matters for clustering is the slot-32..255 vector.

## Slot-32..255 comparison

- Cosine distance (slots 32..255): `0.000000`
- Max absolute slot difference: `0` (slot range is 0..65535)
- Mean absolute slot difference: `0.00`
- Number of slots where the two runs differ at all: `0 / 224`

## Verdict

CONFIRMED: per-scorer outputs are sentence-determined. Cross-block clustering is sound.

## Implications

Cross-block clustering on slots 32..255 is sound. Different sentences scored against their own actual chain blockhashes can be directly compared. F1 (Miranda projection) can use Miranda's wells-experiment profiles directly against Test 4 centroids.
