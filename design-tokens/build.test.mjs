import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

async function fixture(t, tokens) {
  const root = await mkdtemp(path.join(tmpdir(), 'indooro-tokens-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = path.join(root, 'design-tokens');
  await mkdir(dir);
  await copyFile(new URL('./build.mjs', import.meta.url), path.join(dir, 'build.mjs'));
  await copyFile(new URL('./build-swift.mjs', import.meta.url), path.join(dir, 'build-swift.mjs'));
  await writeFile(path.join(dir, 'tokens.json'), JSON.stringify(tokens));
  return { dir, run: (...args) => spawnSync(process.execPath, [path.join(dir, 'build.mjs'), ...args], { cwd: tmpdir(), encoding: 'utf8' }) };
}
const palette = { ink: { $type: 'color', $value: { colorSpace: 'srgb', components: [16 / 255, 42 / 255, 59 / 255], alpha: 1, hex: '#102a3b' } } };

test('generates portable values and aliases from any working directory; checks every output', async (t) => {
  const { dir, run } = await fixture(t, { color: { ...palette, brand: { $type: 'color', $value: '{color.ink}' } }, space: { sm: { $type: 'dimension', $value: { value: 0.5, unit: 'rem' } } } });
  assert.equal(run().status, 0);
  const css = await readFile(path.join(dir, 'dist/tokens.css'), 'utf8');
  assert.match(css, /--ind-color-ink: #102a3b;/);
  assert.match(css, /--ind-color-brand: var\(--ind-color-ink\);/);
  assert.match(css, /--ind-space-sm: 0.5rem;/);
  assert.match(await readFile(path.join(dir, 'dist/tokens.ts'), 'utf8'), /"color.brand": "#102a3b"/);
  assert.equal(run('--check').status, 0);
  const targets = ['dist/tokens.css', 'dist/tokens.ts', '../backend/indooro_server/src/main/resources/META-INF/resources/design-tokens/tokens.css'];
  for (const name of targets) {
    const file = path.join(dir, name);
    await writeFile(file, 'stale');
    assert.equal(run('--check').status, 1, name);
    assert.equal(await readFile(file, 'utf8'), 'stale', '--check must not write');
    assert.equal(run().status, 0);
    await rm(file);
    assert.equal(run('--check').status, 1, `missing ${name}`);
    assert.equal(run().status, 0);
  }
});
for (const [name, tokens, message] of [
  ['missing reference', { a: { $type: 'color', $value: '{unknown}' } }, /Unknown reference/],
  ['cycle', { a: { $type: 'color', $value: '{b}' }, b: { $type: 'color', $value: '{a}' } }, /Circular reference/],
  ['alias type mismatch', { a: { $type: 'number', $value: '{color.ink}' }, color: palette }, /Alias type mismatch/],
  ['flattened collision', { 'a-b': { $type: 'number', $value: 1 }, a: { b: { $type: 'number', $value: 2 } } }, /CSS name collision/],
  ['invalid dimension', { a: { $type: 'dimension', $value: '8px' } }, /DTCG px\/rem dimension/],
]) {
  test(`rejects ${name}`, async (t) => {
    const { run } = await fixture(t, tokens);
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
  });
}

test('dark overrides preserve light output and use explicit and system selectors', async (t) => {
  const light = { color: { ...palette, surface: { $type: 'color', $value: '{color.ink}' } } };
  const { dir, run } = await fixture(t, light);
  assert.equal(run().status, 0);
  const original = await readFile(path.join(dir, 'dist/tokens.css'), 'utf8');
  light.color.surface.$extensions = { 'indooro.dark': { colorSpace: 'srgb', components: [1, 1, 1], alpha: 1 } };
  await writeFile(path.join(dir, 'tokens.json'), JSON.stringify(light));
  assert.equal(run().status, 0);
  const css = await readFile(path.join(dir, 'dist/tokens.css'), 'utf8');
  assert.ok(css.startsWith(original), 'light CSS stays byte identical');
  assert.match(css, /\[data-theme=dark\] \{\n  color-scheme: dark;\n  --ind-color-surface: #ffffff;/);
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\n  :root:not\(\[data-theme=light\]\)/);
  assert.equal(run('--check').status, 0);
});
