// Бот семьи Emperium: приём заявок, сборы, отчёты об активности,
// ранги, дисциплина, состав. Разворачивает структуру командой /setup.

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, EmbedBuilder, Events,
  GatewayIntentBits, MessageFlags, ModalBuilder, Partials, PermissionFlagsBits as P, REST, Routes,
  SlashCommandBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { applyStructure, mapped, roleGroups } from './structure.js';
import { requireEnv } from './env.js';
import { Store, disciplineSummary } from './store.js';
import { ACCEPTED, WELCOME } from './texts.js';

const EPH = { flags: MessageFlags.Ephemeral };
const eph = (value) => (value ? EPH : {});

const PURPLE = 0x6a0dad;
const RED = 0xc0392b;
const GREEN = 0x27ae60;
const DAY = 24 * 60 * 60 * 1000;

const config = JSON.parse(await readFile(new URL('../config/server.json', import.meta.url), 'utf8'));
const store = await new Store(process.env.DATA_FILE ?? './data/store.json').load();

const rankSpecs = config.roles.filter((r) => r.rank).sort((a, b) => b.rank - a.rank);
const rankChoices = rankSpecs.map((r) => ({ name: `${r.rank} — ${r.name}`, value: String(r.rank) }));
const roleByName = (guild, name) => guild.roles.cache.find((r) => r.name === name) ?? null;
const roleByKey = (guild, key) => {
  const spec = config.roles.find((r) => r.key === key);
  return spec ? roleByName(guild, spec.name) : null;
};

const isStaff = (member) => {
  const staffNames = config.roles
    .filter((r) => r.staff || r.rank === 8 || r.key === 'kurator')
    .map((r) => r.name);
  return member.permissions.has(P.ManageGuild) || member.roles.cache.some((r) => staffNames.includes(r.name));
};

const buildNick = (name, staticId) => `${name} | ${staticId}`.slice(0, 32);

const applyButton = () => [
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('emp:apply').setLabel('Подать заявку').setEmoji('📥').setStyle(ButtonStyle.Primary),
  ),
];

const logTo = async (guild, embed) => {
  const channel = mapped(guild, config, 'log');
  if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
};

/* ---------------------------------------------------------------- команды */

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Развернуть или обновить структуру сервера по конфигу')
    .setDefaultMemberPermissions(P.Administrator),
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Опубликовать панель заявки на вступление заново')
    .setDefaultMemberPermissions(P.ManageGuild),
  new SlashCommandBuilder()
    .setName('sbor')
    .setDescription('Объявить сбор с отметками "буду / опоздаю / не смогу"')
    .addStringOption((o) =>
      o.setName('тип').setDescription('Что за движ').setRequired(true).addChoices(
        { name: 'BizWar', value: 'BizWar' },
        { name: 'Налёт / ограбление', value: 'Налёт / ограбление' },
        { name: 'AirDrop', value: 'AirDrop' },
        { name: 'Война за КрАЗ', value: 'Война за КрАЗ' },
        { name: 'Захват территории', value: 'Захват территории' },
        { name: 'Поставки', value: 'Поставки' },
        { name: 'Общий сбор', value: 'Общий сбор' },
      ))
    .addStringOption((o) => o.setName('время').setDescription('Например: сегодня 21:00 МСК').setRequired(true))
    .addStringOption((o) => o.setName('заметка').setDescription('Форма, место, детали')),
  new SlashCommandBuilder()
    .setName('aktiv')
    .setDescription('Отчёт об активности семьи (правило 1.3 — без актива 3 дня семья неактивна)')
    .addStringOption((o) => o.setName('что').setDescription('Какая активность').setRequired(true))
    .addStringOption((o) => o.setName('детали').setDescription('Кто участвовал, результат')),
  new SlashCommandBuilder().setName('sostav').setDescription('Обновить список состава по рангам'),
  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Выдать ранг участнику')
    .setDefaultMemberPermissions(P.ManageRoles)
    .addUserOption((o) => o.setName('кто').setDescription('Участник').setRequired(true))
    .addStringOption((o) => o.setName('ранг').setDescription('Новый ранг').setRequired(true).addChoices(...rankChoices)),
  new SlashCommandBuilder()
    .setName('nick')
    .setDescription('Задать ник в формате Имя Фамилия | статик')
    .setDefaultMemberPermissions(P.ManageNicknames)
    .addUserOption((o) => o.setName('кто').setDescription('Участник').setRequired(true))
    .addStringOption((o) => o.setName('имя').setDescription('Имя Фамилия').setRequired(true))
    .addStringOption((o) => o.setName('статик').setDescription('Статический ID, например 474-792').setRequired(true)),
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Выдать предупреждение или выговор')
    .setDefaultMemberPermissions(P.ModerateMembers)
    .addUserOption((o) => o.setName('кто').setDescription('Участник').setRequired(true))
    .addStringOption((o) => o.setName('причина').setDescription('За что').setRequired(true))
    .addStringOption((o) => o.setName('тип').setDescription('Предупреждение или выговор').addChoices(
      { name: 'Предупреждение', value: 'warn' },
      { name: 'Выговор', value: 'strike' },
    )),
  new SlashCommandBuilder()
    .setName('unwarn')
    .setDescription('Снять предупреждение или выговор по номеру')
    .setDefaultMemberPermissions(P.ModerateMembers)
    .addUserOption((o) => o.setName('кто').setDescription('Участник').setRequired(true))
    .addStringOption((o) => o.setName('номер').setDescription('Номер из /dossier').setRequired(true)),
  new SlashCommandBuilder()
    .setName('dossier')
    .setDescription('Досье участника: ранг, стаж, предупреждения')
    .addUserOption((o) => o.setName('кто').setDescription('Участник').setRequired(true)),
  new SlashCommandBuilder()
    .setName('ally')
    .setDescription('Выдать или снять роль союзника')
    .setDefaultMemberPermissions(P.ManageRoles)
    .addUserOption((o) => o.setName('кто').setDescription('Пользователь').setRequired(true)),
  new SlashCommandBuilder().setName('info').setDescription('Информация о семье: цвет, прикрытие, ранги'),
].map((c) => c.toJSON());

