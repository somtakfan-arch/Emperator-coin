package ru.bedsmp.noenchants;

import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * BedNoEnchants — плагин BedSMP, который держит сервер полностью без зачарований.
 *
 * <p>Чистит ВСЁ: инвентари игроков и эндер-сундуки, сундуки/бочки/печи/полки,
 * шалкеры-предметы (в том числе вложенные), бандлы, дроп на земле, рамки,
 * экипировку мобов, вагонетки и лодки с сундуком, лут из структур,
 * сделки жителей и результаты наковальни/верстака/кузницы.</p>
 */
public final class BedNoEnchants extends JavaPlugin {

    private Settings settings;
    private EnchantStripper stripper;
    private SweepTask sweepTask;
    private final Stats stats = new Stats();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        this.settings = Settings.load(getConfig(), getLogger());
        this.stripper = new EnchantStripper(this);
        this.sweepTask = new SweepTask(this);

        getServer().getPluginManager().registerEvents(new StripListener(this), this);

        PluginCommand command = getCommand("noenchants");
        if (command != null) {
            NoEnchantsCommand executor = new NoEnchantsCommand(this);
            command.setExecutor(executor);
            command.setTabCompleter(executor);
        }

        sweepTask.start();

        // Стартовая зачистка того, что уже загружено (миры грузятся до onEnable).
        getServer().getScheduler().runTask(this, () -> {
            long itemsBefore = stats.items();
            int chunks = sweepTask.scanNow();
            if (settings.logSummary()) {
                getLogger().info("Стартовая зачистка: чанков " + chunks
                        + ", очищено предметов " + (stats.items() - itemsBefore) + ".");
            }
        });

        getLogger().info("BedNoEnchants включён — зачарований на сервере больше нет."
                + (settings.vanillaGearEnabled()
                ? " Ванильные характеристики: следим за " + settings.vanillaComponents().size() + " компонентами."
                : ""));
    }

    @Override
    public void onDisable() {
        if (sweepTask != null) sweepTask.stop();
        getLogger().info("BedNoEnchants выключен.");
    }

    /** Перечитывает config.yml и перезапускает фоновую зачистку. */
    public void reloadSettings() {
        reloadConfig();
        this.settings = Settings.load(getConfig(), getLogger());
        sweepTask.start();
    }

    public Settings settings() {
        return settings;
    }

    public EnchantStripper stripper() {
        return stripper;
    }

    public SweepTask sweepTask() {
        return sweepTask;
    }

    public Stats stats() {
        return stats;
    }
}
