package pro.bedsmp.emperorsword.level;

import org.bukkit.NamespacedKey;
import org.bukkit.Registry;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.plugin.java.JavaPlugin;
import pro.bedsmp.emperorsword.quest.QuestType;

import java.io.File;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.logging.Level;

/**
 * Загружает и хранит все уровни Меча Императора из levels.yml.
 * Уровни можно добавлять в конфиге без перекомпиляции плагина.
 */
public class LevelConfig {

    private final JavaPlugin plugin;
    /** Уровни, отсортированные по номеру */
    private final TreeMap<Integer, SwordLevel> levels = new TreeMap<>();

    public LevelConfig(JavaPlugin plugin) {
        this.plugin = plugin;
    }

    /** Загружает (или перезагружает) уровни из levels.yml */
    public void load() {
        levels.clear();

        // Создаём файл если не существует
        File file = new File(plugin.getDataFolder(), "levels.yml");
        if (!file.exists()) {
            plugin.saveResource("levels.yml", false);
        }

        FileConfiguration cfg = YamlConfiguration.loadConfiguration(file);

        // Подгружаем дефолты из jar-файла плагина
        InputStream defStream = plugin.getResource("levels.yml");
        if (defStream != null) {
            cfg.setDefaults(YamlConfiguration.loadConfiguration(
                    new InputStreamReader(defStream, StandardCharsets.UTF_8)));
        }

        ConfigurationSection levelsSection = cfg.getConfigurationSection("levels");
        if (levelsSection == null) {
            plugin.getLogger().severe("[EmperorSword] Секция 'levels' не найдена в levels.yml!");
            return;
        }

        for (String key : levelsSection.getKeys(false)) {
            try {
                int levelNum = Integer.parseInt(key);
                ConfigurationSection sec = levelsSection.getConfigurationSection(key);
                if (sec == null) continue;

                String name = sec.getString("name", "<white>Меч Уровня " + levelNum + "</white>");
                String loreTitle = sec.getString("lore-title", "");

                // Парсим требования
                Map<QuestType, Long> requirements = new LinkedHashMap<>();
                ConfigurationSection reqSec = sec.getConfigurationSection("requirements");
                if (reqSec != null) {
                    for (String reqKey : reqSec.getKeys(false)) {
                        QuestType type = QuestType.fromConfigKey(reqKey);
                        if (type == null) {
                            plugin.getLogger().warning(
                                    "[EmperorSword] Неизвестный тип квеста '" + reqKey +
                                    "' в уровне " + levelNum);
                            continue;
                        }
                        long amount = reqSec.getLong(reqKey, 0L);
                        if (amount > 0) {
                            requirements.put(type, amount);
                        }
                    }
                }

                // Парсим зачарования
                Map<Enchantment, Integer> enchants = new LinkedHashMap<>();
                ConfigurationSection enchSec = sec.getConfigurationSection("enchants");
                if (enchSec != null) {
                    for (String enchKey : enchSec.getKeys(false)) {
                        Enchantment ench = resolveEnchantment(enchKey);
                        if (ench == null) {
                            plugin.getLogger().warning(
                                    "[EmperorSword] Неизвестное зачарование '" + enchKey +
                                    "' в уровне " + levelNum);
                            continue;
                        }
                        int lvl = enchSec.getInt(enchKey, 1);
                        enchants.put(ench, lvl);
                    }
                }

                boolean unbreakable = sec.getBoolean("unbreakable", false);

                levels.put(levelNum, new SwordLevel(levelNum, name, loreTitle,
                        requirements, enchants, unbreakable));

            } catch (NumberFormatException e) {
                plugin.getLogger().warning(
                        "[EmperorSword] Некорректный ключ уровня: '" + key + "' — должно быть число.");
            }
        }

        plugin.getLogger().info("[EmperorSword] Загружено уровней: " + levels.size());
    }

    /**
     * Разбирает название зачарования из конфига.
     * Поддерживает форматы: "sharpness", "minecraft:sharpness", "SHARPNESS".
     */
    private Enchantment resolveEnchantment(String key) {
        // Убираем пространство имён если есть
        String normalized = key.toLowerCase(Locale.ROOT);
        if (!normalized.contains(":")) {
            normalized = "minecraft:" + normalized;
        }
        // Заменяем подчёркивания для совместимости
        NamespacedKey nsKey = NamespacedKey.fromString(normalized);
        if (nsKey == null) return null;
        return Registry.ENCHANTMENT.get(nsKey);
    }

    public SwordLevel getLevel(int levelNum) {
        return levels.get(levelNum);
    }

    public int getMaxLevel() {
        return levels.isEmpty() ? 1 : levels.lastKey();
    }

    public int getMinLevel() {
        return levels.isEmpty() ? 1 : levels.firstKey();
    }

    /** Возвращает следующий уровень после указанного, или null если текущий — максимальный */
    public SwordLevel getNextLevel(int currentLevel) {
        Integer next = levels.higherKey(currentLevel);
        return next != null ? levels.get(next) : null;
    }

    public Collection<SwordLevel> getAllLevels() {
        return Collections.unmodifiableCollection(levels.values());
    }

    public boolean isLoaded() {
        return !levels.isEmpty();
    }
}
