#!/usr/bin/env node
// Проверка вёрстки на «роботские» паттерны.
// Режим хука: читает JSON PostToolUse из stdin, проверяет записанный файл.
// Режим CLI:  node check.mjs <файл|папка> [...]  — печатает отчёт.
//
// Настройка: <проект>/.claude/human-web.json
//   { "overrides": { "V03": "off", "L01": "block" },
//     "ignore": ["vendor/", "dist/"] }
// Отключить правило в одном файле: комментарий  human-web-ignore V03 L01

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || join(here, '..');
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const EXT = new Set(['.html', '.htm', '.css', '.scss', '.jsx', '.tsx', '.vue', '.svelte', '.astro', '.mdx']);

function loadConfig() {
  const base = JSON.parse(readFileSync(join(pluginRoot, 'config', 'rules.json'), 'utf8'));
  const userPath = join(projectDir, '.claude', 'human-web.json');
  let user = {};
  if (existsSync(userPath)) {
    try { user = JSON.parse(readFileSync(userPath, 'utf8')); }
    catch (e) { process.stderr.write(`human-web: не удалось прочитать ${userPath}: ${e.message}\n`); }
  }
  const overrides = user.overrides || {};
  const rules = base.rules.map(r => ({ ...r, sev: overrides[r.id] || r.sev }))
    .filter(r => r.sev !== 'off' && r.detect.length)
    .map(r => ({ ...r, res: r.detect.map(src => new RegExp(src, 'giu')) }));
  return { rules, ignore: user.ignore || [] };
}

function scan(text, rules) {
  const skipped = new Set();
  for (const m of text.matchAll(/human-web-ignore((?:\s+[A-Z]\d{2})+)/g)) {
    m[1].trim().split(/\s+/).forEach(id => skipped.add(id));
  }
  const hits = [];
  for (const r of rules) {
    if (skipped.has(r.id)) continue;
    const found = [];
    for (const re of r.res) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const line = text.slice(0, m.index).split('\n').length;
        found.push({ line, sample: m[0].slice(0, 60).replace(/\s+/g, ' ') });
      }
    }
    const limit = r.max ?? 0;
    if (found.length > limit) hits.push({ rule: r, found, limit });
  }
  return hits;
}

function format(file, hits) {
  const lines = [`${file}`];
  for (const { rule, found, limit } of hits) {
    const where = found.slice(0, 4).map(f => `стр.${f.line} «${f.sample}»`).join(', ');
    const more = found.length > 4 ? ` и ещё ${found.length - 4}` : '';
    const cnt = limit ? ` (${found.length} при лимите ${limit})` : '';
    lines.push(`  [${rule.sev.toUpperCase()}] ${rule.id} ${rule.title}${cnt}`);
    lines.push(`    где: ${where}${more}`);
    lines.push(`    как исправить: ${rule.fix}`);
  }
  return lines.join('\n');
}

function walk(p, out = []) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const name of readdirSync(p)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      walk(join(p, name), out);
    }
  } else if (EXT.has(extname(p).toLowerCase())) out.push(p);
  return out;
}

const isIgnored = (file, ignore) => {
  const rel = relative(projectDir, file);
  return rel.includes('plugins/human-web/') || ignore.some(prefix => rel.startsWith(prefix));
};

async function hookMode() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try { input = JSON.parse(raw); } catch { return 0; }
  const file = input?.tool_input?.file_path;
  if (!file || !EXT.has(extname(file).toLowerCase()) || !existsSync(file)) return 0;

  const { rules, ignore } = loadConfig();
  if (isIgnored(file, ignore)) return 0;
  const hits = scan(readFileSync(file, 'utf8'), rules);
  if (!hits.length) return 0;

  const blocking = hits.filter(h => h.rule.sev === 'block');
  const report = format(relative(projectDir, file), hits);
  if (blocking.length) {
    process.stderr.write(`human-web: в файле есть признаки сгенерированного дизайна. Исправь BLOCK-пункты, прежде чем продолжать.\n${report}\n`);
    return 2;
  }
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `human-web, замечания (не блокируют):\n${report}`
    }
  }));
  return 0;
}

function cliMode(paths) {
  const { rules, ignore } = loadConfig();
  const files = paths.flatMap(p => walk(p)).filter(f => !isIgnored(f, ignore));
  let total = 0, blocks = 0;
  for (const f of files) {
    const hits = scan(readFileSync(f, 'utf8'), rules);
    if (!hits.length) continue;
    total += hits.length;
    blocks += hits.filter(h => h.rule.sev === 'block').length;
    console.log(format(relative(projectDir, f), hits) + '\n');
  }
  console.log(`Проверено файлов: ${files.length}. Нарушений: ${total}, из них BLOCK: ${blocks}.`);
  return blocks ? 1 : 0;
}

const args = process.argv.slice(2);
process.exitCode = args.length ? cliMode(args) : await hookMode();
