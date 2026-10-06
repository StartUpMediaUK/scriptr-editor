import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const checker = fileURLToPath(new URL('./check-licenses.mjs', import.meta.url));

function checkReport(report) {
  const directory = mkdtempSync(join(tmpdir(), 'scriptr-license-report-'));
  try {
    const cli = join(directory, 'pnpm-report.cjs');
    writeFileSync(
      cli,
      `console.log(${JSON.stringify(JSON.stringify(report))});`,
    );
    return spawnSync(process.execPath, [checker], {
      encoding: 'utf8',
      env: { ...process.env, npm_execpath: cli },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('accepts the Linux Sharp binary used by the private documentation app', () => {
  const result = checkReport({
    'LGPL-3.0-or-later': [{ name: '@img/sharp-libvips-linux-x64' }],
  });
  assert.equal(result.status, 0, result.stderr);
});

test('retains rejection for unapproved LGPL dependencies and unknown licenses', () => {
  for (const report of [
    { 'LGPL-3.0-or-later': [{ name: 'unapproved-library' }] },
    { UNKNOWN: [{ name: '@img/sharp-libvips-linux-x64' }] },
  ]) {
    const result = checkReport(report);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Disallowed or unknown licenses/);
  }
});
