package pro.bedsmp.emperorsword.sword;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.title.Title;
import org.bukkit.Material;
import org.bukkit.Sound;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.plugin.java.JavaPlugin;
import pro.bedsmp.emperorsword.level.LevelConfig;
import pro.bedsmp.emperorsword.level.SwordLevel;
import pro.bedsmp.emperorsword.quest.QuestType;
import pro.bedsmp.emperorsword.util.Messages;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Центральный менеджер Меча Императора.
 * Отвечает за создание, визуальное обновление и апгрейд меча.
 */
public class SwordManager {

    private final JavaPlugin plugin;
    private final LevelConfig levelConfig;
    private final SwordData swordData;

    public SwordManager(JavaPlugin plugin, LevelConfig levelConfig, SwordData swordData) {
        this.plugin = plugin;
        this.levelConfig = levelConfig;
        this.swordData = swordData;
    }

    // ——————————————————————————————————————————
    // Создание меча
    // ——————————————————————————————————————————

    /**
     * Создаёт новый Меч Императора для игрока на стартовом уровне.
     * Не добавляет меч в инвентарь — это задача вызывающего кода.
     */
    public ItemStack createSword(UUID ownerUuid) {
        int startLevel = levelConfig.getMinLevel();
        SwordLevel level = levelConfig.getLevel(startLevel);

        ItemStack item = new ItemStack(Material.NETHERITE_SWORD);

        // Инициализируем PDC
        swordData.initSword(item, ownerUuid, startLevel);

        // Применяем визуал первого уровня
        applyLevelVisuals(item, level, ownerUuid);

        return item;
    }

    // ——————————————————————————————————————————
    // Проверка апгрейда
    // ——————————————————————————————————————————

    /**
     * Проверяет, выполнены ли условия для перехода на следующий уровень.
     * Если да — апгрейдирует меч и оповещает игрока.
     *
     * @param player игрок-владелец
     * @param item   предмет (меч)
     * @return true если произошёл апгрейд
     */
    public boolean checkAndUpgrade(Player player, ItemStack item) {
        if (!swordData.isEmperorSword(item)) return false;

        // Проверяем привязку к владельцу
        if (plugin.getConfig().getBoolean("bind-to-owner", true)) {
            UUID owner = swordData.getOwner(item);
            if (owner != null && !owner.equals(player.getUniqueId())) {
                return false; // чужой меч — прогресс не считается
            }
        }

        int currentLevel = swordData.getLevel(item);
        SwordLevel nextLevel = levelConfig.getNextLevel(currentLevel);

        if (nextLevel == null) return false; // уже максимум

        // Проверяем все требования следующего уровня
        for (Map.Entry<QuestType, Long> req : nextLevel.getRequirements().entrySet()) {
            long progress = swordData.getProgress(item, req.getKey());
            if (progress < req.getValue()) {
                return false; // требование не выполнено
            }
        }

        // Все требования выполнены — апгрейд!
        performUpgrade(player, item, nextLevel);
        return true;
    }

    /**
     * Принудительно устанавливает уровень меча (команда /es setlevel).
     */
    public void forceSetLevel(ItemStack item, int targetLevel) {
        SwordLevel level = levelConfig.getLevel(targetLevel);
        if (level == null) return;

        UUID owner = swordData.getOwner(item);
        swordData.setLevel(item, targetLevel);
        swordData.resetAllProgress(item);
        applyLevelVisuals(item, level, owner);
    }

    // ——————————————————————————————————————————
    // Внутренний апгрейд
    // ——————————————————————————————————————————

    private void performUpgrade(Player player, ItemStack item, SwordLevel newLevel) {
        // Сбрасываем прогресс и сохраняем новый уровень
        swordData.setLevel(item, newLevel.getLevelNumber());
        swordData.resetAllProgress(item);

        // Обновляем визуал меча
        applyLevelVisuals(item, newLevel, player.getUniqueId());

        // Уведомляем игрока
        player.sendMessage(Messages.levelUp(newLevel.getLevelNumber(), newLevel.getName()));

        // Звук апгрейда
        if (plugin.getConfig().getBoolean("sounds.enabled", true)) {
            String soundName = plugin.getConfig().getString("sounds.level-up", "ENTITY_PLAYER_LEVELUP");
            float volume = (float) plugin.getConfig().getDouble("sounds.volume", 1.0);
            float pitch  = (float) plugin.getConfig().getDouble("sounds.pitch", 1.0);
            try {
                Sound sound = Sound.valueOf(soundName);
                player.playSound(player.getLocation(), sound, volume, pitch);
            } catch (IllegalArgumentException ignored) {
                // Невалидный звук в конфиге — пропускаем
            }
        }

        // Титул на экране
        if (plugin.getConfig().getBoolean("titles.enabled", true)) {
            int fadeIn  = plugin.getConfig().getInt("titles.fade-in",  10);
            int stay    = plugin.getConfig().getInt("titles.stay",     60);
            int fadeOut = plugin.getConfig().getInt("titles.fade-out", 20);

            Title title = Title.title(
                    Messages.levelUpTitle(),
                    Messages.levelUpSubtitle(newLevel.getLevelNumber(), newLevel.getName()),
                    Title.Times.times(
                            Duration.ofMillis(fadeIn  * 50L),
                            Duration.ofMillis(stay    * 50L),
                            Duration.ofMillis(fadeOut * 50L)
                    )
            );
            player.showTitle(title);
        }

        plugin.getLogger().info("[EmperorSword] " + player.getName() +
                " получил уровень " + newLevel.getLevelNumber() + ": " + newLevel.getName());
    }

