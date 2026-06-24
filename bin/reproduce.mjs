#!/usr/bin/env node
/**
 * One-command replication check for the Cogcoin regenerative-scarcity study.
 *
 * Fast path (default): re-run analysis scripts on frozen corpora (~1–3 min).
 * Full path (--full): also re-run WASM scoring experiments (10–45 min).
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.cwd();
const FULL = process.argv.includes('--full');

const ANALYSIS_STEPS = [
  ['F26 winner PCA', 'node', ['scripts/f26-judge-covariance.mjs']],
  ['S1 PCA bootstrap', 'node', ['scripts/s1-pca-bootstrap.mjs']],
  ['A4 effective rank', 'node', ['scripts/a4-effective-rank.mjs']],
  ['S2 project on F26', 'node', ['scripts/s2-project-on-f26.mjs']],
  ['F46 H1↔H2 subspace', 'node', ['scripts/f46-h1h2-subspace.mjs']],
  ['F44b margins', 'node', ['scripts/f44b-winner-margin-template.mjs']],
];

const FULL_STEPS = [
  ['F4 blendSeed independence', 'node', ['scripts/verify-blendseed.mjs']],
  ['F44 gate tolerance', 'node', ['scripts/tier3-form-tolerance.mjs', '--blocks', '150']],
  ['F44c W-churn', 'node', ['scripts/f44c-counterfactual-w.mjs']],
  ['F28 temporal stability', 'python3', ['scripts/f28-temporal-stability.py']],
];

function getByPath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => {
    if (o == null) return undefined;
    if (k.endsWith(']')) {
      const [base, idx] = k.replace(']', '').split('[');
      return o[base]?.[Number(idx)];
    }
    return o[k];
  }, obj);
}

function runStep(label, cmd, args) {
  process.stdout.write(`\n▶ ${label}…\n`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  if (r.status !== 0) {
    console.error(`✗ ${label} failed (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

function checkClaims() {
  const spec = JSON.parse(readFileSync(join(ROOT, 'replication/paper-claims.json'), 'utf8'));
  let passed = 0;
  let failed = 0;
  console.log('\n── Paper claim checks (frozen reference tolerances) ──\n');
  for (const c of spec.claims) {
    const p = join(ROOT, c.path);
    if (!existsSync(p)) {
      console.log(`✗ ${c.id}: missing ${c.path}`);
      failed++;
      continue;
    }
    const val = getByPath(JSON.parse(readFileSync(p, 'utf8')), c.json);
    const ok = val !== undefined && Math.abs(val - c.expected) <= c.tolerance;
    const mark = ok ? '✓' : '✗';
    console.log(
      `${mark} ${c.id}: got ${typeof val === 'number' ? val.toPrecision(6) : val} ` +
        `(expected ${c.expected} ± ${c.tolerance}) — ${c.description}`,
    );
    if (ok) passed++;
    else failed++;
  }
  console.log(`\n${passed}/${spec.claims.length} claims within tolerance.`);
  if (failed > 0) process.exit(1);
}

function main() {
  console.log('Cogcoin regenerative-scarcity replication');
  console.log(`Mode: ${FULL ? 'full (includes WASM scoring)' : 'fast (analysis on frozen data)'}`);
  if (!existsSync(join(ROOT, 'node_modules/@cogcoin/scoring'))) {
    console.error('\nRun `npm install` first.');
    process.exit(1);
  }
  for (const step of ANALYSIS_STEPS) runStep(...step);
  if (FULL) {
    for (const step of FULL_STEPS) runStep(...step);
  } else {
    console.log('\n(skipping WASM-heavy steps; use `npm run reproduce:full` to re-run F4/F44/F44c/F28)');
  }
  checkClaims();
  console.log('\nReplication check passed.\n');
}

main();
