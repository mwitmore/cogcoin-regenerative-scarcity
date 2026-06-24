#!/usr/bin/env node
/**
 * F44c — the dispositive craft-vs-lottery test: champion-pool W-churn.
 *
 * The winners cache stores ONE winner per (height, domain) competition, not the
 * losing field, so we cannot re-race co-competitors. Instead we pool the actual
 * CHAMPIONS (real rank-1 winners across domains/heights), each a proven elite
 * sentence, and ask the counterfactual: if all these sentences were judged under
 * weight vector W, who wins? Sweep W over a large pool of real block draws.
 *
 * blend = W . profile, and the 224-profile is intrinsic to the sentence (the
 * required words only gate eligibility, not the blend scale), so blends are
 * comparable across sentences under a common W. We hold each champion's own
 * required-word indices (so it stays legal) and vary only W.
 *
 *   If championship ROTATES across W (no sentence wins more than a few % of W
 *   draws; many distinct W-winners) => there is no W-invariant best => LOTTERY.
 *   If ONE profile wins most W draws => a dominant, W-robust profile => CRAFT.
 *
 * Referenced block = internal(hash_{H-1}) (verified: reproduces cache blend).
 * Offline; local hashes + mempool.space fallback.
 *
 * Usage: node scripts/f44c-counterfactual-w.mjs [--pool P] [--wpool K]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const { assaySentences, deriveBlendSeed, scoreSentences, displayToInternalBlockhash } =
  await import(join(ROOT, 'node_modules/@cogcoin/scoring/dist/index.js'));

const args = process.argv.slice(2);
const getArg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const poolN = parseInt(getArg('--pool', '200'), 10);
const wPool = parseInt(getArg('--wpool', '300'), 10);
const outDir = join(ROOT, 'data/research/f44c-counterfactual-w');

const bh = readFileSync(join(ROOT, 'data/research/scorer-cluster/blockhashes.jsonl'), 'utf8')
  .trim().split('\n').map(l => JSON.parse(l));
const h2hash = new Map(bh.map(o => [o.height, o.blockhash]));
const allHashes = bh.map(o => o.blockhash);

const cache = readFileSync(join(ROOT, 'data/ecosystem/dashboard-winners-cache.jsonl'), 'utf8')
  .trim().split('\n').map(l => JSON.parse(l));

async function hashAt(h) {
  if (h2hash.has(h)) return h2hash.get(h);
  try {
    const t = await (await fetch(`https://mempool.space/api/block-height/${h}`)).text();
    if (/^[0-9a-f]{64}$/.test(t.trim())) { h2hash.set(h, t.trim()); return t.trim(); }
  } catch (_) {}
  return null;
}

// champions = rank-1 winners with a known local hash_{H-1}; sample evenly across range
const champs = cache.filter(r => r.rank === 1 && r.canonicalBlend && Number(r.canonicalBlend) && h2hash.has(r.height - 1));
champs.sort((a, b) => a.height - b.height);
const step = Math.max(1, Math.floor(champs.length / poolN));
const sample = champs.filter((_, i) => i % step === 0).slice(0, poolN);

// W-pool: blendSeeds from a spread of local hashes
const wSeedHashes = allHashes.filter((_, i) => i % Math.max(1, Math.floor(allHashes.length / wPool)) === 0).slice(0, wPool);
const wSeeds = wSeedHashes.map(hh => deriveBlendSeed(displayToInternalBlockhash(hh)));
process.stderr.write(`F44c: pooling up to ${sample.length} champions, W-pool ${wSeeds.length}\n`);

// encode each champion under its own referenced block; verify reproduction
const pool = [];
let verified = 0, failed = 0;
for (const r of sample) {
  const refHash = await hashAt(r.height - 1);
  if (!refHash) { failed++; continue; }
  const ref = displayToInternalBlockhash(refHash);
  let a;
  try { a = (await assaySentences(r.domainId, ref, [r.sentenceText]))[0]; } catch (e) { failed++; continue; }
  if (!a.gatesPass || a.encodedSentenceBytes == null) { failed++; continue; }
  if (String(a.canonicalBlend) !== r.canonicalBlend) { failed++; continue; } // require exact reproduction
  pool.push({ height: r.height, domainId: r.domainId,
    enc: { rawSentenceBytes: a.encodedSentenceBytes, bip39WordIndices: a.bip39WordIndices } });
  verified++;
  if (verified % 25 === 0) process.stderr.write(`  encoded/verified ${verified} (failed ${failed})\n`);
}
process.stderr.write(`pool size ${pool.length} (verified ${verified}, failed ${failed})\n`);
if (pool.length < 10) { console.error('pool too small'); process.exit(1); }

// W-sweep: for each W, who wins the pool?
const encs = pool.map(p => p.enc);
const winCount = new Array(pool.length).fill(0);
const top3Count = new Array(pool.length).fill(0);
let wDone = 0;
for (const seed of wSeeds) {
  const res = await scoreSentences({ blendSeed: seed, sentences: encs, verbose: false });
  const scored = res.map((x, i) => ({ i, v: x.gatesPass ? Number(x.canonicalBlend) : -Infinity }))
    .sort((p, q) => q.v - p.v);
  winCount[scored[0].i]++;
  for (let k = 0; k < 3 && k < scored.length; k++) top3Count[scored[k].i]++;
  wDone++;
  if (wDone % 50 === 0) process.stderr.write(`  W ${wDone}/${wSeeds.length}\n`);
}

const totalW = wSeeds.length;
const winShares = winCount.map(c => c / totalW);
const distinctWinners = winCount.filter(c => c > 0).length;
const sortedShares = winShares.slice().sort((a, b) => b - a);
const topShare = sortedShares[0];
const top5Cum = sortedShares.slice(0, 5).reduce((a, b) => a + b, 0);
// normalized entropy of the win distribution (1 = perfectly spread = max lottery)
const nz = winShares.filter(s => s > 0);
const entropy = -nz.reduce((a, s) => a + s * Math.log(s), 0);
const normEntropy = entropy / Math.log(pool.length);
// effective number of winners (perplexity)
const effWinners = Math.exp(entropy);

const summary = {
  config: { poolSize: pool.length, wPool: totalW, verified, failed },
  distinct_W_winners: distinctWinners,
  distinct_W_winners_frac_of_pool: distinctWinners / pool.length,
  top_winner_W_share: topShare,
  top5_winners_cumulative_W_share: top5Cum,
  effective_number_of_winners: effWinners,
  normalized_entropy: normEntropy,
};
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ summary,
  winShares: winShares.map((s, i) => ({ height: pool[i].height, domainId: pool[i].domainId, winShare: s }))
    .sort((a, b) => b.winShare - a.winShare).slice(0, 30) }, null, 2));

const p = x => (x * 100).toFixed(1) + '%';
console.log(`\n=== F44c champion-pool W-churn ===`);
console.log(`pool of proven champions: ${pool.length}   W draws: ${totalW}`);
console.log(`\nUnder random W, who wins the pool of champions?`);
console.log(`  distinct sentences that win >=1 W draw: ${distinctWinners} (${p(distinctWinners / pool.length)} of pool)`);
console.log(`  single most-robust champion wins:        ${p(topShare)} of W draws`);
console.log(`  top-5 champions together win:            ${p(top5Cum)} of W draws`);
console.log(`  effective number of winners (exp-entropy): ${effWinners.toFixed(1)}`);
console.log(`  normalized entropy (1.0 = pure lottery):   ${normEntropy.toFixed(3)}`);
console.log(`\nwrote ${join(outDir, 'summary.json')}`);
