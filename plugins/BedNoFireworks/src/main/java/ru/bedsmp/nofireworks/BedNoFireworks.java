package ru.bedsmp.nofireworks;

import org.bukkit.NamespacedKey;
import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.List;

/**
 * BedNoFireworks — плагин BedSMP, который держит сервер полностью без фейерверков.
 *
 * <p>Удаляет ракеты и звёздочки из инвентарей, эндер-сундуков, сундуков и бочек,
 * шалкеров (в том числе вложенных), бандлов, заряженных арбалетов, дропа, рамок,
 * вагонеток, лута и торговцев. Запрещает использование, разгон на элитрах,
 * выстрел из арбалета, раздатчики и крафт.</p>
 */
public final class BedNoFireworks extends JavaPlugin {

    /** Ванильные рецепты, которые выключаются при block.crafting. */
    private static final List<String> FIREWORK_RECIPES =
            List.of("firework_rocket", "firework_star", "firework_star_fade");

    private Settings settings;
    private FireworkCleaner cleaner;
    private SweepTask sweepTask;
    private final Stats stats = new Stats();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        this.settings = Settings.load(getConfig());
        this.cleaner = new FireworkCleaner(this);
        this.sweepTask = new SweepTask(this);

        getServer().getPluginManager().registerEvents(new FireworkListener(this), this);

        PluginCommand command = getCommand("nofireworks");
        if (command != null) {
            NoFireworksCommand executor = new NoFireworksCommand(this);
            command.setExecutor(executor);
            command.setTabCompleter(executor);
        }

        applyRecipeRules();
        sweepTask.start();

        // Стартовая зачистка того, что уже загружено.
        getServer().getScheduler().runTask(this, () -> {
            long itemsBefore = stats.items();
            int chunks = sweepTask.scanNow();
            if (settings.logSummary()) {
                getLogger().info("Стартовая зачистка: чанков " + chunks
                        + ", удалено фейерверков " + (stats.items() - itemsBefore) + ".");
            }
        });

        getLogger().info("BedNoFireworks включён — фейерверков на сервере больше нет.");
    }

    @Override
    public void onDisable() {
        if (sweepTask != null) sweepTask.stop();
        getLogger().info("BedNoFireworks выключен.");
    }

    /** Выключает ванильные рецепты фейерверков (и возвращает их, если крафт снова разрешён). */
    private void applyRecipeRules() {
        if (!settings.blockCrafting()) return;
        int removed = 0;
        for (String name : FIREWORK_RECIPES) {
            if (getServer().removeRecipe(NamespacedKey.minecraft(name))) removed++;
        }
        if (removed > 0 && settings.logSummary()) {
            getLogger().info("Отключено рецептов фейерверков: " + removed + ".");
        }
    }

    /** Перечитывает config.yml и перезапускает фоновую зачистку. */
    public void reloadSettings() {
        reloadConfig();
        this.settings = Settings.load(getConfig());
        applyRecipeRules();
        sweepTask.start();
    }

    public Settings settings() {
        return settings;
    }

    public FireworkCleaner cleaner() {
        return cleaner;
    }

    public SweepTask sweepTask() {
        return sweepTask;
    }

    public Stats stats() {
        return stats;
    }
}
