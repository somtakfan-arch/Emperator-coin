# human-web

Плагин для Claude Code, который убирает признаки AI-генерации из вёрстки сайтов.

## Что внутри

| Часть | Файл | Что делает |
|---|---|---|
| Правила | `config/rules.json` | 48 правил в 6 категориях: ID, уровень, объяснение, как исправить, регулярки для хука |
| Скилл | `skills/human-web/SKILL.md` | Включается при любой вёрстке и задаёт Claude правила до написания кода |
| Хук | `hooks/hooks.json` → `scripts/check.mjs` | После каждого Write/Edit HTML/CSS/JSX/Vue/Svelte/Astro проверяет файл. BLOCK возвращает Claude ошибку (exit 2), WARN добавляет замечание в контекст |
| Команды | `commands/audit.md`, `commands/fix.md` | `/human-web:audit [путь]` отчёт без правок, `/human-web:fix [путь]` исправление |
| Шоукейс | `showcase/index.html` | Образец каждого паттерна, переключатели уровней и генератор файла настроек |

## Установка

```
/plugin marketplace add somtakfan-arch/emperator-coin
/plugin install human-web@emperator-plugins
```

Локально из клона: `/plugin marketplace add ./` в корне репозитория.

## Настройка под проект

Файл `.claude/human-web.json` в корне проекта (его можно собрать в шоукейсе):

```json
{
  "overrides": { "T01": "off", "V03": "block" },
  "ignore": ["vendor/", "dist/"]
}
```

Отключить правило в одном файле: комментарий `human-web-ignore T01 V03` где угодно в файле.

## Изменить правила по умолчанию

1. Правишь `config/rules.json`: `sev` (`block` / `warn` / `off`), `detect` (регулярки, флаги `giu`), `max` (сколько совпадений допустимо).
2. Пересобираешь шоукейс: `node scripts/build-showcase.mjs`.
3. Проверяешь на любом сайте: `node scripts/check.mjs ../../index.html`.

Правила без `detect` (L04, K05) хук не ловит: они работают через скилл и `/human-web:audit`.
