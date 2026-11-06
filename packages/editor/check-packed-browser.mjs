import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '../..');
const fixture = mkdtempSync(path.join(tmpdir(), 'scriptr-browser-consumer-'));
if (!fixture.startsWith(path.join(tmpdir(), 'scriptr-browser-consumer-')))
  throw Error('Unexpected fixture directory');
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw Error('Run this check through pnpm package:browser-check.');
const run = (args, cwd) =>
  execFileSync(process.execPath, [pnpmCli, ...args], { cwd, stdio: 'inherit' });
run(
  ['pack', '--pack-destination', fixture],
  path.join(root, 'packages/editor'),
);
const version = JSON.parse(
  readFileSync(path.join(root, 'packages/editor/package.json'), 'utf8'),
).version;
writeFileSync(
  path.join(fixture, 'package.json'),
  JSON.stringify({
    private: true,
    type: 'module',
    dependencies: {
      '@startupmedia/scriptr-editor': `file:./startupmedia-scriptr-editor-${version}.tgz`,
      react: '19.1.1',
      'react-dom': '19.1.1',
      vite: '7.3.7',
    },
  }),
);
writeFileSync(
  path.join(fixture, 'main.jsx'),
  readFileSync(
    path.join(root, 'packages/editor/check-fixtures/browser-host.jsx.txt'),
  ),
);
writeFileSync(
  path.join(fixture, 'index.html'),
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Packed Scriptr acceptance host</title><div id="root"></div><script type="module" src="/main.jsx"></script></html>',
);
run(['install', '--ignore-scripts', '--strict-peer-dependencies'], fixture);
const { createServer } = await import(
  pathToFileURL(path.join(fixture, 'node_modules/vite/dist/node/index.js')).href
);
const server = await createServer({
  root: fixture,
  configFile: false,
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const url = server.resolvedUrls.local[0];

const evidence = path.join(root, '.local/release-evidence');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await context.newPage();
const cases = [];
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const editor = page.getByRole('textbox', { name: 'Document editor' });
const keys = (text) => page.keyboard.type(text, { delay: 25 });
const undo = () => page.keyboard.press('Control+z');
const redo = () => page.keyboard.press('Control+Shift+z');
async function fresh() {
  await page.goto(url);
  await editor.locator('p').click();
  await expect(editor).toBeFocused();
  await page.evaluate(() => {
    window.keyLog = [];
    document.addEventListener('keydown', (e) =>
      window.keyLog.push({ key: e.key, time: performance.now() }),
    );
  });
}
async function state() {
  return page.evaluate(() => ({
    document: window.acceptance.value,
    text: window.acceptance.value.content
      .map((b) => (b.content ?? []).map((n) => n.text ?? '').join(''))
      .join('\n'),
    selection: window.getSelection().anchorOffset,
    undo: !document.querySelector('button[aria-label=Undo]').disabled,
    redo: !document.querySelector('button[aria-label=Redo]').disabled,
    details: window.acceptance.details.at(-1),
    keys: window.keyLog,
  }));
}
async function check(name, text) {
  await expect
    .poll(async () => (await state()).text, { message: name })
    .toBe(text);
  const result = await state();
  cases.push({ name, passed: true, ...result });
  console.log(`PASS ${name}`);
}
try {
  await fresh();
  await keys('one two three');
  const authored = (await state()).details.contributions;
  const times = (await state()).keys
    .filter((e) => e.key.length === 1)
    .map((e) => e.time);
  expect(Math.max(...times.slice(1).map((t, i) => t - times[i]))).toBeLessThan(
    500,
  );
  for (const text of ['one two ', 'one ', '']) {
    await undo();
    await check('uninterrupted word undo', text);
  }
  for (const text of ['one ', 'one two ', 'one two three']) {
    await redo();
    await check('word redo', text);
  }
  expect((await state()).details.contributions).toEqual(authored);
  expect((await state()).details.provenance).toBe('complete');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await check('toolbar undo', 'one two ');
  const beforeEcho = await state();
  await page.evaluate(() => window.acceptance.echo());
  await page.waitForTimeout(50);
  const echoed = await state();
  expect(echoed.document).toEqual(beforeEcho.document);
  expect(echoed.selection).toEqual(beforeEcho.selection);
  expect(echoed.details).toEqual(beforeEcho.details);
  expect(echoed.redo).toBe(true);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await check(
    'equivalent echo preserves toolbar redo and provenance',
    'one two three',
  );
  await undo();
  await keys('new');
  await check('new typing invalidates redo', 'one two new');
  expect((await state()).redo).toBe(false);
  await undo();
  await page.evaluate(() => window.acceptance.replace('Remote baseline'));
  await check('genuine external replacement', 'Remote baseline');
  expect((await state()).undo).toBe(false);
  expect((await state()).redo).toBe(false);
  expect((await state()).details.source).toBe('external');
  expect((await state()).details.additions).toEqual([]);
  await undo();
  await check('undo cannot resurrect replaced content', 'Remote baseline');

  await fresh();
  await keys('on');
  await page.waitForTimeout(650);
  await keys('e');
  await undo();
  await check('idle boundary above 500ms', 'on');
  await fresh();
  await keys('one');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await keys('x');
  await undo();
  await check('caret movement away and back', 'one');
  await fresh();
  await keys('one');
  await page.keyboard.press('Control+a');
  await keys('two');
  await undo();
  await check('selection replacement', 'one');
  await fresh();
  await page.evaluate(() => navigator.clipboard.writeText('pasted'));
  await page.keyboard.press('Control+v');
  await keys('next');
  await undo();
  await check('typing after paste', 'pasted');
  await undo();
  await check('paste is one action', '');
  await fresh();
  await keys('one');
  await page.keyboard.press('Control+b');
  await keys('two');
  await undo();
  await check('formatting separates typing', 'one');
  await fresh();
  await keys('one');
  await page.keyboard.press('Enter');
  await keys('two');
  await undo();
  await check('typing after Enter', 'one\n');
  await undo();
  await check('paragraph break is separate', 'one');
  await fresh();
  await keys('abcd');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Delete');
  await undo();
  await check('forward deletion separated from backward deletion', 'acd');
  await undo();
  await check('backward deletion is separate', 'abcd');
  await fresh();
  await keys('👩🏽‍💻e\u0301 two');
  await undo();
  await check('Unicode word undo', '👩🏽‍💻e\u0301 ');
  await undo();
  await check('grapheme group undo', '');
  await redo();
  await check('grapheme group redo', '👩🏽‍💻e\u0301 ');
  await fresh();
  await keys('e');
  await page.waitForTimeout(650);
  await page.keyboard.insertText('\u0301');
  await undo();
  await check('delayed combining mark stays with its grapheme', '');

  for (let level = 1; level <= 6; level++) {
    await fresh();
    await keys(`/h${level}`);
    await page.keyboard.press('Enter');
    const heading = editor.locator(`h${level}`);
    await expect(heading).toHaveAttribute(
      'data-placeholder',
      `Heading ${level}`,
    );
    await check(`slash Heading ${level} has empty canonical content`, '');
    expect((await state()).document.content[0]).toMatchObject({
      type: 'heading',
      level,
      content: [],
    });
    await undo();
    await expect(editor.locator('p')).toBeVisible();
    await redo();
    await expect(heading).toBeVisible();
    await keys('x');
    await expect(heading).not.toHaveAttribute('data-placeholder');
    await page.keyboard.press('Backspace');
    await expect(heading).toHaveAttribute(
      'data-placeholder',
      `Heading ${level}`,
    );
    if (level === 1)
      await page.screenshot({
        path: path.join(evidence, 'heading-placeholder.png'),
      });
  }
  await fresh();
  await keys('/h1');
  await page.keyboard.press('Enter');
  await keys('/h2');
  await page.keyboard.press('Enter');
  await expect(editor.locator('h2')).toHaveAttribute(
    'data-placeholder',
    'Heading 2',
  );
  await undo();
  await expect(editor.locator('h1')).toHaveAttribute(
    'data-placeholder',
    'Heading 1',
  );
  await redo();
  await expect(editor.locator('h2')).toHaveAttribute(
    'data-placeholder',
    'Heading 2',
  );
  await check('heading level change undo/redo', '');

  // Synthetic DOM composition exercises the browser adapter; native OS IMEs
  // remain a physical-device verification limit.
  await fresh();
  await editor.evaluate((el) => {
    el.dispatchEvent(
      new CompositionEvent('compositionstart', { bubbles: true, data: '' }),
    );
    el.querySelector('p').textContent = '日本';
    window.getSelection().collapse(el.querySelector('p').firstChild, 2);
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertCompositionText',
        data: '日本',
        isComposing: true,
      }),
    );
  });
  await page.waitForTimeout(50);
  await editor.dispatchEvent('compositionend', { data: '日本' });
  await page.waitForTimeout(50);
  await check('simulated IME composition commit', '日本');
  await undo();
  await check('IME commit undo', '');
  await redo();
  await check('IME commit redo', '日本');

  await fresh();
  const reference = page.getByLabel('Reference annotation');
  await reference.locator('p').click();
  await keys('one two three');
  await undo();
  await expect(reference).toHaveText('one two ');
  await undo();
  await expect(reference).toHaveText('one ');
  await redo();
  await expect(reference).toHaveText('one two ');
  cases.push({
    name: 'nested Reference annotation word undo/redo',
    passed: true,
  });

  await fresh();
  await keys('/');
  await page.getByRole('option', { name: 'Heading 2 ##', exact: true }).hover();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-value="heading-3"]')).toHaveAttribute(
    'data-selected',
    'true',
  );
  const search = page.getByRole('combobox', { name: 'Search blocks' });
  await search.click();
  await keys('h6');
  await expect(
    page.getByRole('option', { name: 'Heading 6 ######', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(editor.locator('h6')).toBeVisible();
  await keys('/');
  await search.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu', { name: 'Insert block' })).toHaveCount(0);
  await expect(editor).toBeFocused();
  cases.push({
    name: 'pointer hover, keyboard navigation, search input filtering, Enter and Escape',
    passed: true,
  });

  await fresh();
  await keys('/');
  const contrasts = [];
  for (const scheme of ['light', 'dark'])
    for (const accent of [undefined, '#3976b8']) {
      await page.evaluate(
        ({ scheme, accent }) => {
          window.acceptance.scheme(scheme);
          window.acceptance.accent(accent);
        },
        { scheme, accent },
      );
      await page
        .getByRole('option', { name: 'Heading 1 #', exact: true })
        .hover();
      await page.waitForTimeout(170);
      const measurement = await page.evaluate(() => {
        const ctx = document.createElement('canvas').getContext('2d');
        function rgba(col) {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = col;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].map((v, i) =>
            i === 3 ? v / 255 : v,
          );
        }
        function blend(a, b) {
          return a
            .slice(0, 3)
            .map((v, i) => v * a[3] + b[i] * (1 - a[3]))
            .concat(1);
        }
        function bg(el) {
          return el
            ? blend(
                rgba(getComputedStyle(el).backgroundColor),
                bg(el.parentElement),
              )
            : [255, 255, 255, 1];
        }
        function lum(c) {
          return c
            .slice(0, 3)
            .map((v) => {
              v /= 255;
              return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
            })
            .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
        }
        function measure(el, pseudo) {
          const s = getComputedStyle(el, pseudo),
            b = bg(el);
          let f = rgba(s.color),
            opacity = 1;
          for (let n = el; n; n = n.parentElement)
            opacity *= Number(getComputedStyle(n).opacity);
          f[3] *= opacity;
          f = blend(f, b);
          const a = lum(f),
            c = lum(b);
          return {
            foreground: f.slice(0, 3),
            background: b.slice(0, 3),
            ratio: Number(
              ((Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)).toFixed(2),
            ),
            font: s.fontFamily,
            transition: s.transitionDuration,
          };
        }
        const root = document.querySelector('.scriptr-editor__slash'),
          active = root.querySelector('[data-selected=true]'),
          normal = root.querySelector('[data-value=heading-3]'),
          disabled = root.querySelector('[data-disabled=true]');
        return {
          active: measure(active),
          activeIcon: measure(active.querySelector('svg')),
          normal: measure(normal),
          normalIcon: measure(normal.querySelector('svg')),
          shortcut: measure(normal.querySelector('small')),
          disabled: measure(disabled),
          disabledIcon: measure(disabled.querySelector('svg')),
          placeholder: measure(root.querySelector('input'), '::placeholder'),
          searchIcon: measure(
            root.querySelector('[data-slot=command-input-wrapper] svg'),
          ),
          hostScrollbar: getComputedStyle(
            document.querySelector('header input'),
          ).scrollbarWidth,
          documentFont: getComputedStyle(
            document.querySelector('.scriptr-editor__content'),
          ).fontFamily,
        };
      });
      for (const value of Object.values(measurement))
        if (typeof value === 'object')
          expect(value.ratio).toBeGreaterThanOrEqual(4.5);
      expect(measurement.hostScrollbar).toBe('auto');
      contrasts.push({
        scheme,
        accent: accent ?? 'default brown',
        ...measurement,
      });
      await page.screenshot({
        path: path.join(evidence, `${scheme}-${accent ? 'blue' : 'brown'}.png`),
      });
    }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(
    await page
      .locator('[data-value=heading-1]')
      .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration)),
  ).toBeLessThanOrEqual(0.001);
  cases.push({
    name: 'actual reduced-motion emulation disables transitions',
    passed: true,
  });
  await page.emulateMedia({
    reducedMotion: 'no-preference',
    forcedColors: 'active',
  });
  await page.waitForTimeout(170);
  await expect(page.locator('[data-value=heading-1]')).toHaveCSS(
    'forced-color-adjust',
    'none',
  );
  await page.screenshot({ path: path.join(evidence, 'forced-colors.png') });
  cases.push({ name: 'actual forced-colors emulation', passed: true });
  await page.emulateMedia({ forcedColors: 'none' });
  await search.click();
  expect(
    await page
      .locator('[data-slot=command-input-wrapper]')
      .evaluate((el) => getComputedStyle(el).outlineStyle),
  ).toBe('solid');
  await page.screenshot({ path: path.join(evidence, 'search-focus.png') });

  const touch = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  const mobile = await touch.newPage();
  await mobile.goto(url);
  await mobile
    .getByRole('textbox', { name: 'Document editor' })
    .locator('p')
    .tap();
  await mobile.keyboard.type('/', { delay: 25 });
  const menu = mobile.getByRole('menu', { name: 'Insert block' });
  await expect(menu).toBeVisible();
  const rect = await menu.boundingBox();
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(390);
  const heights = await menu
    .locator('[data-slot=command-item]')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  await mobile.screenshot({ path: path.join(evidence, 'touch-390.png') });
  await mobile.getByRole('option', { name: 'Heading 2 ##', exact: true }).tap();
  await expect(mobile.locator('.scriptr-editor__content h2')).toHaveAttribute(
    'data-placeholder',
    'Heading 2',
  );
  cases.push({
    name: '390px emulated touch layout and tap selection',
    passed: true,
    menu: rect,
    rowHeight: Math.min(...heights),
  });
  await touch.close();
  expect(errors).toEqual([]);
  await writeFile(
    path.join(evidence, 'results.json'),
    JSON.stringify(
      {
        browser: browser.version(),
        cases,
        contrasts,
        errors,
        limitations: [
          'Chromium only',
          'IME composition is simulated; native OS IMEs and physical touch/screen readers are not certified',
        ],
      },
      null,
      2,
    ),
  );
  console.log(`PASS ${cases.length} browser assertions; evidence: ${evidence}`);
} catch (error) {
  await page.screenshot({ path: path.join(evidence, 'failure.png') });
  await writeFile(
    path.join(evidence, 'partial-results.json'),
    JSON.stringify({ cases, errors, error: String(error) }, null, 2),
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
  rmSync(fixture, { recursive: true, force: true });
}
