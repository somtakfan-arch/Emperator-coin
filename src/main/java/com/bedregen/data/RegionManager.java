package com.bedregen.data;

import com.bedregen.BedRegenPlugin;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.YamlConfiguration;

import java.io.File;
import java.io.IOException;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.logging.Level;

/**
 * Persists region metadata (world + bounding box) to regions.yml so that
 * regen always pastes back at the exact original coordinates.
 */
public final class RegionManager {

    private final BedRegenPlugin plugin;
    private final File file;
    private final Map<String, RegionData> regions = new LinkedHashMap<>();

    public RegionManager(BedRegenPlugin plugin) {
        this.plugin = plugin;
        this.file = new File(plugin.getDataFolder(), "regions.yml");
        load();
    }

    private void load() {
        if (!file.exists()) {
            return;
        }
        YamlConfiguration cfg = YamlConfiguration.loadConfiguration(file);
        ConfigurationSection section = cfg.getConfigurationSection("regions");
        if (section == null) {
            return;
        }
        for (String key : section.getKeys(false)) {
            ConfigurationSection rs = section.getConfigurationSection(key);
            if (rs == null) {
                continue;
            }
            RegionData data = new RegionData(
                    key,
                    rs.getString("world", ""),
                    rs.getInt("minX"), rs.getInt("minY"), rs.getInt("minZ"),
                    rs.getInt("maxX"), rs.getInt("maxY"), rs.getInt("maxZ")
            );
            regions.put(key.toLowerCase(Locale.ROOT), data);
        }
    }

    public synchronized void save() {
        YamlConfiguration cfg = new YamlConfiguration();
        for (Map.Entry<String, RegionData> entry : regions.entrySet()) {
            RegionData d = entry.getValue();
            String path = "regions." + entry.getKey();
            cfg.set(path + ".world", d.getWorld());
            cfg.set(path + ".minX", d.getMinX());
            cfg.set(path + ".minY", d.getMinY());
            cfg.set(path + ".minZ", d.getMinZ());
            cfg.set(path + ".maxX", d.getMaxX());
            cfg.set(path + ".maxY", d.getMaxY());
            cfg.set(path + ".maxZ", d.getMaxZ());
        }
        try {
            cfg.save(file);
        } catch (IOException e) {
            plugin.getLogger().log(Level.SEVERE, "Failed to save regions.yml", e);
        }
    }

    public synchronized void put(RegionData data) {
        regions.put(data.getName().toLowerCase(Locale.ROOT), data);
        save();
    }

    public synchronized RegionData get(String name) {
        return regions.get(name.toLowerCase(Locale.ROOT));
    }

    public synchronized boolean exists(String name) {
        return regions.containsKey(name.toLowerCase(Locale.ROOT));
    }

    public synchronized boolean remove(String name) {
        boolean removed = regions.remove(name.toLowerCase(Locale.ROOT)) != null;
        if (removed) {
            save();
        }
        return removed;
    }

    public synchronized Set<String> names() {
        return Collections.unmodifiableSet(new TreeSet<>(regions.keySet()));
    }
}
