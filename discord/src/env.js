// Проверка переменных окружения до подключения к Discord:
// понятная ошибка лучше, чем стек вызовов из недр HTTP-клиента.

const TOKEN_SHAPE = /^[\w-]{20,}\.[\w-]{5,}\.[\w-]{20,}$/;

export function requireEnv(keys) {
  const missing = keys.filter((key) => !process.env[key]?.trim());
  if (missing.length) {
    console.error(`Не заданы переменные: ${missing.join(', ')}.`);
    console.error('Заполни их в файле .env рядом с ботом (или в настройках хостинг-панели).');
    process.exit(1);
  }
  const token = process.env.DISCORD_TOKEN?.trim();
  if (token && !TOKEN_SHAPE.test(token)) {
    console.error('DISCORD_TOKEN не похож на токен бота — похоже, в .env осталась заглушка.');
    console.error('Возьми настоящий токен: Developer Portal → Бот → Reset Token, и вставь его без кавычек и пробелов.');
    process.exit(1);
  }
  return Object.fromEntries(keys.map((key) => [key, process.env[key].trim()]));
}
