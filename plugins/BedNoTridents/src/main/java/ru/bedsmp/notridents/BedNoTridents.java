package ru.bedsmp.notridents;

import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * BedNoTridents — плагин BedSMP, который держит сервер без трезубцев
 * и без трезубцовых чар.
 *
 * <p>Удаляет трезубцы из инвентарей, эндер-сундуков, сундуков, шалкеров
 * (в том числе вложенных), бандлов, дропа, рамок, вагонеток, лута, у мобов
 * (утопленники) и в полёте. Снимает перечисленные в конфиге чары со всех
 * предметов и книг. Запрещает бросок, Тягун и зачарование.</p>
 */
public final class BedNoTridents extends JavaPlugin {

    private Settings settings;
    private TridentCleaner cleaner;
    private SweepTask sweepTask;
    private final Stats stats = new Stats();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        this.settings = Settings.load(getConfig(), getLogger());
        this.cleaner = new TridentCleaner(this);
        this.sweepTask = new SweepTask(this);

        getServer().getPluginManager().registerEvents(new TridentListener(this), this);

        PluginCommand command = getCommand("notridents");
        if (command != null) {
            NoTridentsCommand executor = new NoTridentsCommand(this);
            command.setExecutor(executor);
            command.setTabCompleter(executor);
        }

        sweepTask.start();

        getServer().getScheduler().runTask(this, () -> {
            long itemsBefore = stats.items();
            long enchantsBefore = stats.enchantments();
            int chunks = sweepTask.scanNow();
            if (settings.logSummary()) {
                getLogger().info("Стартовая зачистка: чанков " + chunks
                        + ", удалено трезубцев " + (stats.items() - itemsBefore)
                        + ", снято чар " + (stats.enchantments() - enchantsBefore) + ".");
            }
        });

        getLogger().info("BedNoTridents включён — трезубцев на сервере больше нет."
                + (settings.enchantmentsEnabled()
                ? (settings.enchantmentFilter().all()
                ? " Снимаются ВСЕ чары."
                : " Запрещённых чар в списке: " + settings.enchantmentFilter().size() + ".")
                : ""));
    }

    @Override
    public void onDisable() {
        if (sweepTask != null) sweepTask.stop();
        getLogger().info("BedNoTridents выключен.");
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

    public TridentCleaner cleaner() {
        return cleaner;
    }

    public SweepTask sweepTask() {
        return sweepTask;
    }

    public Stats stats() {
        return stats;
    }
}
