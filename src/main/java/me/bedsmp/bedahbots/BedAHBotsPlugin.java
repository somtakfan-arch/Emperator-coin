package me.bedsmp.bedahbots;

import me.bedsmp.bedahbots.command.AhBotsCommand;
import me.bedsmp.bedahbots.task.BuyingTask;
import me.bedsmp.bedahbots.task.ListingTask;
import me.bedsmp.bedahbots.task.ResellingTask;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

public final class BedAHBotsPlugin extends JavaPlugin {

    private BotManager botManager;
    private WorthLoader worthLoader;
    private BotStock stock;

    // Task objects (created once, config updated on reload) — package-visible for command class
    public ListingTask listingTask;
    public BuyingTask buyingTask;
    public ResellingTask resellingTask;

    // Scheduled handles for cancellation
    private BukkitTask scheduledListing;
    private BukkitTask scheduledBuying;
    private BukkitTask scheduledReselling;

    @Override
    public void onEnable() {
        saveDefaultConfig();

        botManager  = new BotManager();
        worthLoader = new WorthLoader(this);
        stock       = new BotStock(this);

        stock.init();

        listingTask   = new ListingTask(this, botManager, worthLoader);
        buyingTask    = new BuyingTask(this, botManager, worthLoader, stock);
        resellingTask = new ResellingTask(this, botManager, worthLoader, stock);

        loadConfigAndSchedule();

        var cmdExecutor = new AhBotsCommand(this, botManager, worthLoader, stock, this);
        var cmdObj = getCommand("ahbots");
        if (cmdObj != null) {
            cmdObj.setExecutor(cmdExecutor);
            cmdObj.setTabCompleter(cmdExecutor);
        }

        getLogger().info("BedAHBots enabled.");
    }

    @Override
    public void onDisable() {
        cancelScheduled();
        if (stock != null) stock.save();
        getLogger().info("BedAHBots disabled. Stock saved.");
    }

    /** Called by AhBotsCommand on /ahbots reload. */
    public void reloadAll() {
        reloadConfig();
        loadConfigAndSchedule();
    }

    private void loadConfigAndSchedule() {
        FileConfiguration cfg = getConfig();

        botManager.load(cfg);

        worthLoader.setPath(cfg.getString("pricing.worth-file", "plugins/Essentials/worth.yml"));
        worthLoader.reload();

        listingTask.reloadConfig(cfg);
        buyingTask.reloadConfig(cfg);
        resellingTask.reloadConfig(cfg);

        cancelScheduled();
        scheduleTimers(cfg);
    }

    private void cancelScheduled() {
        if (scheduledListing  != null) { scheduledListing.cancel();  scheduledListing  = null; }
        if (scheduledBuying   != null) { scheduledBuying.cancel();   scheduledBuying   = null; }
        if (scheduledReselling != null) { scheduledReselling.cancel(); scheduledReselling = null; }
    }

    private void scheduleTimers(FileConfiguration cfg) {
        // All cycles run on the main thread (AH storage not thread-safe).

        if (cfg.getBoolean("listing.enabled", true)) {
            long ticks = cfg.getLong("listing.interval-seconds", 90) * 20L;
            scheduledListing = getServer().getScheduler()
                    .runTaskTimer(this, listingTask::runCycle, ticks, ticks);
        }

        if (cfg.getBoolean("buying.enabled", true)) {
            long ticks = cfg.getLong("buying.interval-seconds", 60) * 20L;
            scheduledBuying = getServer().getScheduler()
                    .runTaskTimer(this, buyingTask::runCycle, ticks, ticks);
        }

        if (cfg.getBoolean("reselling.enabled", true)) {
            long ticks = cfg.getLong("reselling.interval-seconds", 120) * 20L;
            scheduledReselling = getServer().getScheduler()
                    .runTaskTimer(this, resellingTask::runCycle, ticks, ticks);
        }
    }
}