async function registerCommands(clientId, guildId, token) {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log(`Команды зарегистрированы: ${commands.length}`);
}

/* ------------------------------------------------------------- обработчики */

async function handleSetup(interaction) {
  await interaction.deferReply({ ...EPH });
  const lines = [];
  await applyStructure(interaction.guild, config, {
    log: (msg) => { lines.push(msg); console.log(msg); },
    components: { recruit: applyButton() },
  });
  const tail = lines.join('\n').slice(-1800);
  await interaction.editReply(`Готово.\n\`\`\`\n${tail}\n\`\`\``);
}

async function handleApplyButton(interaction) {
  const modal = new ModalBuilder().setCustomId('emp:applyModal').setTitle('Заявка в Emperium');
  const fields = [
    ['name', 'Имя Фамилия персонажа', 'Иван Емперов', TextInputStyle.Short, true],
    ['static', 'Статический ID', '474-792', TextInputStyle.Short, true],
    ['age', 'Возраст (реальный) и город', '18, Москва', TextInputStyle.Short, true],
    ['online', 'Онлайн: часов в день и время суток', '4-5 часов, вечером МСК', TextInputStyle.Short, true],
    ['about', 'Опыт, бывшие семьи/фракции, зачем к нам', '', TextInputStyle.Paragraph, true],
  ];
  modal.addComponents(
    ...fields.map(([id, label, placeholder, style, required]) =>
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(id).setLabel(label).setStyle(style).setRequired(required)
          .setPlaceholder(placeholder).setMaxLength(style === TextInputStyle.Paragraph ? 900 : 60),
      )),
  );
  await interaction.showModal(modal);
}

