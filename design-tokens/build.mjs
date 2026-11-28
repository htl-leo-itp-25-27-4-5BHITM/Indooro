import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildSwift } from './build-swift.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(await readFile(path.join(directory, 'tokens.json'), 'utf8'));
const entries = new Map();
const names = new Set();
const fail = (message) => { throw new Error(message); };
const reference = (value) => typeof value === 'string' && /^\{[^{}]+\}$/.test(value);
const cssName = (key) => `--ind-${key.replaceAll('.', '-')}`;

function collect(group, prefix = []) {
  for (const [name, value] of Object.entries(group)) {
    if (name.startsWith('$')) continue;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) fail(`Invalid name: ${name}`);
    const keys = [...prefix, name];
    const key = keys.join('.');
    if ('$value' in value) {
      if (!value.$type) fail(`Missing $type: ${key}`);
      if (names.has(cssName(key))) fail(`CSS name collision: ${key}`);
      names.add(cssName(key));
      entries.set(key, value);
    } else collect(value, keys);
  }
}
collect(source);

function resolve(value, trail = []) {
  if (reference(value)) {
    const key = value.slice(1, -1);
    if (!entries.has(key)) fail(`Unknown reference: ${key}`);
    if (trail.includes(key)) fail(`Circular reference: ${[...trail, key].join(' -> ')}`);
    return resolve(entries.get(key).$value, [...trail, key]);
  }
  if (Array.isArray(value)) return value.map((item) => resolve(item, trail));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item, trail)]));
  return value;
}

function dimension(value) {
  if (!value || !Number.isFinite(value.value) || !['px', 'rem'].includes(value.unit)) fail('Expected a DTCG px/rem dimension');
  return `${value.value}${value.unit}`;
}
function color(value) {
  if (value?.colorSpace !== 'srgb' || value.components?.length !== 3 ||
      !value.components.every((n) => Number.isFinite(n) && n >= 0 && n <= 1) ||
      !Number.isFinite(value.alpha) || value.alpha < 0 || value.alpha > 1) fail('Expected an sRGB DTCG color');
  const bytes = value.components.map((n) => Math.round(n * 255));
  // Hex preserves the exact 8-bit colors (including alpha) used by the current apps.
  const hex = bytes.map((n) => n.toString(16).padStart(2, '0')).join('');
  if (value.alpha === 1) return `#${hex}`;
  if (Math.abs(value.alpha * 255 - Math.round(value.alpha * 255)) < 1e-10) return `#${hex}${Math.round(value.alpha * 255).toString(16).padStart(2, '0')}`;
  return `rgb(${bytes.join(' ')} / ${value.alpha})`;
}
const genericFamilies = new Set(['serif', 'sans-serif', 'monospace', 'system-ui', 'ui-sans-serif', 'ui-monospace']);
function serialize(type, value) {
  switch (type) {
    case 'color': return color(value);
    case 'dimension': return dimension(value);
    case 'number':
      if (!Number.isFinite(value)) fail('Expected a finite number');
      return String(value);
    case 'fontFamily':
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) fail('Expected a font family array');
      return value.map((v) => genericFamilies.has(v) || /^[\w-]+$/.test(v) ? v : JSON.stringify(v)).join(', ');
    case 'shadow': {
      const shadows = Array.isArray(value) ? value : [value];
      return shadows.map((v) => `${v.inset ? 'inset ' : ''}${[v.offsetX, v.offsetY, v.blur, v.spread].map(dimension).join(' ')} ${color(v.color)}`).join(', ');
    }
    default: fail(`Unsupported DTCG type: ${type}`);
  }
}

