package me.bedsmp.bedahbots;

import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.logging.Level;

/**
 * Restart-safe inventory of items the bots have purchased and are waiting to resell.
 * Serialised to stock.yml using Bukkit's built-in ItemStack serialisation.
 */
public class BotStock {

    private final JavaPlugin plugin;
    private final List<ItemStack> items = new ArrayList<>();
    private File stockFile;

    public BotStock(JavaPlugin plugin) {
        this.plugin = plugin;
    }

    public void init() {
        stockFile = new File(plugin.getDataFolder(), "stock.yml");
        load();
    }

    public synchronized void addItem(ItemStack item) {
        if (item != null && !item.getType().isAir()) {
            items.add(item.clone());
        }
    }

    /**
     * Removes and returns up to {@code count} items from the stock.
     * May return fewer if the stock is smaller.
     */
    public synchronized List<ItemStack> take(int count) {
        int n = Math.min(count, items.size());
        List<ItemStack> taken = new ArrayList<>(items.subList(0, n));
        items.subList(0, n).clear();
        return taken;
    }

    public synchronized int size() {
        return items.size();
    }

    public synchronized void clear() {
        items.clear();
    }

    public synchronized void save() {
        YamlConfiguration yaml = new YamlConfiguration();
        yaml.set("items", items.isEmpty() ? null : items);
        try {
            plugin.getDataFolder().mkdirs();
            yaml.save(stockFile);
        } catch (IOException e) {
            plugin.getLogger().log(Level.SEVERE, "Failed to save stock.yml", e);
        }
    }

    private void load() {
        items.clear();
        if (!stockFile.exists()) return;
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(stockFile);
        List<?> raw = yaml.getList("items");
        if (raw == null) return;
        for (Object o : raw) {
            if (o instanceof ItemStack is) {
                items.add(is);
            }
        }
        plugin.getLogger().info("Loaded " + items.size() + " item(s) from stock.yml");
    }
}
