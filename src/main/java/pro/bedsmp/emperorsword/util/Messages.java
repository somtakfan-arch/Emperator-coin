package pro.bedsmp.emperorsword.util;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.minimessage.MiniMessage;

/**
 * Все текстовые сообщения плагина в одном месте.
 * Использует MiniMessage для поддержки цветов, градиентов и форматирования.
 */
public final class Messages {

    private static final MiniMessage MM = MiniMessage.miniMessage();

    // Префикс всех сообщений плагина
    public static final String PREFIX = "<dark_gray>[<gradient:#ffd700:#ff8c00>⚔ EmperorSword</gradient><dark_gray>]</dark_gray> ";

    private Messages() {}

    /** Парсит MiniMessage-строку в Component */
    public static Component parse(String miniMessage) {
        return MM.deserialize(miniMessage);
    }

    /** Парсит строку с префиксом плагина */
    public static Component prefixed(String miniMessage) {
        return MM.deserialize(PREFIX + miniMessage);
    }

    // ——————————————————————————————————————————
    // Сообщения выдачи меча
    // ——————————————————————————————————————————
    public static final String SWORD_GIVEN =
            PREFIX + "<green>Меч Императора выдан игроку <white>{player}</white>!</green>";

    public static final String SWORD_RECEIVED =
            PREFIX + "<gold>Ты получил <white>Меч Императора</white>! Используй <yellow>/es info</yellow> для просмотра прогресса.</gold>";

    public static final String ALREADY_HAS_SWORD =
            PREFIX + "<red>У игрока <white>{player}</white> уже есть Меч Императора!</red>";

    public static final String INVENTORY_FULL =
            PREFIX + "<red>Инвентарь игрока <white>{player}</white> заполнен!</red>";

    // ——————————————————————————————————————————
    // Апгрейд уровня
    // ——————————————————————————————————————————
    public static final String LEVEL_UP =
            PREFIX + "<gradient:#ffd700:#ff8c00>⬆ Меч улучшен до уровня <white>{level}</white>: <reset>{name}</reset><gradient:#ffd700:#ff8c00>!</gradient>";

    public static final String LEVEL_UP_TITLE =
            "<gradient:#ffd700:#ff0000>⚔ АПГРЕЙД ⚔</gradient>";

    public static final String LEVEL_UP_SUBTITLE =
            "<yellow>Уровень {level}: {name}";

    // ——————————————————————————————————————————
    // Команда /es info
    // ——————————————————————————————————————————
    public static final String INFO_HEADER =
            "<dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</dark_gray>";

    public static final String INFO_TITLE =
            "<gradient:#ffd700:#ff8c00>      ⚔ Меч Императора ⚔</gradient>";

    public static final String INFO_LEVEL =
            "<gray>  Уровень: <white>{level}</white>  <dark_gray>|</dark_gray>  <gray>Имя: {name}";

    public static final String INFO_PROGRESS_HEADER =
            "<gray>  Прогресс к следующему уровню:</gray>";

    public static final String INFO_PROGRESS_LINE =
            "<gray>    <yellow>{type}</yellow>: <white>{current}</white><gray>/<white>{required}</white>";

    public static final String INFO_MAX_LEVEL =
            "<gray>  <gradient:#ffd700:#ff0000>✦ Максимальный уровень достигнут! ✦</gradient>";

    public static final String INFO_NO_SWORD =
            PREFIX + "<red>У тебя нет Меча Императора. Попроси администратора: <yellow>/es give <ник></yellow></red>";

    // ——————————————————————————————————————————
    // Административные сообщения
    // ——————————————————————————————————————————
    public static final String LEVEL_SET =
            PREFIX + "<green>Уровень игрока <white>{player}</white> установлен на <white>{level}</white>.</green>";

    public static final String PLAYER_NOT_FOUND =
            PREFIX + "<red>Игрок <white>{player}</white> не найден или не в сети.</red>";

