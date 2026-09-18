package ru.bedsmp.notridents;

import org.bukkit.World;
import org.bukkit.configuration.file.FileConfiguration;

import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.logging.Logger;

/** Снимок config.yml. Пересоздаётся при /notridents reload. */
public final class Settings {

    private final boolean enabled;

    private final boolean removeTridents;
    private final boolean removeEntities;

    private final boolean enchantmentsEnabled;
    private final EnchantmentFilter enchantmentFilter;
    private final boolean convertEmptyBooks;

    private final boolean blockUse;
    private final boolean blockEnchanting;

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

    private Settings(FileConfiguration cfg, Logger logger) {
        this.raw = cfg;
        this.enabled = cfg.getBoolean("enabled", true);

        this.removeTridents = cfg.getBoolean("remove.tridents", true);
        this.removeEntities = cfg.getBoolean("remove.entities", true);

        this.enchantmentsEnabled = cfg.getBoolean("enchantments.enabled", true);
        this.enchantmentFilter = EnchantmentFilter.resolve(
                cfg.getBoolean("enchantments.all", false),
                cfg.getStringList("enchantments.list"),
                logger);
        this.convertEmptyBooks = cfg.getBoolean("enchantments.convert-empty-books", true);

        this.blockUse = cfg.getBoolean("block.use", true);
        this.blockEnchanting = cfg.getBoolean("block.enchanting", true);

        this.hookHoppers = cfg.getBoolean("hook-hoppers", true);
        this.logToConsole = cfg.getBoolean("log-to-console", false);
        this.logSummary = cfg.getBoolean("log-summary", true);

        this.bypassEnabled = cfg.getBoolean("bypass.enabled", false);
        this.bypassPermission = cfg.getString("bypass.permission", "bednotridents.bypass");

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

    public static Settings load(FileConfiguration cfg, Logger logger) {
        return new Settings(cfg, logger);
    }

    public boolean enabled() { return enabled; }

    public boolean removeTridents() { return removeTridents; }
    public boolean removeEntities() { return removeEntities; }

    public boolean enchantmentsEnabled() { return enchantmentsEnabled && !enchantmentFilter.isEmpty(); }
    public EnchantmentFilter enchantmentFilter() { return enchantmentFilter; }
    public boolean convertEmptyBooks() { return convertEmptyBooks; }

    public boolean blockUse() { return blockUse; }
    public boolean blockEnchanting() { return blockEnchanting; }

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

    public boolean worldEnabled(World world) {
        if (world == null) return true;
        if (worldList.isEmpty()) return true;
        boolean listed = worldList.contains(world.getName().toLowerCase(Locale.ROOT));
        return worldWhitelist == listed;
    }

    public String message(String key) {
        return raw.getString("messages.prefix", "") + raw.getString("messages." + key, "");
    }
}
