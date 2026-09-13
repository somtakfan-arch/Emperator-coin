package ru.bedsmp.nofireworks;

import org.bukkit.World;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Снимок config.yml. Пересоздаётся при /nofireworks reload. */
public final class Settings {

    private final boolean enabled;

    private final boolean removeRockets;
    private final boolean removeStars;
    private final boolean unloadCrossbows;
    private final boolean removeEntities;

    private final boolean blockUse;
    private final boolean blockCrafting;
    private final boolean blockDispensers;
    private final boolean blockCrossbow;

    private final boolean hookHoppers;
    private final boolean logToConsole;
    private final boolean logSummary;

    private final boolean bypassEnabled;
    private final String bypassPermission;

    private final boolean worldWhitelist;
    private final Set<String> worldList;

    private final boolean sweepEnabled;
    private final long sweepIntervalTicks;
    private final int chunksPerTick;
    private final boolean sweepPlayers;
    private final boolean sweepOnChunkLoad;

    private final FileConfiguration raw;

    private Settings(FileConfiguration cfg) {
        this.raw = cfg;
        this.enabled = cfg.getBoolean("enabled", true);

        this.removeRockets = cfg.getBoolean("remove.firework-rocket", true);
        this.removeStars = cfg.getBoolean("remove.firework-star", true);
        this.unloadCrossbows = cfg.getBoolean("remove.loaded-crossbows", true);
        this.removeEntities = cfg.getBoolean("remove.entities", true);

        this.blockUse = cfg.getBoolean("block.use", true);
        this.blockCrafting = cfg.getBoolean("block.crafting", true);
        this.blockDispensers = cfg.getBoolean("block.dispensers", true);
        this.blockCrossbow = cfg.getBoolean("block.crossbow", true);

        this.hookHoppers = cfg.getBoolean("hook-hoppers", true);
        this.logToConsole = cfg.getBoolean("log-to-console", false);
        this.logSummary = cfg.getBoolean("log-summary", true);

        this.bypassEnabled = cfg.getBoolean("bypass.enabled", false);
        this.bypassPermission = cfg.getString("bypass.permission", "bednofireworks.bypass");

        this.worldWhitelist = "whitelist".equalsIgnoreCase(cfg.getString("worlds.mode", "blacklist"));
        this.worldList = new HashSet<>();
        for (String name : cfg.getStringList("worlds.list")) {
            this.worldList.add(name.toLowerCase(Locale.ROOT));
        }

        this.sweepEnabled = cfg.getBoolean("sweep.enabled", true);
        this.sweepIntervalTicks = Math.max(20L, cfg.getLong("sweep.interval-ticks", 1200L));
        this.chunksPerTick = Math.max(1, cfg.getInt("sweep.chunks-per-tick", 10));
        this.sweepPlayers = cfg.getBoolean("sweep.players", true);
        this.sweepOnChunkLoad = cfg.getBoolean("sweep.on-chunk-load", true);
    }

    public static Settings load(FileConfiguration cfg) {
        return new Settings(cfg);
    }

    public boolean enabled() { return enabled; }

    public boolean removeRockets() { return removeRockets; }
    public boolean removeStars() { return removeStars; }
    public boolean unloadCrossbows() { return unloadCrossbows; }
    public boolean removeEntities() { return removeEntities; }

    public boolean blockUse() { return blockUse; }
    public boolean blockCrafting() { return blockCrafting; }
    public boolean blockDispensers() { return blockDispensers; }
    public boolean blockCrossbow() { return blockCrossbow; }

    public boolean hookHoppers() { return hookHoppers; }
    public boolean logToConsole() { return logToConsole; }
    public boolean logSummary() { return logSummary; }

    public boolean bypassEnabled() { return bypassEnabled; }
    public String bypassPermission() { return bypassPermission; }

    public boolean sweepEnabled() { return sweepEnabled; }
    public long sweepIntervalTicks() { return sweepIntervalTicks; }
    public int chunksPerTick() { return chunksPerTick; }
    public boolean sweepPlayers() { return sweepPlayers; }
    public boolean sweepOnChunkLoad() { return sweepOnChunkLoad; }

    /** Работает ли плагин в этом мире. */
    public boolean worldEnabled(World world) {
        if (world == null) return true;
        if (worldList.isEmpty()) return true; // пустой список = работаем везде
        boolean listed = worldList.contains(world.getName().toLowerCase(Locale.ROOT));
        return worldWhitelist == listed;
    }

    public String message(String key) {
        return raw.getString("messages.prefix", "") + raw.getString("messages." + key, "");
    }
}
