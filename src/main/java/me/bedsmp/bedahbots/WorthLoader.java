package me.bedsmp.bedahbots;

import org.bukkit.Material;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.configuration.file.YamlConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

import java.io.File;
import java.util.*;
import java.util.logging.Level;

public class WorthLoader {

    private final JavaPlugin plugin;
    private final Map<Material, Double> worth = new HashMap<>();
    private final Map<Material, Double> extraWorth = new HashMap<>();
    private String worthFilePath;
    private GrokPriceCache grokPrices;
    private double grokOverrideBelow = 100.0;

    public WorthLoader(JavaPlugin plugin) {
        this.plugin = plugin;
    }

    public void setPath(String path) {
        this.worthFilePath = path;
    }

    public void setGrokPriceCache(GrokPriceCache cache) {
        this.grokPrices = cache;
    }

    public void setGrokOverrideBelow(double threshold) {
        this.grokOverrideBelow = threshold;
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

    /** Loads supplemental prices from config.yml's pricing.extra-worth section. */
    public void loadExtraWorth(FileConfiguration cfg) {
        extraWorth.clear();
        var section = cfg.getConfigurationSection("pricing.extra-worth");
        if (section == null) return;
        for (String key : section.getKeys(false)) {
            try {
                Material mat = Material.matchMaterial(key.toUpperCase());
                if (mat == null) continue;
                double val = section.getDouble(key, 0.0);
                if (val > 0) extraWorth.put(mat, val);
            } catch (Exception e) {
                plugin.getLogger().log(Level.WARNING, "Bad extra-worth entry: " + key, e);
            }
        }
        plugin.getLogger().info("Loaded " + extraWorth.size() + " extra-worth entries from config.yml");
    }

    /**
     * Price per 1 unit, or -1 if unknown.
     * If worth.yml price is below grok-override-below threshold, Grok price takes priority.
     * Priority: worth.yml (if >= threshold) → Grok cache → worth.yml (if < threshold) → extra-worth config.
     */
    public double getWorth(Material mat) {
        Double w = worth.get(mat);
        if (w != null && w >= grokOverrideBelow) return w;   // worth.yml price is fine — use it
        if (grokPrices != null && grokPrices.has(mat)) return grokPrices.getPrice(mat);  // Grok override
        if (w != null) return w;                              // worth.yml even if cheap (Grok had nothing)
        Double ew = extraWorth.get(mat);
        return ew != null ? ew : -1.0;
    }

    /** Materials from the extra-worth config section. */
    public List<Material> extraWorthMaterials() {
        return new ArrayList<>(extraWorth.keySet());
    }

    /** Materials whose worth.yml price is below the threshold — candidates for Grok override. */
    public List<Material> cheapWorthMaterials(double threshold) {
        List<Material> result = new ArrayList<>();
        for (var entry : worth.entrySet()) {
            if (entry.getValue() < threshold) result.add(entry.getKey());
        }
        return result;
    }

    /** All materials that have a known worth value (worth.yml ∪ extra-worth). */
    public List<Material> knownMaterials() {
        Set<Material> all = new HashSet<>(worth.keySet());
        all.addAll(extraWorth.keySet());
        return new ArrayList<>(all);
    }

    public boolean isEmpty() {
        return worth.isEmpty() && extraWorth.isEmpty();
    }
}