async function handleApplyModal(interaction) {
  const get = (id) => interaction.fields.getTextInputValue(id).trim();
  const application = {
    userId: interaction.user.id,
    name: get('name'),
    static: get('static'),
    age: get('age'),
    online: get('online'),
    about: get('about'),
    at: Date.now(),
  };
  const target = mapped(interaction.guild, config, 'applications');
  if (!target) {
    await interaction.reply({ content: 'Канал заявок не найден. Руководству нужно выполнить /setup.', ...EPH });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('📥 Заявка на вступление')
    .setColor(PURPLE)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: 'Discord', value: `<@${application.userId}> (\`${interaction.user.tag}\`)` },
      { name: 'Персонаж', value: `${application.name} | ${application.static}`, inline: true },
      { name: 'Возраст / город', value: application.age, inline: true },
      { name: 'Онлайн', value: application.online },
      { name: 'О себе', value: application.about.slice(0, 1000) },
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`emp:accept:${application.userId}`).setLabel('Принять').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`emp:reject:${application.userId}`).setLabel('Отказать').setStyle(ButtonStyle.Danger),
  );

  const message = await target.send({ embeds: [embed], components: [row] });
  store.data.applications[message.id] = application;
  store.queueSave();
  await interaction.reply({
    content: 'Заявка отправлена. Руководство ответит здесь же или в личные сообщения. Не спамь напоминаниями.',
    ...EPH,
  });
}

async function handleDecision(interaction, decision, userId) {
  if (!isStaff(interaction.member)) {
    await interaction.reply({ content: 'Решение по заявкам принимает руководство.', ...EPH });
    return;
  }
  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  const application = store.data.applications[interaction.message.id];

  if (decision === 'accept') {
    if (!member) {
      await interaction.reply({ content: 'Этот пользователь уже покинул сервер.', ...EPH });
      return;
    }
    const rank1 = roleByKey(interaction.guild, 'r1');
    const guest = roleByKey(interaction.guild, 'guest');
    if (rank1) await member.roles.add(rank1).catch(() => {});
    if (guest) await member.roles.remove(guest).catch(() => {});
    if (application) {
      await member.setNickname(buildNick(application.name, application.static)).catch(() => {});
      Object.assign(store.member(userId), {
        name: application.name, static: application.static, rank: 1, joinedAt: Date.now(),
      });
      store.queueSave();
    }
    const general = mapped(interaction.guild, config, 'general');
    if (general) await general.send(ACCEPTED(`<@${userId}>`, rank1?.name ?? 'Пустой')).catch(() => {});
    await member.send(`Тебя приняли в **${config.family.name}**. Читай правила и заходи в голосовой.`).catch(() => {});
  } else {
    await member?.send(`Заявка в **${config.family.name}** отклонена. Повторно можно подать через 7 дней.`).catch(() => {});
  }

  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(decision === 'accept' ? GREEN : RED)
    .addFields({
      name: decision === 'accept' ? '✅ Принят' : '⛔ Отказано',
      value: `${interaction.user} · <t:${Math.floor(Date.now() / 1000)}:f>`,
    });
  await interaction.update({ embeds: [embed], components: [] });
  await logTo(interaction.guild, new EmbedBuilder()
    .setColor(decision === 'accept' ? GREEN : RED)
    .setDescription(`${interaction.user} ${decision === 'accept' ? 'принял' : 'отклонил'} заявку <@${userId}>`));
}

const MUSTER_KINDS = { yes: '✅ Буду', late: '🕔 Опоздаю', no: '⛔ Не смогу' };

function musterEmbed(data) {
  const list = (ids) => (ids.length ? ids.map((id) => `<@${id}>`).join('\n') : '—');
  return new EmbedBuilder()
    .setTitle(`⚔️ Сбор: ${data.type}`)
    .setColor(PURPLE)
    .setDescription(`**Время:** ${data.time}\n${data.note ? `**Детали:** ${data.note}\n` : ''}**Форма и цвет обязательны.**`)
    .addFields(
      { name: `${MUSTER_KINDS.yes} (${data.yes.length})`, value: list(data.yes), inline: true },
      { name: `${MUSTER_KINDS.late} (${data.late.length})`, value: list(data.late), inline: true },
      { name: `${MUSTER_KINDS.no} (${data.no.length})`, value: list(data.no), inline: true },
    )
    .setFooter({ text: `Объявил: ${data.authorTag}` })
    .setTimestamp();
}

