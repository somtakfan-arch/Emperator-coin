package me.bedsmp.bedahbots.task;

import me.bedsmp.bedahbots.BotManager;
import me.bedsmp.bedahbots.BotStock;
import me.bedsmp.bedahbots.NoteForger;
import me.bedsmp.bedahbots.WorthLoader;
import org.bukkit.Material;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.List;
import java.util.Random;
import java.util.UUID;
import java.util.logging.Logger;

/** Timer C — relists items from bot stock with a markup. */
public final class ResellingTask {

    private final JavaPlugin plugin;
    private final BotManager botManager;
    private final WorthLoader worth;
    private final BotStock stock;
    private final Logger log;
    private final Random rng = new Random();

    private int perCycle;
    private int maxBotListings;
    private long listingHours;
    private double markupMin;
    private double markupMax;
    private double minPrice;
    private double roundTo;

    public ResellingTask(JavaPlugin plugin, BotManager botManager, WorthLoader worth, BotStock stock) {
        this.plugin = plugin;
        this.botManager = botManager;
        this.worth = worth;
        this.stock = stock;
        this.log = plugin.getLogger();
    }

    public void reloadConfig(FileConfiguration cfg) {
        perCycle       = cfg.getInt("reselling.per-cycle", 4);
        maxBotListings = cfg.getInt("listing.max-bot-listings", 40);
        listingHours   = cfg.getLong("listing.listing-hours", 12);
        markupMin      = cfg.getDouble("reselling.markup-min", 1.20);
        markupMax      = cfg.getDouble("reselling.markup-max", 1.55);
        minPrice       = cfg.getDouble("pricing.min-price", 1.0);
        roundTo        = cfg.getDouble("pricing.round-to", 0.01);
    }

    /** Called by the scheduler and by /ahbots resell. Runs on the main thread. */
    public void runCycle() {
        int slots = maxBotListings - botManager.totalBotListings();
        if (slots <= 0 || stock.size() == 0) return;

        final int toResell = Math.min(perCycle, slots);
        List<ItemStack> items = stock.take(toResell);

        // Stagger each relist 20 ticks (1 s) apart; saveNotes() once after the last one.
        for (int i = 0; i < items.size(); i++) {
            final ItemStack item = items.get(i);
            final boolean isLast = (i == items.size() - 1);
            plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
                try {
                    relistItem(item);
                } catch (Exception e) {
                    stock.addItem(item);
                    log.warning("ResellingTask: failed to relist " + item.getType() + " — " + e.getMessage());
                }
                if (isLast) {
                    NoteForger.saveNotes(log);
                }
            }, (long) i * 20L);
        }
    }

    private void relistItem(ItemStack item) throws Exception {
        Material mat = item.getType();
        double unitWorth = worth.getWorth(mat);
        if (unitWorth <= 0) {
            stock.addItem(item);
            return;
        }

        double markup = markupMin + rng.nextDouble() * (markupMax - markupMin);
        double price = roundPrice(unitWorth * item.getAmount() * markup);
        price = Math.max(price, minPrice);

        String botName = botManager.randomName();
        UUID botUUID = botManager.uuidFor(botName);
        String displayName = botManager.displayName(botName);

        NoteForger.forge(botUUID, displayName, item, price, listingHours, log);
        log.info("[Reselling] " + botName + " перепродаёт " + item.getAmount() + "x " + mat.name()
                + " за " + String.format("%.2f", price)
                + " (наценка x" + String.format("%.2f", markup) + ")");
    }

    private double roundPrice(double price) {
        if (roundTo <= 0) return price;
        return Math.round(price / roundTo) * roundTo;
    }
}
