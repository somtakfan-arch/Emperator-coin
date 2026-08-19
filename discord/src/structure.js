// Разворачивание структуры сервера по config/server.json.
// Скрипт идемпотентный: повторный запуск ничего не ломает и не дублирует —
// недостающее создаётся, существующее приводится к описанному в конфиге виду.

import { ChannelType, EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';
import { DOCS } from './texts.js';

const TEXT_VIEW = [P.ViewChannel, P.ReadMessageHistory];
const TEXT_WRITE = [P.SendMessages, P.AttachFiles, P.EmbedLinks, P.AddReactions, P.UseExternalEmojis, P.SendMessagesInThreads];
const VOICE_VIEW = [P.ViewChannel];
const VOICE_WRITE = [P.Connect, P.Speak, P.Stream, P.UseVAD];

export const normalizeName = (name, type) =>
  type === 'voice' ? name.trim() : name.trim().toLowerCase().replace(/\s+/g, '-');

export const roleGroups = (config) => {
  const has = (key) => config.roles.some((r) => r.key === key);
  const staffKeys = config.roles.filter((r) => r.staff || r.rank === 8).map((r) => r.key);
  return {
    members: config.roles.filter((r) => r.rank).map((r) => r.key),
    staff: [...staffKeys, ...(has('kurator') ? ['kurator'] : [])],
    leaders: config.roles.filter((r) => r.rank >= 7).map((r) => r.key),
    kurator: has('kurator') ? ['kurator'] : [],
    ally: has('ally') ? ['ally'] : [],
  };
};

// Discord не принимает два оверрайда на одну и ту же роль: оставляем последний,
// поэтому уточняющие правила (например «старший состав пишет») идут после общих.
const dedupe = (list) => [...new Map(list.map((o) => [o.id, o])).values()];

// Права по пресетам. Возвращает permissionOverwrites для канала или категории.
export function overwritesFor(preset, { guild, roles, config, type }) {
  const view = type === 'voice' ? VOICE_VIEW : TEXT_VIEW;
  const write = type === 'voice' ? VOICE_WRITE : TEXT_WRITE;
  const everyone = guild.roles.everyone.id;
  const g = roleGroups(config);
  const ids = (keys) => keys.map((k) => roles.get(k)?.id).filter(Boolean);
  const allow = (keys, perms) => ids(keys).map((id) => ({ id, allow: perms }));
  const out = [];

  switch (preset) {
    case 'public-read':
    case 'guest-read':
      out.push({ id: everyone, allow: view, deny: write });
      out.push(...allow(g.staff, [...view, ...write]));
      break;
    case 'guest':
      out.push({ id: everyone, allow: [...view, ...write] });
      break;
    case 'members':
      out.push({ id: everyone, deny: view });
      out.push(...allow([...g.members, ...g.kurator], [...view, ...write]));
      break;
    case 'members-read':
      out.push({ id: everyone, deny: view });
      out.push(...ids(g.members).map((id) => ({ id, allow: view, deny: write })));
      out.push(...allow(g.staff, [...view, ...write]));
      break;
    case 'allies':
      out.push({ id: everyone, deny: view });
      out.push(...allow([...g.members, ...g.ally, ...g.kurator], [...view, ...write]));
      break;
    case 'staff':
      out.push({ id: everyone, deny: view });
      out.push(...allow(g.staff, [...view, ...write]));
      break;
    case 'kurator':
      out.push({ id: everyone, deny: view });
      out.push(...allow([...g.leaders, ...g.kurator], [...view, ...write]));
      break;
    default:
      throw new Error(`Неизвестный пресет прав: ${preset}`);
  }

  // Боту нужен доступ во все каналы, иначе он не сможет туда писать.
  const me = guild.members.me;
  if (me) out.push({ id: me.id, allow: [...view, ...write, P.ManageMessages] });
  return dedupe(out);
}

async function ensureRoles(guild, config, log) {
  const existing = await guild.roles.fetch();
  const roles = new Map();

  for (const spec of config.roles) {
    const found = existing.find((r) => r.name === spec.name && !r.managed);
    const payload = {
      name: spec.name,
      color: spec.color,
      hoist: Boolean(spec.hoist),
      mentionable: Boolean(spec.mentionable),
      permissions: (spec.permissions ?? []).map((p) => P[p]),
    };
    if (found) {
      await found.edit({ ...payload, reason: 'Emperium: синхронизация ролей' });
      roles.set(spec.key, found);
      log(`  роль обновлена: ${spec.name}`);
    } else {
      const created = await guild.roles.create({ ...payload, reason: 'Emperium: развёртывание' });
      roles.set(spec.key, created);
      log(`  роль создана:   ${spec.name}`);
    }
  }

  // Порядок ролей: первая в конфиге — самая высокая.
  try {
    const positions = config.roles
      .map((spec, i) => ({ role: roles.get(spec.key), position: config.roles.length - i }))
      .filter((p) => p.role);
    await guild.roles.setPositions(positions);
    log('  порядок ролей выставлен');
  } catch {
    log('  ⚠️  не удалось выставить порядок ролей — перетащи роль бота выше остальных и запусти ещё раз');
  }
  return roles;
}

async function ensureChannel(guild, spec, { parent, roles, config, index, log }) {
  const type = spec.type ?? 'text';
  const wanted = normalizeName(spec.name, type);
  const discordType = type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText;
  const found = guild.channels.cache.find(
    (c) => c.type === discordType && normalizeName(c.name, type) === wanted,
  );
  const permissionOverwrites = overwritesFor(spec.preset ?? parent.preset, { guild, roles, config, type });
  const payload = {
    name: spec.name,
    parent: parent.channel.id,
    permissionOverwrites,
    ...(type === 'text' ? { topic: spec.topic ?? null, rateLimitPerUser: spec.slowmode ?? 0 } : {}),
  };

  let channel;
  if (found) {
    channel = await found.edit({ ...payload, reason: 'Emperium: синхронизация каналов' });
    log(`    канал обновлён: ${spec.name}`);
  } else {
    channel = await guild.channels.create({ ...payload, type: discordType, reason: 'Emperium: развёртывание' });
    log(`    канал создан:   ${spec.name}`);
  }
  try {
    await channel.setPosition(index);
  } catch {
    /* позиция не критична */
  }
  return channel;
}

async function ensureCategory(guild, spec, { roles, config, index, log }) {
  const found = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === spec.name,
  );
  const permissionOverwrites = overwritesFor(spec.preset, { guild, roles, config, type: 'text' });
  let channel;
  if (found) {
    channel = await found.edit({ permissionOverwrites, reason: 'Emperium: синхронизация категорий' });
    log(`  категория обновлена: ${spec.name}`);
  } else {
    channel = await guild.channels.create({
      name: spec.name,
      type: ChannelType.GuildCategory,
      permissionOverwrites,
      reason: 'Emperium: развёртывание',
    });
    log(`  категория создана:   ${spec.name}`);
  }
  try {
    await channel.setPosition(index);
  } catch {
    /* позиция не критична */
  }
  return channel;
}

