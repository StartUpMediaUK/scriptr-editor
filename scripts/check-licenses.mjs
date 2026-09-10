import { execFileSync } from 'node:child_process';

const allowedLicenses = new Set([
  '0BSD',
  'Apache-2.0',
  'Apache-2.0 AND LGPL-3.0-or-later',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'ISC',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'Python-2.0',
]);

// `spawndamnit` is MIT licensed but does not declare the license in its
// published package metadata: https://github.com/cspotcode/spawndamnit
const packageLicenseExceptions = new Map([['spawndamnit', 'MIT']]);
const pnpmCli = process.env.npm_execpath;

if (!pnpmCli) {
  throw new Error('pnpm did not provide its CLI path to the license check.');
}

const rawReport = execFileSync(
  process.execPath,
  [pnpmCli, 'licenses', 'list', '--json'],
  { encoding: 'utf8' },
);
const report = JSON.parse(rawReport);
const failures = [];

if (typeof report !== 'object' || report === null || Array.isArray(report)) {
  throw new Error('pnpm returned an invalid license report.');
}

for (const [license, packages] of Object.entries(report)) {
  if (!Array.isArray(packages)) {
    failures.push(`Invalid package list for ${license}`);
    continue;
  }

  for (const dependency of packages) {
    if (
      typeof dependency !== 'object' ||
      dependency === null ||
      !('name' in dependency) ||
      typeof dependency.name !== 'string'
    ) {
      failures.push(`Invalid dependency metadata under ${license}`);
      continue;
    }

    const effectiveLicense =
      packageLicenseExceptions.get(dependency.name) ?? license;

    if (!allowedLicenses.has(effectiveLicense)) {
      failures.push(`${dependency.name}: ${license}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Disallowed or unknown licenses:\n${failures.join('\n')}`);
}

console.log(
  `Validated dependency licenses (${Object.keys(report).length} license groups).`,
);