async function handleMuster(interaction) {
  const data = {
    type: interaction.options.getString('тип'),
    time: interaction.options.getString('время'),
    note: interaction.options.getString('заметка') ?? '',
    authorTag: interaction.user.tag,
    yes: [], late: [], no: [],
  };
  const row = new ActionRowBuilder().addComponents(
    ...Object.entries(MUSTER_KINDS).map(([key, label]) =>
      new ButtonBuilder().setCustomId(`emp:muster:${key}`).setLabel(label)
        .setStyle(key === 'yes' ? ButtonStyle.Success : key === 'late' ? ButtonStyle.Secondary : ButtonStyle.Danger)),
  );

  const channel = mapped(interaction.guild, config, 'muster') ?? interaction.channel;
  const ranks = config.roles.filter((r) => r.rank && r.rank <= 7).map((r) => roleByName(interaction.guild, r.name)).filter(Boolean);
  const message = await channel.send({
    content: ranks.map((r) => `<@&${r.id}>`).join(' '),
    embeds: [musterEmbed(data)],
    components: [row],
  });
  store.setMuster(message.id, data);
  await interaction.reply({ content: `Сбор объявлен в ${channel}.`, ...EPH });
}

async function handleMusterButton(interaction, kind) {
  const data = store.muster(interaction.message.id);
  if (!data) {
    await interaction.reply({ content: 'Этот сбор уже не отслеживается.', ...EPH });
    return;
  }
  for (const key of Object.keys(MUSTER_KINDS)) {
    data[key] = data[key].filter((id) => id !== interaction.user.id);
  }
  data[kind].push(interaction.user.id);
  store.setMuster(interaction.message.id, data);
  await interaction.update({ embeds: [musterEmbed(data)] });
}

async function handleActivity(interaction) {
  const what = interaction.options.getString('что');
  const details = interaction.options.getString('детали') ?? '';
  const entry = { at: Date.now(), by: interaction.user.id, what, details };
  store.logActivity(entry);

  const channel = mapped(interaction.guild, config, 'activity') ?? interaction.channel;
  await channel.send({
    embeds: [new EmbedBuilder()
      .setTitle('📈 Отчёт об активности')
      .setColor(GREEN)
      .setDescription(`**${what}**\n${details}`)
      .setFooter({ text: `Отчёт: ${interaction.user.tag}` })
      .setTimestamp()],
  });
  await interaction.reply({ content: 'Отчёт записан. Таймер неактива сброшен.', ...EPH });
}

async function handleRoster(interaction) {
  await interaction.deferReply({ ...EPH });
  const members = await interaction.guild.members.fetch();
  const lines = [];
  let total = 0;

  for (const spec of rankSpecs) {
    const role = roleByName(interaction.guild, spec.name);
    if (!role) continue;
    const list = members.filter((m) => m.roles.cache.has(role.id));
    total += list.size;
    lines.push(`**${spec.rank} · ${spec.name}** — ${list.size}`);
    lines.push(list.size ? [...list.values()].map((m) => `• ${m.displayName}`).join('\n') : '_пусто_');
    lines.push('');
  }

  const embed = new EmbedBuilder()
    .setTitle(`👥 Состав ${config.family.name}`)
    .setColor(PURPLE)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setFooter({ text: `Всего в составе: ${total}` })
    .setTimestamp();

  const channel = mapped(interaction.guild, config, 'roster');
  if (channel) {
    const history = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    const own = history?.find((m) => m.author.id === interaction.client.user.id);
    if (own) await own.edit({ embeds: [embed] });
    else await channel.send({ embeds: [embed] });
  }
  await interaction.editReply(channel ? `Состав обновлён в ${channel}.` : 'Канал состава не найден, вот выгрузка:');
  if (!channel) await interaction.followUp({ embeds: [embed], ...EPH });
}

async function handleRank(interaction) {
  const target = await interaction.guild.members.fetch(interaction.options.getUser('кто').id);
  const rank = Number(interaction.options.getString('ранг'));
  const spec = rankSpecs.find((r) => r.rank === rank);
  const role = roleByName(interaction.guild, spec.name);
  if (!role) {
    await interaction.reply({ content: 'Роль ранга не найдена — сначала /setup.', ...EPH });
    return;
  }

  const rankRoleIds = rankSpecs.map((r) => roleByName(interaction.guild, r.name)?.id).filter(Boolean);
  await target.roles.remove(rankRoleIds.filter((id) => id !== role.id)).catch(() => {});
  await target.roles.add(role).catch(() => {});
  const guest = roleByKey(interaction.guild, 'guest');
  if (guest) await target.roles.remove(guest).catch(() => {});

  const prev = store.member(target.id).rank;
  store.member(target.id).rank = rank;
  store.queueSave();

  await interaction.reply(`${target} → **${spec.name}** (ранг ${rank}${prev ? `, было ${prev}` : ''}).`);
  await logTo(interaction.guild, new EmbedBuilder().setColor(PURPLE)
    .setDescription(`${interaction.user} выдал ${target} ранг **${spec.name}**`));
}

