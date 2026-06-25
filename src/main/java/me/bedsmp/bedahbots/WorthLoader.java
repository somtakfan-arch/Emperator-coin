package me.bedsmp.bedahbots;

import org.bukkit.Material;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.util.*;
import java.util.logging.Level;

public class WorthLoader {

    private final JavaPlugin plugin;
    private final Map<Material, Double> worth = new HashMap<>();
    private String worthFilePath;

    public WorthLoader(JavaPlugin plugin) {
        this.plugin = plugin;
    }

    public void setPath(String path) {
        this.worthFilePath = path;
    }

    public void reload() {
        worth.clear();
        File file = new File(worthFilePath);
        if (!file.exists()) {
            plugin.getLogger().warning("worth.yml not found at: " + worthFilePath);
            return;
        }
        YamlConfiguration yaml = YamlConfiguration.loadConfiguration(file);
        var section = yaml.getConfigurationSection("worth");
        if (section == null) {
            plugin.getLogger().warning("No 'worth:' section found in " + worthFilePath);
            return;
        }
        for (String key : section.getKeys(false)) {
            try {
                Material mat = Material.matchMaterial(key.toUpperCase());
                if (mat == null) continue;
                double val = section.getDouble(key, 0.0);
                if (val > 0) worth.put(mat, val);
            } catch (Exception e) {
                plugin.getLogger().log(Level.WARNING, "Bad worth entry: " + key, e);
            }
        }
        plugin.getLogger().info("Loaded " + worth.size() + " worth entries from " + worthFilePath);
    }

    /** Price per 1 unit, or -1 if unknown. */
    public double getWorth(Material mat) {
        return worth.getOrDefault(mat, -1.0);
    }

    /** All materials that have a known worth value. */
    public List<Material> knownMaterials() {
        return new ArrayList<>(worth.keySet());
    }

    public boolean isEmpty() {
        return worth.isEmpty();
    }
}
