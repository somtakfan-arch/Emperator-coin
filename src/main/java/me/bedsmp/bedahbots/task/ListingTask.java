package me.bedsmp.bedahbots.task;

import me.bedsmp.bedahbots.BotManager;
import me.bedsmp.bedahbots.EnchantApplier;
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
    private final EnchantApplier enchant;
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
    private double gearChance;
    private double bookChance;
    private Set<Material> whitelist;
    private Set<Material> blacklist;

    public ListingTask(JavaPlugin plugin, BotManager botManager, WorthLoader worth, EnchantApplier enchant) {
        this.plugin = plugin;
        this.botManager = botManager;
        this.worth = worth;
        this.enchant = enchant;
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
        gearChance = cfg.getDouble("listing.gear-chance", 0.80);
        bookChance = cfg.getDouble("listing.book-chance", 0.15);
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

        List<Material> gearCandidates = candidates.stream().filter(this::isGearMaterial).toList();
        List<Material> resourceCandidates = candidates.stream().filter(m -> !isGearMaterial(m)).toList();

        int toCreate = Math.min(perCycle, slots);
        for (int i = 0; i < toCreate; i++) {
            try {
                createOneListing(candidates, gearCandidates, resourceCandidates);
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

    /** Weapons/tools/armor that vanilla enchantments can actually land on. */
    private boolean isGearMaterial(Material m) {
        String n = m.name();
        if (n.endsWith("_SWORD") || n.endsWith("_AXE") || n.endsWith("_PICKAXE")
                || n.endsWith("_SHOVEL") || n.endsWith("_HOE")
                || n.endsWith("_HELMET") || n.endsWith("_CHESTPLATE")
                || n.endsWith("_LEGGINGS") || n.endsWith("_BOOTS")) {
            return true;
        }
        return switch (m) {
            case BOW, CROSSBOW, TRIDENT, SHIELD, MACE, ELYTRA,
                    FISHING_ROD, FLINT_AND_STEEL, SHEARS,
                    CARROT_ON_A_STICK, WARPED_FUNGUS_ON_A_STICK -> true;
            default -> false;
        };
    }

    private void createOneListing(List<Material> candidates, List<Material> gearCandidates,
                                  List<Material> resourceCandidates) throws Exception {
        if (rng.nextDouble() < bookChance) {
            createBookListing();
            return;
        }

        boolean wantGear = rng.nextDouble() < gearChance;
        List<Material> pool = candidates;
        if (wantGear && !gearCandidates.isEmpty()) {
            pool = gearCandidates;
        } else if (!wantGear && !resourceCandidates.isEmpty()) {
            pool = resourceCandidates;
        }

        Material mat = pool.get(rng.nextInt(pool.size()));
        int amount = amountMin + (amountMax > amountMin ? rng.nextInt(amountMax - amountMin + 1) : 0);
        amount = Math.min(amount, mat.getMaxStackSize());
        if (amount < 1) amount = 1;

        double worthPerUnit = worth.getWorth(mat);
        double multiplier = pickMultiplier();

        ItemStack item = new ItemStack(mat, amount);
        double enchantMult = enchant.apply(item, wantGear);

        double price = roundPrice(worthPerUnit * amount * multiplier * enchantMult);
        price = Math.max(price, minPrice);

        String botName = botManager.randomName();
        UUID botUUID = botManager.uuidFor(botName);
        String displayName = botManager.displayName(botName);

        NoteForger.forge(botUUID, displayName, item, price, listingHours, log);
        log.info("[Listing] " + botName + " выставил " + amount + "x " + mat.name()
                + (enchantMult > 1.0 ? " (с чарами)" : "")
                + " за " + String.format("%.2f", price));
    }

    private void createBookListing() throws Exception {
        double baseWorth = worth.getWorth(Material.ENCHANTED_BOOK);
        if (baseWorth <= 0) baseWorth = 5.0;

        ItemStack book = new ItemStack(Material.ENCHANTED_BOOK, 1);
        double enchantMult = enchant.applyToBook(book);
        if (enchantMult <= 1.0) return; // didn't land any enchant — don't sell a blank book

        double price = roundPrice(baseWorth * enchantMult);
        price = Math.max(price, minPrice);

        String botName = botManager.randomName();
        UUID botUUID = botManager.uuidFor(botName);
        String displayName = botManager.displayName(botName);

        NoteForger.forge(botUUID, displayName, book, price, listingHours, log);
        log.info("[Listing] " + botName + " выставил зачарованную книгу за " + String.format("%.2f", price));
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