async function handleNick(interaction) {
  const target = await interaction.guild.members.fetch(interaction.options.getUser('кто').id);
  const name = interaction.options.getString('имя').trim();
  const staticId = interaction.options.getString('статик').trim();
  const nick = buildNick(name, staticId);
  const ok = await target.setNickname(nick).then(() => true).catch(() => false);
  Object.assign(store.member(target.id), { name, static: staticId });
  store.queueSave();
  await interaction.reply({
    content: ok ? `Ник: \`${nick}\`` : 'Не хватило прав на смену ника (роль бота должна быть выше).',
    ...eph(!ok),
  });
}

async function handleWarn(interaction) {
  const target = interaction.options.getUser('кто');
  const reason = interaction.options.getString('причина');
  const level = interaction.options.getString('тип') ?? 'warn';
  const entry = {
    id: Date.now().toString(36),
    level, reason, by: interaction.user.id, at: Date.now(),
  };
  const list = store.addWarn(target.id, entry);
  const { warnings, totalStrikes } = disciplineSummary(list);

  const embed = new EmbedBuilder()
    .setTitle(level === 'strike' ? '⚠️ Выговор' : '⚠️ Предупреждение')
    .setColor(RED)
    .setDescription(`${target} — ${reason}`)
    .addFields(
      { name: 'Выдал', value: `${interaction.user}`, inline: true },
      { name: 'Номер', value: `\`${entry.id}\``, inline: true },
      { name: 'Итого', value: `предупреждений: ${warnings}, выговоров: ${totalStrikes}` },
    )
    .setTimestamp();

  const channel = mapped(interaction.guild, config, 'warns');
  if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
  await target.send(`Тебе выдали ${level === 'strike' ? 'выговор' : 'предупреждение'} в **${config.family.name}**: ${reason}`).catch(() => {});
  await interaction.reply({ embeds: [embed], ...eph(Boolean(channel)) });

  if (totalStrikes >= 3) {
    const staffRole = roleByKey(interaction.guild, 'r7');
    await channel?.send(`${staffRole ?? ''} у ${target} три выговора — нужен разбор с лидером.`).catch(() => {});
  }
}

async function handleUnwarn(interaction) {
  const target = interaction.options.getUser('кто');
  const id = interaction.options.getString('номер').trim();
  const removed = store.removeWarn(target.id, id);
  await interaction.reply({
    content: removed ? `Снято: \`${id}\` (${removed.reason}).` : `У ${target} нет записи \`${id}\`.`,
    ...eph(!removed),
  });
}

async function handleDossier(interaction) {
  const user = interaction.options.getUser('кто');
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  const data = store.data.members[user.id] ?? {};
  const list = store.warns(user.id);
  const { warnings, totalStrikes } = disciplineSummary(list);
  const rankRole = member?.roles.cache.find((r) => rankSpecs.some((s) => s.name === r.name));

  const embed = new EmbedBuilder()
    .setTitle(`📄 Досье: ${member?.displayName ?? user.tag}`)
    .setColor(PURPLE)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: 'Персонаж', value: data.name ? `${data.name} | ${data.static}` : '—', inline: true },
      { name: 'Ранг', value: rankRole?.name ?? '—', inline: true },
      { name: 'В семье с', value: data.joinedAt ? `<t:${Math.floor(data.joinedAt / 1000)}:D>` : '—', inline: true },
      { name: 'Дисциплина', value: `предупреждений: ${warnings}, выговоров: ${totalStrikes}` },
      {
        name: 'Записи',
        value: list.length
          ? list.map((w) => `\`${w.id}\` ${w.level === 'strike' ? 'выговор' : 'пред.'} — ${w.reason} (<@${w.by}>)`).join('\n').slice(0, 1000)
          : 'чисто',
      },
    );
  await interaction.reply({ embeds: [embed], ...EPH });
}

