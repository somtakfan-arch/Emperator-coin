package me.bedsmp.bedahbots;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.logging.Logger;

/**
 * Reads custom server items from a YAML database (e.g. EmperorSword/serverdatabase.yml)
 * and exposes them for random bot listings.
 *
 * Expected file format:
 *   myitem:
 *     item:
 *       ==: org.bukkit.inventory.ItemStack
 *       ...
 */
public final class CustomItemLoader {

    public record Entry(String key, ItemStack item, double price) {}

    private final Logger log;
    private final List<Entry> items = new ArrayList<>();

    public CustomItemLoader(JavaPlugin plugin) {
        this.log = plugin.getLogger();
    }

    public void reload(FileConfiguration cfg) {
        items.clear();
        if (!cfg.getBoolean("custom-items.enabled", false)) return;

        String filePath = cfg.getString("custom-items.file", "");
        if (filePath.isBlank()) return;

        File file = new File(filePath);
        if (!file.exists()) {
            log.warning("[CustomItems] Файл не найден: " + filePath);
            return;
        }

        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(file);
        double defaultPrice = cfg.getDouble("custom-items.default-price", 200000.0);

        for (String key : yaml.getKeys(false)) {
            try {
                ItemStack item = yaml.getItemStack(key + ".item");
                if (item == null) {
                    log.warning("[CustomItems] Пропускаю '" + key + "' — поле item отсутствует");
                    continue;
                }
                double price = cfg.getDouble("custom-items.prices." + key, defaultPrice);
                items.add(new Entry(key, item.clone(), price));
            } catch (Exception e) {
                log.warning("[CustomItems] Ошибка загрузки '" + key + "': " + e.getMessage());
            }
        }
        log.info("[CustomItems] Загружено " + items.size() + " кастомных предметов.");
    }

    public List<Entry> getItems() { return Collections.unmodifiableList(items); }
    public boolean isEmpty() { return items.isEmpty(); }
}
