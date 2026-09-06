package ru.bedsmp.noenchants;

import org.bukkit.World;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Снимок config.yml. Пересоздаётся при /noenchants reload. */
public final class Settings {

    private final boolean enabled;
    private final boolean convertEnchantedBooks;
    private final boolean clearGlintOverride;
    private final boolean blockEnchantingTable;
    private final boolean cleanWorkstationResults;
    private final boolean stripVillagerTrades;
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
        this.convertEnchantedBooks = cfg.getBoolean("convert-enchanted-books", true);
        this.clearGlintOverride = cfg.getBoolean("clear-glint-override", true);
        this.blockEnchantingTable = cfg.getBoolean("block-enchanting-table", true);
        this.cleanWorkstationResults = cfg.getBoolean("clean-workstation-results", true);
        this.stripVillagerTrades = cfg.getBoolean("strip-villager-trades", true);
        this.hookHoppers = cfg.getBoolean("hook-hoppers", true);
        this.logToConsole = cfg.getBoolean("log-to-console", false);
        this.logSummary = cfg.getBoolean("log-summary", true);

        this.bypassEnabled = cfg.getBoolean("bypass.enabled", false);
        this.bypassPermission = cfg.getString("bypass.permission", "bednoenchants.bypass");

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
    public boolean convertEnchantedBooks() { return convertEnchantedBooks; }
    public boolean clearGlintOverride() { return clearGlintOverride; }
    public boolean blockEnchantingTable() { return blockEnchantingTable; }
    public boolean cleanWorkstationResults() { return cleanWorkstationResults; }
    public boolean stripVillagerTrades() { return stripVillagerTrades; }
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
        String prefix = raw.getString("messages.prefix", "");
        String value = raw.getString("messages." + key, "");
        return prefix + value;
    }
}