async function handleAlly(interaction) {
  const target = await interaction.guild.members.fetch(interaction.options.getUser('кто').id);
  const role = roleByKey(interaction.guild, 'ally');
  if (!role) {
    await interaction.reply({ content: 'Роль союзника не найдена — сначала /setup.', ...EPH });
    return;
  }
  const had = target.roles.cache.has(role.id);
  await (had ? target.roles.remove(role) : target.roles.add(role));
  await interaction.reply({ content: `${target}: роль союзника ${had ? 'снята' : 'выдана'}.`, ...EPH });
}

async function handleInfo(interaction) {
  const { family } = config;
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setTitle(`⚜️ ${family.name}`)
      .setColor(PURPLE)
      .addFields(
        { name: 'Проект', value: family.project, inline: true },
        { name: 'Тип', value: family.type, inline: true },
        { name: 'Цвет', value: `\`${family.color}\` · RGB ${family.colorRgb}`, inline: true },
        { name: 'Прикрытие', value: family.cover },
        { name: 'Ранги', value: rankSpecs.map((r) => `${r.rank} — ${r.name}`).join('\n') },
      )],
    ...EPH,
  });
}

/* ------------------------------------------------------------------ клиент */

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember],
});

const handlers = {
  setup: handleSetup,
  panel: async (interaction) => {
    const channel = mapped(interaction.guild, config, 'recruit') ?? interaction.channel;
    await channel.send({ components: applyButton() });
    await interaction.reply({ content: `Панель опубликована в ${channel}.`, ...EPH });
  },
  sbor: handleMuster,
  aktiv: handleActivity,
  sostav: handleRoster,
  rank: handleRank,
  nick: handleNick,
  warn: handleWarn,
  unwarn: handleUnwarn,
  dossier: handleDossier,
  ally: handleAlly,
  info: handleInfo,
};

client.once(Events.ClientReady, async (c) => {
  console.log(`Бот запущен: ${c.user.tag}`);
  await registerCommands(c.user.id, process.env.DISCORD_GUILD_ID, process.env.DISCORD_TOKEN).catch(console.error);
  startActivityWatcher(c);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await handlers[interaction.commandName]?.(interaction);
      return;
    }
    if (interaction.isButton()) {
      const [, action, arg] = interaction.customId.split(':');
      if (action === 'apply') await handleApplyButton(interaction);
      else if (action === 'accept' || action === 'reject') await handleDecision(interaction, action, arg);
      else if (action === 'muster') await handleMusterButton(interaction, arg);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === 'emp:applyModal') {
      await handleApplyModal(interaction);
    }
  } catch (err) {
    console.error('Ошибка обработки взаимодействия:', err);
    const payload = { content: 'Что-то пошло не так. Руководству стоит заглянуть в логи бота.', ...EPH };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  const guest = roleByKey(member.guild, 'guest');
  if (guest) await member.roles.add(guest).catch(() => {});
  const channel = mapped(member.guild, config, 'welcome');
  if (channel) await channel.send(WELCOME(`${member}`, config.family.name)).catch(() => {});
});

// Правило 1.3: без крим-активности 3 дня семья считается неактивной.
function startActivityWatcher(c) {
  const check = async () => {
    const last = store.data.activity.last?.at;
    if (!last || Date.now() - last < 2 * DAY) return;
    const guild = c.guilds.cache.get(process.env.DISCORD_GUILD_ID);
    const channel = guild && mapped(guild, config, 'activity');
    if (!channel) return;
    const staff = roleByKey(guild, 'r7');
    const days = Math.floor((Date.now() - last) / DAY);
    await channel.send(
      `${staff ?? ''} последний отчёт об активности был ${days} дн. назад. ` +
      'На третий день семья уходит в неактив (п. 1.3) — нужен движ и отчёт через `/aktiv`.',
    ).catch(() => {});
  };
  setInterval(check, 6 * 60 * 60 * 1000);
}

const env = requireEnv(['DISCORD_TOKEN', 'DISCORD_GUILD_ID']);
await client.login(env.DISCORD_TOKEN);