    // ——————————————————————————————————————————
    // Обновление визуала (имя, lore, чары)
    // ——————————————————————————————————————————

    /**
     * Применяет имя, lore и зачарования к мечу согласно уровню.
     * Вызывается при создании, апгрейде и обновлении прогресса в lore.
     */
    public void applyLevelVisuals(ItemStack item, SwordLevel level, UUID ownerUuid) {
        ItemMeta meta = item.getItemMeta();

        // Имя предмета
        meta.displayName(Messages.parse(level.getName()));

        // Lore: уровень + название + прогресс
        List<Component> lore = buildLore(item, level, ownerUuid);
        meta.lore(lore);

        // Нерушимость
        meta.setUnbreakable(level.isUnbreakable());

        // Удаляем старые чары и применяем новые
        for (Enchantment ench : meta.getEnchants().keySet().toArray(new Enchantment[0])) {
            meta.removeEnchant(ench);
        }

        item.setItemMeta(meta);

        // Зачарования добавляем через ItemStack чтобы обойти ограничения уровней
        for (Map.Entry<Enchantment, Integer> entry : level.getEnchants().entrySet()) {
            item.addUnsafeEnchantment(entry.getKey(), entry.getValue());
        }
    }

    /**
     * Обновляет только lore (прогресс-строки) без смены зачарований.
     * Вызывается периодически чтобы отображать актуальный прогресс.
     */
    public void refreshLore(ItemStack item, UUID ownerUuid) {
        if (!swordData.isEmperorSword(item)) return;
        int levelNum = swordData.getLevel(item);
        SwordLevel level = levelConfig.getLevel(levelNum);
        if (level == null) return;

        ItemMeta meta = item.getItemMeta();
        meta.lore(buildLore(item, level, ownerUuid));
        item.setItemMeta(meta);
    }

    private List<Component> buildLore(ItemStack item, SwordLevel level, UUID ownerUuid) {
        List<Component> lore = new ArrayList<>();

        // Заголовок уровня
        lore.add(Messages.parse("<dark_gray>───────────────────</dark_gray>"));
        lore.add(Messages.parse("<gray>Уровень: <white>" + level.getLevelNumber() + "</white>"
                + "  <dark_gray>|</dark_gray>  " + level.getName()));

        // Дополнительное описание уровня
        if (level.getLoreTitle() != null && !level.getLoreTitle().isEmpty()) {
            lore.add(Messages.parse(level.getLoreTitle()));
        }

        lore.add(Messages.parse("<dark_gray>───────────────────</dark_gray>"));

        // Прогресс к следующему уровню
        SwordLevel nextLevel = levelConfig.getNextLevel(level.getLevelNumber());
        if (nextLevel == null) {
            // Максимальный уровень
            lore.add(Messages.parse("<gradient:#ffd700:#ff0000>✦ Максимальный уровень! ✦</gradient>"));
            lore.add(Messages.parse("<dark_gray>Ты достиг вершины силы.</dark_gray>"));
        } else {
            lore.add(Messages.parse("<gray>Следующий уровень:</gray>"));
            for (Map.Entry<QuestType, Long> req : nextLevel.getRequirements().entrySet()) {
                long progress = 0L;
                // Читаем прогресс только если предмет уже инициализирован
                if (swordData.isEmperorSword(item)) {
                    progress = swordData.getProgress(item, req.getKey());
                }
                long required = req.getValue();
                long clamped = Math.min(progress, required);

                // Цвет индикатора: зелёный если выполнено, жёлтый в процессе
                String color = clamped >= required ? "<green>" : "<yellow>";
                String closeColor = clamped >= required ? "</green>" : "</yellow>";

                lore.add(Messages.parse(
                        "  <gray>" + req.getKey().getDisplayName() + ": "
                        + color + clamped + "/" + required + closeColor));
            }
        }

        lore.add(Messages.parse("<dark_gray>───────────────────</dark_gray>"));

        // Показываем владельца если привязка включена
        if (ownerUuid != null && plugin.getConfig().getBoolean("bind-to-owner", true)) {
            lore.add(Messages.parse("<dark_gray>Владелец: <gray>" + ownerUuid.toString().substring(0, 8) + "...</gray>"));
        }

        return lore;
    }

    // ——————————————————————————————————————————
    // Поиск меча в инвентаре
    // ——————————————————————————————————————————

    /**
     * Ищет Меч Императора в основном инвентаре игрока (без оффхенда и брони).
     * Возвращает первый найденный или null.
     */
    public ItemStack findSwordInInventory(Player player) {
        for (ItemStack item : player.getInventory().getStorageContents()) {
            if (swordData.isEmperorSword(item)) {
                return item;
            }
        }
        return null;
    }

    /**
     * Проверяет, есть ли у игрока хотя бы один Меч Императора в инвентаре.
     */
    public boolean hasSword(Player player) {
        return findSwordInInventory(player) != null;
    }

    public SwordData getSwordData() {
        return swordData;
    }

    public LevelConfig getLevelConfig() {
        return levelConfig;
    }
}
