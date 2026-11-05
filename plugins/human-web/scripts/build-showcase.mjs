#!/usr/bin/env node
// Собирает showcase/index.html из template.html и config/rules.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rules = readFileSync(join(root, 'config', 'rules.json'), 'utf8');
JSON.parse(rules);
const tpl = readFileSync(join(root, 'showcase', 'template.html'), 'utf8');
const out = tpl.replace('/*RULES_JSON*/null', JSON.stringify(JSON.parse(rules)).replace(/<\//g, '<\\/'));
writeFileSync(join(root, 'showcase', 'index.html'), out);
console.log('showcase/index.html собран');