    public static final String PLAYER_HAS_NO_SWORD =
            PREFIX + "<red>У игрока <white>{player}</white> нет Меча Императора.</red>";

    public static final String INVALID_LEVEL =
            PREFIX + "<red>Уровень должен быть от <white>1</white> до <white>{max}</white>.</red>";

    public static final String CONFIG_RELOADED =
            PREFIX + "<green>Конфигурация перезагружена.</green>";

    public static final String NO_PERMISSION =
            PREFIX + "<red>Недостаточно прав.</red>";

    public static final String USAGE_GIVE =
            PREFIX + "<red>Использование: <yellow>/es give <игрок></yellow></red>";

    public static final String USAGE_SETLEVEL =
            PREFIX + "<red>Использование: <yellow>/es setlevel <игрок> <уровень></yellow></red>";

    public static final String UNKNOWN_SUBCOMMAND =
            PREFIX + "<red>Неизвестная подкоманда. <yellow>/es help</yellow></red>";

    public static final String HELP =
            "<dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</dark_gray>\n" +
            "<gradient:#ffd700:#ff8c00>    ⚔ EmperorSword — Команды</gradient>\n" +
            "<dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</dark_gray>\n" +
            "<yellow>/es info</yellow> <gray>— посмотреть прогресс меча</gray>\n" +
            "<yellow>/es give <игрок></yellow> <dark_gray>[admin]</dark_gray> <gray>— выдать меч</gray>\n" +
            "<yellow>/es setlevel <игрок> <ур></yellow> <dark_gray>[admin]</dark_gray> <gray>— задать уровень</gray>\n" +
            "<yellow>/es reload</yellow> <dark_gray>[admin]</dark_gray> <gray>— перезагрузить конфиг</gray>\n" +
            "<dark_gray>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</dark_gray>";

    // ——————————————————————————————————————————
    // Вспомогательные методы замены переменных
    // ——————————————————————————————————————————

    public static Component levelUp(int level, String name) {
        return parse(LEVEL_UP
                .replace("{level}", String.valueOf(level))
                .replace("{name}", name));
    }

    public static Component levelUpTitle() {
        return parse(LEVEL_UP_TITLE);
    }

    public static Component levelUpSubtitle(int level, String name) {
        return parse(LEVEL_UP_SUBTITLE
                .replace("{level}", String.valueOf(level))
                .replace("{name}", name));
    }

    public static Component swordGiven(String playerName) {
        return parse(SWORD_GIVEN.replace("{player}", playerName));
    }

    public static Component swordReceived() {
        return parse(SWORD_RECEIVED);
    }

    public static Component alreadyHasSword(String playerName) {
        return parse(ALREADY_HAS_SWORD.replace("{player}", playerName));
    }

    public static Component inventoryFull(String playerName) {
        return parse(INVENTORY_FULL.replace("{player}", playerName));
    }

    public static Component levelSet(String playerName, int level) {
        return parse(LEVEL_SET
                .replace("{player}", playerName)
                .replace("{level}", String.valueOf(level)));
    }

    public static Component playerNotFound(String playerName) {
        return parse(PLAYER_NOT_FOUND.replace("{player}", playerName));
    }

    public static Component playerHasNoSword(String playerName) {
        return parse(PLAYER_HAS_NO_SWORD.replace("{player}", playerName));
    }

    public static Component invalidLevel(int max) {
        return parse(INVALID_LEVEL.replace("{max}", String.valueOf(max)));
    }

    public static Component infoLevel(int level, String name) {
        return parse(INFO_LEVEL
                .replace("{level}", String.valueOf(level))
                .replace("{name}", name));
    }

    public static Component infoProgressLine(String type, long current, long required) {
        return parse(INFO_PROGRESS_LINE
                .replace("{type}", type)
                .replace("{current}", String.valueOf(current))
                .replace("{required}", String.valueOf(required)));
    }
}
