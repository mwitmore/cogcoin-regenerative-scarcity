#!/usr/bin/env node
/**
 * F44b — observational decomposition of "why do templated miners win often?"
 *
 * Uses the local winners cache (top-5 landed sentences/block w/ canonicalBlend +
 * reward), which does NOT carry the referenced blockhash, so we cannot re-score
 * under counterfactual W here (that needs the blockhash seed join). What we
 * CAN measure from the actual on-chain outcomes:
 *
 *   (1) WIN MARGIN = (blend_rank1 - blend_rank2) / blend_rank1 per block.
 *       Razor-thin margins => the win is W-contingent (a different weight draw
 *       flips it) => lottery. Fat margins => a dominant profile => craft.
 *   (2) TEMPLATE CONCENTRATION = fingerprint rank-1 winners by a function-word
 *       skeleton (content words blanked), then frequency / reward-share / HHI.
 *   (3) Cross: do the FREQUENT templates win by thin or fat margins? If frequent
 *       templated winners win by thin margins, they win on eligibility+volume,
 *       not a craft blend premium.
 *
 * Usage: node scripts/f44b-winner-margin-template.mjs [--cache PATH] [--top N]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const args = process.argv.slice(2);
const getArg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const cachePath = getArg('--cache', join(ROOT, 'data/ecosystem/dashboard-winners-cache.jsonl'));
const topN = parseInt(getArg('--top', '15'), 10);
const outDir = join(ROOT, 'data/research/f44b-winner-margin');

const STOP = new Set(('the of a an and or but to with in on at as if no not is are was were be been '
  + 'this that these those it its for from by into within above below between near beyond over under '
  + 'i we you he she they me my our your his her their them us so then now there here when where what '
  + 'which who whom whose how why all each every any some none both either neither s t').split(/\s+/));

function skeleton(text) {
  const toks = text.toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
  return toks.map(w => (STOP.has(w) ? w : '_')).join(' ');
}

const recs = readFileSync(cachePath, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const byH = {};
for (const r of recs) (byH[r.height] ||= []).push(r);

// ---------- (1) win margins ----------
const margins = [];
for (const h in byH) {
  const rs = byH[h].slice().sort((a, b) => a.rank - b.rank);
  const r1 = rs.find(x => x.rank === 1), r2 = rs.find(x => x.rank === 2);
  if (!r1 || !r2) continue;
  const b1 = Number(r1.canonicalBlend), b2 = Number(r2.canonicalBlend);
  if (!b1 || !b2) continue;
  margins.push({ height: +h, margin: (b1 - b2) / b1, skel: skeleton(r1.sentenceText) });
}
margins.sort((a, b) => a.margin - b.margin);
const mvals = margins.map(m => m.margin);
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const pct = (a, p) => a[Math.floor(p * (a.length - 1))];
const frac = (a, thr) => a.filter(x => x < thr).length / a.length;

// ---------- (2) template concentration on rank-1 ----------
const skelStats = {};
let totalReward = 0, totalWins = 0;
for (const h in byH) {
  const r1 = byH[h].find(x => x.rank === 1);
  if (!r1) continue;
  const s = skeleton(r1.sentenceText);
  (skelStats[s] ||= { wins: 0, reward: 0, margins: [], example: r1.sentenceText });
  skelStats[s].wins++;
  skelStats[s].reward += Number(r1.rewardCogtoshi || 0);
  totalReward += Number(r1.rewardCogtoshi || 0);
  totalWins++;
}
// attach margins by skeleton (from the margin table, keyed on rank-1 skeleton)
for (const m of margins) if (skelStats[m.skel]) skelStats[m.skel].margins.push(m.margin);

const ranked = Object.entries(skelStats).map(([s, v]) => ({
  skel: s, wins: v.wins, winShare: v.wins / totalWins,
  rewardShare: v.reward / totalReward,
  medianMargin: v.margins.length ? pct(v.margins.slice().sort((a, b) => a - b), 0.5) : null,
  example: v.example,
})).sort((a, b) => b.wins - a.wins);

const hhi = ranked.reduce((acc, r) => acc + Math.pow(r.winShare * 100, 2), 0);

// ---------- output ----------
const summary = {
  total_blocks_with_rank2: margins.length,
  total_rank1_wins: totalWins,
  distinct_templates: ranked.length,
  margin: {
    mean: mean(mvals), median: pct(mvals, 0.5), p10: pct(mvals, 0.1), p90: pct(mvals, 0.9),
    frac_below_0p5pct: frac(mvals, 0.005), frac_below_1pct: frac(mvals, 0.01),
    frac_below_2pct: frac(mvals, 0.02), frac_below_5pct: frac(mvals, 0.05),
  },
  HHI_winShare: hhi,
  top_templates: ranked.slice(0, topN),
};
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

const p = (x) => (x * 100).toFixed(2) + '%';
console.log(`\n=== F44b winner margins + template concentration ===`);
console.log(`blocks w/ >=2 ranks: ${margins.length}   rank-1 wins: ${totalWins}   distinct templates: ${ranked.length}`);
console.log(`\nWIN MARGIN (rank1 vs rank2, fraction of winner blend):`);
console.log(`  mean=${p(summary.margin.mean)}  median=${p(summary.margin.median)}  p10=${p(summary.margin.p10)}  p90=${p(summary.margin.p90)}`);
console.log(`  share of wins decided by <0.5%: ${p(summary.margin.frac_below_0p5pct)}  <1%: ${p(summary.margin.frac_below_1pct)}  <2%: ${p(summary.margin.frac_below_2pct)}  <5%: ${p(summary.margin.frac_below_5pct)}`);
console.log(`\nTEMPLATE CONCENTRATION (rank-1 winners):  HHI(winShare,0-10000)=${hhi.toFixed(0)}`);
console.log(`rank  wins  winShare  rewardShare  medMargin  skeleton (content words = _)`);
for (const r of ranked.slice(0, topN)) {
  console.log(`  ${String(r.wins).padStart(4)}  ${p(r.winShare).padStart(7)}  ${p(r.rewardShare).padStart(7)}  ` +
    `${(r.medianMargin == null ? 'n/a' : p(r.medianMargin)).padStart(8)}  ${r.skel.slice(0, 70)}`);
}
console.log(`\nwrote ${join(outDir, 'summary.json')}`);
