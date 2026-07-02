package me.bedsmp.bedahbots;

import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.Registry;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.logging.Logger;

/**
 * Loads "named" custom items defined entirely in config.yml (no external YAML file).
 * Supports: material, display-name (§ color codes), lore, enchants, custom-model-data,
 * and an optional PDC byte tag for plugin-owned items (e.g. ThornsWard).
 */
public final class NamedItemLoader {

    public record Entry(String key, ItemStack item, double price) {}

    private final Logger log;
    private final List<Entry> items = new ArrayList<>();

    public NamedItemLoader(JavaPlugin plugin) {
        this.log = plugin.getLogger();
    }

    public void reload(FileConfiguration cfg) {
        items.clear();
        if (!cfg.getBoolean("named-items.enabled", false)) return;

        ConfigurationSection section = cfg.getConfigurationSection("named-items.items");
        if (section == null) return;

        for (String key : section.getKeys(false)) {
            try {
                ConfigurationSection s = section.getConfigurationSection(key);
                if (s == null) continue;

                String matName = s.getString("material", "").toUpperCase().replace(' ', '_');
                Material mat = Material.matchMaterial(matName);
                if (mat == null) {
                    log.warning("[NamedItems] Unknown material '" + matName + "' for item '" + key + "'");
                    continue;
                }

                ItemStack item = new ItemStack(mat, 1);
                ItemMeta meta = item.getItemMeta();
                if (meta == null) continue;

                String name = s.getString("name", "");
                if (!name.isEmpty()) {
                    meta.setDisplayName(name);
                }

                List<String> loreRaw = s.getStringList("lore");
                if (!loreRaw.isEmpty()) {
                    meta.setLore(loreRaw);
                }

                if (s.contains("custom-model-data")) {
                    meta.setCustomModelData(s.getInt("custom-model-data"));
                }

                ConfigurationSection enchantSec = s.getConfigurationSection("enchants");
                if (enchantSec != null) {
                    for (String enchName : enchantSec.getKeys(false)) {
                        int level = enchantSec.getInt(enchName, 1);
                        Enchantment ench = Registry.ENCHANTMENT.get(
                                NamespacedKey.minecraft(enchName.toLowerCase()));
                        if (ench != null) {
                            meta.addEnchant(ench, level, true);
                        } else {
                            log.warning("[NamedItems] Unknown enchant '" + enchName + "' for '" + key + "'");
                        }
                    }
                }

                // PDC byte tag — used by plugins like ThornsWard to identify their items
                String pdcNs  = s.getString("pdc-namespace", "");
                String pdcKey = s.getString("pdc-key", "");
                if (!pdcNs.isEmpty() && !pdcKey.isEmpty()) {
                    NamespacedKey nsk = new NamespacedKey(pdcNs, pdcKey);
                    meta.getPersistentDataContainer().set(nsk, PersistentDataType.BYTE, (byte) 1);
                }

                item.setItemMeta(meta);
                double price = s.getDouble("price", 100000.0);
                items.add(new Entry(key, item.clone(), price));

            } catch (Exception e) {
                log.warning("[NamedItems] Error loading '" + key + "': " + e.getMessage());
            }
        }
        log.info("[NamedItems] Загружено " + items.size() + " именных предметов.");
    }

    public List<Entry> getItems() { return Collections.unmodifiableList(items); }
    public boolean isEmpty() { return items.isEmpty(); }
}
