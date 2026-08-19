// Одноразовое развёртывание сервера: заходит ботом, создаёт роли,
// категории, каналы, публикует документы и выходит.
// Запуск: npm run setup      (проверка без подключения: npm run setup:dry)

import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, Client, Events, GatewayIntentBits } from 'discord.js';
import { applyStructure } from './structure.js';

const config = JSON.parse(await readFile(new URL('../config/server.json', import.meta.url), 'utf8'));
const dryRun = process.argv.includes('--dry-run');

function printPlan() {
  console.log(`\nПлан развёртывания — семья ${config.family.name} (${config.family.project})`);
  console.log(`Цвет: ${config.family.color} · Прикрытие: ${config.family.cover}\n`);
  console.log(`Роли (${config.roles.length}), сверху вниз по иерархии:`);
  for (const role of config.roles) {
    const extra = role.rank ? `ранг ${role.rank}` : role.permissions?.includes('Administrator') ? 'администратор' : '';
    console.log(`  ${role.name}${extra ? `  — ${extra}` : ''}`);
  }
  let channels = 0;
  console.log('\nКатегории и каналы:');
  for (const category of config.categories) {
    console.log(`  ${category.name}   [доступ: ${category.preset}]`);
    for (const channel of category.channels) {
      channels += 1;
      const type = channel.type === 'voice' ? '🔊' : '#';
      const preset = channel.preset && channel.preset !== category.preset ? `  [${channel.preset}]` : '';
      const post = channel.post ? '  (+ документ)' : '';
      console.log(`     ${type} ${channel.name}${preset}${post}`);
    }
  }
  console.log(`\nИтого: ${config.roles.length} ролей, ${config.categories.length} категорий, ${channels} каналов.`);
  console.log('Проверка плана завершена, к Discord не подключались.\n');
}

if (dryRun) {
  printPlan();
  process.exit(0);
}

const { DISCORD_TOKEN, DISCORD_GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !DISCORD_GUILD_ID) {
  console.error('Нужны DISCORD_TOKEN и DISCORD_GUILD_ID. Скопируй .env.example в .env и заполни.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (c) => {
  console.log(`Подключились как ${c.user.tag}`);
  try {
    const guild = await c.guilds.fetch(DISCORD_GUILD_ID);
    const applyPanel = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('emp:apply').setLabel('Подать заявку').setEmoji('📥').setStyle(ButtonStyle.Primary),
      ),
    ];
    await applyStructure(guild, config, { components: { recruit: applyPanel } });
    console.log('\nДальше: запусти бота (npm start), чтобы заработали кнопки и команды.');
  } catch (err) {
    console.error('\n❌ Развернуть не удалось:', err.message);
    console.error('Проверь: роль бота выше остальных ролей, у бота есть право «Управлять сервером».');
    process.exitCode = 1;
  } finally {
    await client.destroy();
  }
});

await client.login(DISCORD_TOKEN);