const css = [];
const ts = [];
const dark = [];
for (const [key, token] of entries) {
  const resolved = resolve(token.$value, [key]);
  if (reference(token.$value) && entries.get(token.$value.slice(1, -1))?.$type !== token.$type) fail(`Alias type mismatch: ${key}`);
  const literal = serialize(token.$type, resolved);
  const value = reference(token.$value) ? `var(${cssName(token.$value.slice(1, -1))})` : literal;
  css.push(`  ${cssName(key)}: ${value};`);
  const darkValue = token.$extensions?.['indooro.dark'];
  if (darkValue) {
    if (token.$type !== 'color') fail(`Dark override must be a color: ${key}`);
    dark.push(`  ${cssName(key)}: ${serialize(token.$type, resolve(darkValue, [key]))};`);
  }
  ts.push(`  ${JSON.stringify(key)}: ${JSON.stringify(literal)},`);
}
function stylesheet(keys, inlinePalette = false) {
  const selected = [...entries.keys()].filter((key) => keys.has(key));
  const declarations = selected.map((key) => {
    const token = entries.get(key);
    if (inlinePalette && reference(token.$value) && token.$value.startsWith('{color.palette.')) {
      return `  ${cssName(key)}: ${serialize(token.$type, resolve(token.$value, [key]))};`;
    }
    return css[[...entries.keys()].indexOf(key)];
  });
  const overrides = dark.filter((line) => selected.some((key) => line.startsWith(`  ${cssName(key)}:`)));
  const darkBlock = overrides.length ? `\n[data-theme=dark] {\n  color-scheme: dark;\n${overrides.join('\n')}\n}\n@media (prefers-color-scheme: dark) {\n  :root:not([data-theme=light]) {\n    color-scheme: dark;\n${overrides.map((line) => `  ${line}`).join('\n')}\n  }\n}\n` : '';
  const rootBlock = (lines) => lines.length ? `:root {\n${lines.join('\n')}\n}\n` : '';
  // Append new web aliases separately so the established light block stays byte identical.
  const light = inlinePalette ? rootBlock(declarations) :
    rootBlock(declarations.filter((_, index) => !entries.get(selected[index]).$extensions?.['indooro.web-only'])) +
    rootBlock(declarations.filter((_, index) => entries.get(selected[index]).$extensions?.['indooro.web-only']));
  return `/* Generated by design-tokens/build.mjs. Do not edit. */\n${light}${darkBlock}`;
}
const outputs = {
  'tokens.css': stylesheet(new Set(entries.keys())),
  'tokens.ts': `// Generated by design-tokens/build.mjs. Do not edit.\n/** Resolved CSS values keyed by DTCG token path. */\nexport const tokens = {\n${ts.join('\n')}\n} as const;\nexport type TokenName = keyof typeof tokens;\n`,
};
// App entry points load only reachable CSS tokens; the shared output stays complete.
// Include references transitively so aliases and shadow composites always resolve.
for (const app of ['admin-ui', 'pilot-showcase']) {
  const root = path.resolve(directory, '..', app, 'src');
  const files = await readdir(root, { recursive: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  if (!files.length) continue;
  const used = new Set();
  const byName = new Map([...entries.keys()].map((key) => [cssName(key), key]));
  function include(key) {
    if (used.has(key)) return;
    used.add(key);
    const token = entries.get(key);
    for (const match of JSON.stringify(token).matchAll(/\{([^{}]+)\}/g)) {
      if (entries.has(match[1]) && !match[1].startsWith('color.palette.')) include(match[1]);
    }
  }
  for (const file of files.filter((file) => /\.(css|tsx?|jsx?)$/.test(file))) {
    const content = await readFile(path.join(root, file), 'utf8');
    for (const [name] of content.matchAll(/--ind-[a-z0-9-]+/g)) {
      const key = byName.get(name);
      if (!key) fail(`Unknown CSS token in ${app}/${file}: ${name}`);
      include(key);
    }
  }
  outputs[`${app}.css`] = stylesheet(used, true);
}
if (process.argv.slice(2).some((arg) => arg !== '--check')) fail('Usage: node design-tokens/build.mjs [--check]');
const targets = Object.entries(outputs).map(([name, content]) => [path.join(directory, 'dist', name), content]);
// Quarkus serves this checked copy directly; no backend build or HTML changes.
targets.push([path.join(directory, '../backend/indooro_server/src/main/resources/META-INF/resources/design-tokens/tokens.css'), outputs['tokens.css']]);
targets.push([
  path.resolve(directory, '../swift/indooro-EinkaeuferFinal/indooroApp/DesignSystem/IndooroTokens.swift'),
  buildSwift(new Map([...entries].filter(([, token]) => !token.$extensions?.['indooro.web-only'])), resolve),
]);
for (const [target, content] of targets) {
  if (process.argv.includes('--check')) {
    const existing = await readFile(target, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (existing !== content) {
      console.error(`Stale generated file: ${target}. Run node design-tokens/build.mjs`);
      process.exitCode = 1;
    }
  } else {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}
