# BedBots — контекст для Claude Code

Это плагин для Minecraft-сервера **BedSMP** (Paper **1.21.11**, Java **21**).
Боты-NPC (через Citizens) ходят по миру и общаются в чате на русском через Groq AI.

## Задача
Собрать проект Maven и при необходимости починить ошибки компиляции под реальные API
(Paper 1.21.11 + Citizens). **Поведение не менять** — только сделать так, чтобы собиралось.

## Сборка
```
mvn clean package
```
Результат: `target/BedBots.jar`

## Важные детали API (не сломать при правках)
- Чат-событие: `io.papermc.paper.event.player.AsyncChatEvent`, текст через
  `PlainTextComponentSerializer.plainText().serialize(event.message())`.
- Онлайн в списке серверов: `com.destroystokyo.paper.event.server.PaperServerListPingEvent`.
- Citizens: `CitizensAPI.getNPCRegistry().createNPC(EntityType.PLAYER, name)`,
  трейты `SkinTrait` (setSkinName), `LookClose` (lookClose(true)),
  навигация `npc.getNavigator().setTarget(loc)`.
- Анти-дубли: NPC помечаются `npc.data().setPersistent("bedbot-managed", true)` и
  чистятся при старте/`/bedbots reload`.
- Groq: POST `https://api.groq.com/openai/v1/chat/completions`, заголовок
  `Authorization: Bearer <ключ>`, модель `llama-3.1-8b-instant`, формат OpenAI.
- Gson берётся из Paper (scope provided), отдельно не пакуем. Если в рантайме
  `NoClassDefFoundError: com.google.gson` — добавить maven-shade и relocate gson.

## После сборки (делает владелец, не Claude Code)
1. Залить `BedBots.jar` в `plugins/` на сервере.
2. Рядом положить плагин **Citizens** (dev-сборка под 1.21.11).
3. В `plugins/BedBots/config.yml` вписать ключ с console.groq.com.
4. `/bedbots reload`.
