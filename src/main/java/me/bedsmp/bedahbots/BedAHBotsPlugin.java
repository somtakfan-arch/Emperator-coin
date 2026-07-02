package me.bedsmp.bedahbots;

import me.bedsmp.bedahbots.command.AhBotsCommand;
import me.bedsmp.bedahbots.task.BuyingTask;
import me.bedsmp.bedahbots.task.ListingTask;
import me.bedsmp.bedahbots.task.ResellingTask;
import me.elaineqheart.auctionHouse.data.ram.AuctionHouseStorage;
import me.elaineqheart.auctionHouse.data.ram.ItemNote;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import org.bukkit.Material;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public final class BedAHBotsPlugin extends JavaPlugin {

    private BotManager botManager;
    private WorthLoader worthLoader;
    private BotStock stock;
    private EnchantApplier enchantApplier;
    private MetaEnchantCache metaEnchantCache;
    private GrokPriceCache grokPriceCache;
    private ChatRequestListener chatRequestListener;

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
        try {
            Class.forName("me.elaineqheart.auctionHouse.data.ram.AuctionHouseStorage");
        } catch (ClassNotFoundException e) {
            getLogger().severe("═══════════════════════════════════════════════");
            getLogger().severe("  AuctionHouse не найден или не загрузился!");
            getLogger().severe("  Убедись что AuctionHouse.jar установлен и");
            getLogger().severe("  отображается зелёным в /plugins.");
            getLogger().severe("  BedAHBots отключается.");
            getLogger().severe("═══════════════════════════════════════════════");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        saveDefaultConfig();

        botManager     = new BotManager();
        worthLoader    = new WorthLoader(this);
        stock          = new BotStock(this);
        enchantApplier   = new EnchantApplier();
        metaEnchantCache = new MetaEnchantCache(this);
        grokPriceCache   = new GrokPriceCache(this);
        worthLoader.setGrokPriceCache(grokPriceCache);

        stock.init();

        listingTask          = new ListingTask(this, botManager, worthLoader, enchantApplier, metaEnchantCache);
        buyingTask           = new BuyingTask(this, botManager, worthLoader, stock);
        resellingTask        = new ResellingTask(this, botManager, worthLoader, stock);
        chatRequestListener  = new ChatRequestListener(this, botManager, worthLoader);
        getServer().getPluginManager().registerEvents(chatRequestListener, this);

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
        worthLoader.loadExtraWorth(cfg);

        enchantApplier.reloadConfig(cfg);
        metaEnchantCache.reloadConfig(cfg);
        metaEnchantCache.triggerRefresh();

        double grokThreshold = cfg.getDouble("pricing.grok-override-below", 100.0);
        worthLoader.setGrokOverrideBelow(grokThreshold);
        grokPriceCache.reloadConfig(cfg);
        // Feed Grok: only worth.yml items priced below threshold (extra-worth already has config prices)
        List<Material> toPrice = worthLoader.cheapWorthMaterials(grokThreshold);
        grokPriceCache.triggerRefresh(toPrice);
        chatRequestListener.reloadConfig(cfg);

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

    /** Deletes every currently active AH lot owned by a bot. Returns the number removed. */
    public int clearBotListings() {
        List<ItemNote> toDelete = new ArrayList<>();
        try {
            for (ItemNote note : AuctionHouseStorage.getAll()) {
                try {
                    UUID uuid = note.getPlayerUUID();
                    if (uuid != null && botManager.isBotUUID(uuid)) toDelete.add(note);
                } catch (Throwable t) {
                    getLogger().warning("clearBotListings: skip note — " + t.getMessage());
                }
            }
        } catch (Throwable t) {
            getLogger().warning("clearBotListings: getAll() failed — " + t.getMessage());
        }
        int removed = 0;
        for (ItemNote note : toDelete) {
            try {
                NoteForger.deleteNote(note, getLogger());
                removed++;
            } catch (Throwable t) {
                getLogger().warning("clearBotListings: deleteNote failed — " + t.getMessage());
            }
        }
        return removed;
    }

    /** Deletes ALL currently active AH lots regardless of owner. Returns the number removed. */
    public int clearAllListings() {
        List<ItemNote> toDelete;
        try {
            toDelete = new ArrayList<>(AuctionHouseStorage.getAll());
        } catch (Throwable t) {
            getLogger().warning("clearAllListings: getAll() failed — " + t.getMessage());
            return 0;
        }
        int removed = 0;
        for (ItemNote note : toDelete) {
            try {
                NoteForger.deleteNote(note, getLogger());
                removed++;
            } catch (Throwable t) {
                getLogger().warning("clearAllListings: deleteNote failed — " + t.getMessage());
            }
        }
        return removed;
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
