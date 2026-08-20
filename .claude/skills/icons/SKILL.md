---
name: icons
description: Перегенерировать иконки PWA для Remindly (icons/) или StickAnim (stickman/icons/) через scripts/gen_icons.py и scripts/gen_stickman_icons.py. Использовать при запросах поменять иконку, логотип, favicon, apple-touch-icon, maskable-иконку, цвета или форму фирменного знака приложения.
---

# Генерация иконок

Иконки в репозитории — **производные артефакты**. Их не рисуют в редакторе и
не подменяют вручную: и Remindly, и StickAnim рисуют свой знак кодом на
Pillow, без единого внешнего ассета. Единственный источник правды — скрипты.

| Приложение | Скрипт | Куда пишет |
|---|---|---|
| Remindly (градиентный колокольчик) | `scripts/gen_icons.py` | `icons/` |
| StickAnim (бегущий стикмен) | `scripts/gen_stickman_icons.py` | `stickman/icons/` |

Оба генерируют один и тот же набор: `icon-192.png`, `icon-512.png`,
`icon-512-maskable.png`, `apple-touch-icon.png`, `favicon.png`.

## Процедура

1. Pillow в окружении по умолчанию нет — поставь:

   ```
   pip install Pillow
   ```

2. Правь **скрипт**, а не PNG. Полезные точки входа: `gradient_bg()` —
   цвета фона, `draw_bell()` / `draw_stickman()` — сам знак,
   `rounded_mask()` — скругление.

3. Запусти из корня репозитория:

   ```
   python3 scripts/gen_icons.py
   python3 scripts/gen_stickman_icons.py
   ```

4. Проверь глазами все размеры, особенно `icon-512-maskable.png`: у
   maskable-иконки Android обрезает края до круга, значимая часть знака
   должна помещаться в safe zone — центральные ~80% холста.

5. Если менял цвет фона знака, синхронизируй `theme_color` и
   `background_color` в соответствующем `manifest.json`
   (`manifest.json` и `stickman/manifest.json`), а также
   `<meta name="theme-color">` в HTML — иначе сплэш-скрин установленной PWA
   не совпадёт с иконкой.

6. **Бампни `CACHE_VERSION`** — иконки лежат в `PRECACHE_URLS` обоих service
   worker'ов. См. скилл `bump-sw`.

7. Проверь:

   ```
   python3 .claude/skills/check/check.py
   ```

## Чего не делать

- Не коммить PNG, полученный не из скрипта: следующий запуск генератора его
  перезатрёт, и правка потеряется.
- Не добавляй в скрипты загрузку шрифтов или картинок из сети — оба
  генератора намеренно самодостаточны и работают офлайн.
- Не меняй имена выходных файлов: они зашиты в манифесты, в HTML и в
  `PRECACHE_URLS` в трёх местах каждое.
