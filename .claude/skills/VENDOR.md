# Вендоренные скиллы

Скиллы `webapp-testing/` и `frontend-design/` скопированы **без изменений**
из официального репозитория Anthropic:

- Источник: https://github.com/anthropics/skills
- Коммит: `0a64e398ec6bb34a494f0c347e8ccae53a862f8e`
- Дата копирования: 2026-08-20
- Лицензия: Apache License 2.0 (текст сохранён в `LICENSE.txt` внутри каждой папки)

Остальные скиллы в `.claude/skills/` — свои, написаны под этот репозиторий.

## Как обновить

```
git clone --depth 1 https://github.com/anthropics/skills /tmp/anthropic-skills
cp -r /tmp/anthropic-skills/skills/webapp-testing  .claude/skills/webapp-testing
cp -r /tmp/anthropic-skills/skills/frontend-design .claude/skills/frontend-design
```

Правки вносить не в них, а рядом — иначе следующее обновление их затрёт.
Проектные особенности запуска описаны в CLAUDE.md.
