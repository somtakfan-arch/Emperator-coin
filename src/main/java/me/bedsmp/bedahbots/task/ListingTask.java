package me.bedsmp.bedahbots.task;

import me.bedsmp.bedahbots.BotManager;
import me.bedsmp.bedahbots.NoteForger;
import me.bedsmp.bedahbots.WorthLoader;
import org.bukkit.Material;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.*;
import java.util.logging.Logger;

/** Timer A — lists new bot lots on /ah. */
public final class ListingTask {

    private final JavaPlugin plugin;
    private final BotManager botManager;
    private final WorthLoader worth;
    private final Logger log;
    private final Random rng = new Random();

    private int perCycle;
    private int maxBotListings;
    private long listingHours;
    private int amountMin;
    private int amountMax;
    private double normalMultMin;
    private double normalMultMax;
    private double overpriceChance;
    private double overpriceMultMin;
    private double overpriceMultMax;
    private double minPrice;
    private double roundTo;
    private Set<Material> whitelist;
    private Set<Material> blacklist;

    public ListingTask(JavaPlugin plugin, BotManager botManager, WorthLoader worth) {
        this.plugin = plugin;
        this.botManager = botManager;
        this.worth = worth;
        this.log = plugin.getLogger();
        this.whitelist = new HashSet<>();
        this.blacklist = new HashSet<>();
    }

    public void reloadConfig(FileConfiguration cfg) {
        perCycle       = cfg.getInt("listing.per-cycle", 2);
        maxBotListings = cfg.getInt("listing.max-bot-listings", 40);
        listingHours   = cfg.getLong("listing.listing-hours", 12);
        amountMin      = Math.max(1, cfg.getInt("listing.amount-min", 1));
        amountMax      = Math.max(amountMin, cfg.getInt("listing.amount-max", 16));
        normalMultMin    = cfg.getDouble("listing.normal-mult-min", 0.90);
        normalMultMax    = cfg.getDouble("listing.normal-mult-max", 1.35);
        overpriceChance  = cfg.getDouble("listing.overprice-chance", 0.12);
        overpriceMultMin = cfg.getDouble("listing.overprice-mult-min", 1.60);
        overpriceMultMax = cfg.getDouble("listing.overprice-mult-max", 2.30);
        minPrice = cfg.getDouble("pricing.min-price", 1.0);
        roundTo  = cfg.getDouble("pricing.round-to", 0.01);
        whitelist = parseMaterials(cfg.getStringList("listing.whitelist"));
        blacklist = parseMaterials(cfg.getStringList("listing.blacklist"));
    }

    private Set<Material> parseMaterials(List<String> names) {
        Set<Material> set = new HashSet<>();
        for (String s : names) {
            Material m = Material.matchMaterial(s);
            if (m != null) set.add(m);
        }
        return set;
    }

    /** Called by the scheduler and by /ahbots seed. Runs on the main thread. */
    public void runCycle() {
        int current = botManager.totalBotListings();
        int slots = maxBotListings - current;
        if (slots <= 0) return;

        List<Material> candidates = buildCandidates();
        if (candidates.isEmpty()) return;

        int toCreate = Math.min(perCycle, slots);
        for (int i = 0; i < toCreate; i++) {
            try {
                createOneListing(candidates);
            } catch (Exception e) {
                log.warning("ListingTask: failed to create listing — " + e.getMessage());
            }
        }
    }

    private List<Material> buildCandidates() {
        List<Material> all = worth.knownMaterials();
        List<Material> result = new ArrayList<>();
        for (Material m : all) {
            if (!blacklist.isEmpty() && blacklist.contains(m)) continue;
            if (!whitelist.isEmpty() && !whitelist.contains(m)) continue;
            result.add(m);
        }
        return result;
    }

    private void createOneListing(List<Material> candidates) throws Exception {
        Material mat = candidates.get(rng.nextInt(candidates.size()));
        int amount = amountMin + (amountMax > amountMin ? rng.nextInt(amountMax - amountMin + 1) : 0);
        amount = Math.min(amount, mat.getMaxStackSize());
        if (amount < 1) amount = 1;

        double worthPerUnit = worth.getWorth(mat);
        double multiplier = pickMultiplier();
        double price = roundPrice(worthPerUnit * amount * multiplier);
        price = Math.max(price, minPrice);

        String botName = botManager.randomName();
        UUID botUUID = botManager.uuidFor(botName);
        String displayName = botManager.displayName(botName);

        ItemStack item = new ItemStack(mat, amount);
        NoteForger.forge(botUUID, displayName, item, price, listingHours, log);
    }

    private double pickMultiplier() {
        if (rng.nextDouble() < overpriceChance) {
            return overpriceMultMin + rng.nextDouble() * (overpriceMultMax - overpriceMultMin);
        }
        return normalMultMin + rng.nextDouble() * (normalMultMax - normalMultMin);
    }

    private double roundPrice(double price) {
        if (roundTo <= 0) return price;
        return Math.round(price / roundTo) * roundTo;
    }
}
