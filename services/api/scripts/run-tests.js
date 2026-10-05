#!/usr/bin/env node
/**
 * Runs every `test:*` script in this package, in order, and fails if any of
 * them fails.
 *
 * Suites are discovered from package.json rather than listed here, so a new
 * `test:*` script is picked up with no further wiring. CI used to name each
 * suite as its own workflow step, which is how 24 of 36 suites silently
 * drifted out of the pipeline.
 *
 * Suites needing a live Postgres are skipped by default because CI has no
 * database service; `--include-db` opts back in once one is available.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

// Suites that need a real database, so they cannot run on a bare CI runner.
const REQUIRES_DATABASE = new Set(['test:tenant-admin:integration']);

// Generous enough for the slowest suite (the browser-free ones run in seconds)
// while still bounding a hang.
const SUITE_TIMEOUT_MS = 5 * 60 * 1000;

const packageJson = require(path.join(__dirname, '..', 'package.json'));
const includeDb = process.argv.includes('--include-db');
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);

// Discover the individual suites, excluding any aggregate that re-enters this
// runner — `test:all` is itself a `test:*` script, so without this the runner
// spawns itself forever.
const all = Object.keys(packageJson.scripts)
  .filter((name) => /^test:/.test(name) && !packageJson.scripts[name].includes('run-tests.js'))
  .sort();
const matching = all.filter((name) => !only || name.includes(only));
const selected = matching.filter((name) => includeDb || !REQUIRES_DATABASE.has(name));
// Only report suites held back by the database gate; a suite that `--only`
// filtered out was deselected on purpose and is not worth listing.
const skipped = matching.filter((name) => !selected.includes(name));

if (selected.length === 0) {
  console.error('No test suites matched.');
  process.exit(1);
}

console.log(`Running ${selected.length} suite${selected.length === 1 ? '' : 's'} in ${packageJson.name}\n`);

const npmCli = process.env.npm_execpath?.endsWith('.js') ? process.env.npm_execpath : null;
const failures = [];
const started = Date.now();

for (const name of selected) {
  const label = name.replace(/^test:/, '');
  const at = Date.now();
  // npm sets npm_execpath to its own CLI entry point, so we can invoke it
  // through node and skip the shell entirely — no quoting rules, and no
  // platform difference between npm and npm.cmd. The shell path is only a
  // fallback for running this file directly with node.
  const options = {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    // A suite that never exits would otherwise hold the whole CI step open
    // until the job's own timeout. Fail it instead and keep going.
    timeout: SUITE_TIMEOUT_MS,
  };
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, 'run', '--silent', name], options)
    : spawnSync('npm', ['run', '--silent', name], { ...options, shell: true });
  const seconds = ((Date.now() - at) / 1000).toFixed(1);
  const timedOut = result.error && result.error.code === 'ETIMEDOUT';
  const ok = !timedOut && result.status === 0;
  console.log(`${ok ? 'PASS' : timedOut ? 'TIME' : 'FAIL'}  ${label.padEnd(32)} ${seconds}s`);
  if (!ok) {
    const captured = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    failures.push({
      name,
      output: timedOut
        ? `Timed out after ${SUITE_TIMEOUT_MS / 1000}s and was killed.\n\n${captured}`
        : captured,
    });
  }
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n${selected.length - failures.length}/${selected.length} suites passed in ${elapsed}s`);
if (skipped.length) {
  console.log(`Skipped (needs a database, pass --include-db to run): ${skipped.join(', ')}`);
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`\n${'='.repeat(70)}\n${failure.name}\n${'='.repeat(70)}`);
    console.error(failure.output || '(no output captured)');
  }
  console.error(`\n${failures.length} suite${failures.length === 1 ? '' : 's'} failed: ${failures.map((f) => f.name).join(', ')}`);
  process.exit(1);
}