// Публикует документ в канал, если бот туда ещё ничего не писал.
async function postDoc(channel, key, log, extraComponents) {
  const blocks = DOCS[key];
  if (!blocks) return;
  const history = await channel.messages.fetch({ limit: 30 }).catch(() => null);
  if (history?.some((m) => m.author.id === channel.client.user.id && m.embeds.length)) {
    log(`    документ уже опубликован: #${channel.name}`);
    return;
  }
  for (const [i, block] of blocks.entries()) {
    const isLast = i === blocks.length - 1;
    await channel.send({
      embeds: [new EmbedBuilder(block)],
      ...(isLast && extraComponents ? { components: extraComponents } : {}),
    });
  }
  log(`    документ опубликован: #${channel.name}`);
}

export async function applyStructure(guild, config, { log = console.log, components = {} } = {}) {
  log(`\n▸ Сервер: ${guild.name}`);
  await guild.channels.fetch();

  log('\n▸ Роли');
  const roles = await ensureRoles(guild, config, log);

  log('\n▸ Категории и каналы');
  const channels = new Map();
  for (const [i, catSpec] of config.categories.entries()) {
    const category = await ensureCategory(guild, catSpec, { roles, config, index: i, log });
    for (const [j, chSpec] of catSpec.channels.entries()) {
      const channel = await ensureChannel(guild, chSpec, {
        parent: { channel: category, preset: catSpec.preset },
        roles,
        config,
        index: j,
        log,
      });
      channels.set(normalizeName(chSpec.name, chSpec.type ?? 'text'), channel);
      if (chSpec.post) await postDoc(channel, chSpec.post, log, components[chSpec.post]);
    }
  }

  // AFK-канал сервера
  const afk = channels.get(normalizeName(config.map.afkVoice, 'voice'));
  if (afk) {
    await guild.edit({ afkChannel: afk, afkTimeout: 300 }).catch(() => log('  ⚠️  не удалось назначить AFK-канал'));
  }

  log('\n✅ Структура развёрнута.');
  return { roles, channels };
}

// Канал из карты config.map по ключу.
export const mapped = (guild, config, key) => {
  const raw = config.map[key];
  if (!raw) return null;
  const type = key.toLowerCase().includes('voice') ? 'voice' : 'text';
  const wanted = normalizeName(raw, type);
  return guild.channels.cache.find((c) => normalizeName(c.name, type) === wanted) ?? null;
};
