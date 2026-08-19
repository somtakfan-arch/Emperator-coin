// Самопроверка прав доступа без подключения к Discord:
// на фейковом сервере считаем оверрайды для каждого пресета и проверяем,
// что закрытые каналы действительно закрыты, а публичные — только на чтение.

import { readFile } from 'node:fs/promises';
import { PermissionFlagsBits as P } from 'discord.js';
import { overwritesFor, roleGroups } from './structure.js';

const config = JSON.parse(await readFile(new URL('../config/server.json', import.meta.url), 'utf8'));

const roles = new Map(config.roles.map((r) => [r.key, { id: `role_${r.key}`, name: r.name }]));
const guild = { roles: { everyone: { id: 'everyone' } }, members: { me: { id: 'bot' } } };
const resolve = (preset, type = 'text') => overwritesFor(preset, { guild, roles, config, type });
const forId = (list, id) => list.find((o) => o.id === id);
const has = (perms, flag) => (perms ?? []).includes(flag);

const checks = [];
const check = (name, ok) => checks.push({ name, ok });

for (const preset of ['public-read', 'guest-read', 'members', 'members-read', 'allies', 'staff', 'kurator']) {
  const list = resolve(preset);
  check(`${preset}: боту открыт доступ`, has(forId(list, 'bot')?.allow, P.ViewChannel));
}

{
  const list = resolve('public-read');
  check('public-read: @everyone видит, но не пишет',
    has(forId(list, 'everyone').allow, P.ViewChannel) && has(forId(list, 'everyone').deny, P.SendMessages));
  check('public-read: руководство пишет', has(forId(list, 'role_r7')?.allow, P.SendMessages));
  check('public-read: рядовой состав не получает право на запись', !forId(list, 'role_r3'));
}
{
  const list = resolve('guest');
  check('guest: @everyone читает и пишет',
    has(forId(list, 'everyone').allow, P.ViewChannel) && has(forId(list, 'everyone').allow, P.SendMessages));
}
{
  const list = resolve('members');
  check('members: @everyone не видит канал', has(forId(list, 'everyone').deny, P.ViewChannel));
  check('members: все 8 рангов имеют доступ',
    roleGroups(config).members.every((k) => has(forId(list, `role_${k}`)?.allow, P.ViewChannel)));
  check('members: гость не имеет доступа', !forId(list, 'role_guest'));
  check('members: союзник не имеет доступа', !forId(list, 'role_ally'));
  check('members: куратор имеет доступ', has(forId(list, 'role_kurator')?.allow, P.ViewChannel));
}
{
  const list = resolve('members-read');
  check('members-read: состав читает, но не пишет',
    has(forId(list, 'role_r3').allow, P.ViewChannel) && has(forId(list, 'role_r3').deny, P.SendMessages));
  check('members-read: старший состав пишет', has(forId(list, 'role_r6')?.allow, P.SendMessages));
}
{
  const list = resolve('allies');
  check('allies: союзник имеет доступ', has(forId(list, 'role_ally')?.allow, P.ViewChannel));
  check('allies: @everyone не видит', has(forId(list, 'everyone').deny, P.ViewChannel));
}
{
  const list = resolve('staff');
  check('staff: младшие ранги закрыты', !forId(list, 'role_r5') && !forId(list, 'role_r1'));
  check('staff: смотрящий и оружейник открыты',
    has(forId(list, 'role_r7')?.allow, P.ViewChannel) && has(forId(list, 'role_r6')?.allow, P.ViewChannel));
}
{
  const list = resolve('kurator');
  check('kurator: только лидер, зам и куратор',
    has(forId(list, 'role_kurator')?.allow, P.ViewChannel) &&
    has(forId(list, 'role_r8')?.allow, P.ViewChannel) &&
    !forId(list, 'role_r6'));
}
{
  const list = resolve('members', 'voice');
  check('голосовой members: даётся Connect, а не SendMessages',
    has(forId(list, 'role_r4')?.allow, P.Connect) && !has(forId(list, 'role_r4')?.allow, P.SendMessages));
}

// Ни в одном пресете не должно быть двух оверрайдов на одну роль — Discord это не примет.
for (const preset of ['public-read', 'guest', 'guest-read', 'members', 'members-read', 'allies', 'staff', 'kurator']) {
  for (const type of ['text', 'voice']) {
    const list = resolve(preset, type);
    const unique = new Set(list.map((o) => o.id));
    check(`${preset}/${type}: без дублей оверрайдов`, unique.size === list.length);
  }
}

// Каждая категория и каждый канал ссылаются на существующий пресет.
for (const category of config.categories) {
  check(`пресет категории «${category.name}»`, Boolean(resolve(category.preset)));
  for (const channel of category.channels) {
    if (channel.preset) check(`пресет канала «${channel.name}»`, Boolean(resolve(channel.preset, channel.type)));
  }
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? '✅' : '❌'} ${c.name}`);
console.log(`\nПройдено ${checks.length - failed.length} из ${checks.length}`);
process.exit(failed.length ? 1 : 0);
