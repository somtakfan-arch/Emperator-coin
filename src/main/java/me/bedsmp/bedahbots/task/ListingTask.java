package me.bedsmp.bedahbots.task;

import me.bedsmp.bedahbots.BotManager;
import me.bedsmp.bedahbots.CustomItemLoader;
import me.bedsmp.bedahbots.EnchantApplier;
import me.bedsmp.bedahbots.NamedItemLoader;
import me.bedsmp.bedahbots.GrokParser.EnchantPick;
import me.bedsmp.bedahbots.MetaEnchantCache;
import me.bedsmp.bedahbots.NoteForger;
import me.bedsmp.bedahbots.WorthLoader;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.Registry;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.inventory.meta.PotionMeta;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.potion.PotionType;

import java.util.*;
import java.util.logging.Logger;

/** Timer A — lists new bot lots on /ah. */
public final class ListingTask {

    private final JavaPlugin plugin;
    private final BotManager botManager;
    private final WorthLoader worth;
    private final EnchantApplier enchant;
    private final MetaEnchantCache metaCache;
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
    private double potionChance;
    private double customChance;
    private double namedChance;
    private double metaEnchantChance;
    private Set<Material> whitelist;
    private Set<Material> blacklist;
    private final List<PotionCfg> potionPool = new ArrayList<>();
    private final CustomItemLoader customLoader;
    private final NamedItemLoader namedLoader;

    private record PotionCfg(PotionType type, Material form, double price) {}

    public ListingTask(JavaPlugin plugin, BotManager botManager, WorthLoader worth,
                       EnchantApplier enchant, MetaEnchantCache metaCache) {
        this.plugin = plugin;
        this.botManager = botManager;
        this.worth = worth;
        this.enchant = enchant;
        this.metaCache = metaCache;
        this.log = plugin.getLogger();
        this.customLoader = new CustomItemLoader(plugin);
        this.namedLoader  = new NamedItemLoader(plugin);
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
        gearChance        = cfg.getDouble("listing.gear-chance", 0.80);
        bookChance        = cfg.getDouble("listing.book-chance", 0.15);
        potionChance      = cfg.getDouble("listing.potion-chance", 0.0);
        customChance      = cfg.getDouble("custom-items.custom-chance", 0.0);
        namedChance       = cfg.getDouble("named-items.chance", 0.0);
        metaEnchantChance = cfg.getDouble("listing.meta-enchant-chance", 0.50);
        whitelist = parseMaterials(cfg.getStringList("listing.whitelist"));
        blacklist = parseMaterials(cfg.getStringList("listing.blacklist"));

        potionPool.clear();
        if (cfg.getBoolean("pvp-potions.enabled", false)) {
            for (Map<?, ?> rawEntry : cfg.getMapList("pvp-potions.types")) {
                @SuppressWarnings("unchecked")
                Map<String, Object> entry = (Map<String, Object>) rawEntry;
                String typeName = String.valueOf(entry.getOrDefault("potion-type", "")).toUpperCase();
                String form     = String.valueOf(entry.getOrDefault("form", "splash")).toLowerCase();
                double price    = Double.parseDouble(String.valueOf(entry.getOrDefault("price", "1000")));
                PotionType pt   = Registry.POTION.get(NamespacedKey.minecraft(typeName.toLowerCase()));
                if (pt == null) { log.warning("ListingTask: неизвестный тип зелья '" + typeName + "'"); continue; }
                Material mat = switch (form) {
                    case "lingering" -> Material.LINGERING_POTION;
                    case "drinkable" -> Material.POTION;
                    default          -> Material.SPLASH_POTION;
                };
                potionPool.add(new PotionCfg(pt, mat, price));
            }
            log.info("ListingTask: загружено " + potionPool.size() + " типов зелий.");
        }

        customLoader.reload(cfg);
        namedLoader.reload(cfg);
    }

    private Set<Material> parseMaterials(List<String> names) {
        Set<Material> set = new HashSet<>();
        for (String s : names) {
            Material m = Material.matchMaterial(s);
            if (m != null) set.add(m);
        }
        return set;
    }

    /** Returns keys of all loaded custom + named items (for tab-completion). */
    public List<String> customItemKeys() {
        List<String> keys = new ArrayList<>();
        customLoader.getItems().forEach(e -> keys.add(e.key()));
        namedLoader.getItems().forEach(e -> keys.add(e.key()));
        return keys;
    }

    /**
     * Force-lists a specific item by key (searches custom then named loaders).
     * Returns true on success, false if key was not found.
     */
    public boolean forceCustomListing(String key) throws Exception {
        // Search CustomItemLoader first
        for (var e : customLoader.getItems()) {
            if (e.key().equalsIgnoreCase(key)) {
                return forgeEntry(e.key(), e.item().clone(), e.price());
            }
        }
        // Then NamedItemLoader
        for (var e : namedLoader.getItems()) {
            if (e.key().equalsIgnoreCase(key)) {
                return forgeEntry(e.key(), e.item().clone(), e.price());
            }
        }
        return false;
    }

    private boolean forgeEntry(String key, ItemStack item, double basePrice) throws Exception {
        double price = roundPrice(basePrice * pickMultiplier());
        price = Math.max(price, minPrice);
        String botName     = botManager.randomName();
        UUID botUUID       = botManager.uuidFor(botName);
        String displayName = botManager.displayName(botName);
        NoteForger.forge(botUUID, displayName, item, price, listingHours, log);
        log.info("[Listing] addcustom: " + botName + " выставил [" + key + "] за "
                + String.format("%.2f", price));
        return true;
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
                || n.endsWith("_SHOVEL") || n.endsWith("_HOE") || n.endsWith("_SPEAR")
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
        if (!customLoader.isEmpty() && rng.nextDouble() < customChance) {
            createCustomListing();
            return;
        }
        if (!namedLoader.isEmpty() && rng.nextDouble() < namedChance) {
            createNamedListing();
            return;
        }
        if (!potionPool.isEmpty() && rng.nextDouble() < potionChance) {
            createPotionListing();
            return;
        }
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
        double enchantMult;
        boolean usedMeta = false;
        if (wantGear && metaCache.has(mat) && rng.nextDouble() < metaEnchantChance) {
            enchantMult = applyMetaEnchants(item, metaCache.getFor(mat));
            usedMeta = enchantMult > 1.0;
        } else {
            enchantMult = enchant.apply(item, wantGear);
        }

        double price = roundPrice(worthPerUnit * amount * multiplier * enchantMult);
        price = Math.max(price, minPrice);

        String botName = botManager.randomName();
        UUID botUUID = botManager.uuidFor(botName);
        String displayName = botManager.displayName(botName);

        NoteForger.forge(botUUID, displayName, item, price, listingHours, log);
        log.info("[Listing] " + botName + " выставил " + amount + "x " + mat.name()
                + (usedMeta ? " (мета-чары)" : enchantMult > 1.0 ? " (с чарами)" : "")
                + " за " + String.format("%.2f", price));
    }

    private double applyMetaEnchants(ItemStack item, List<EnchantPick> picks) {
        ItemMeta meta = item.getItemMeta();
        if (meta == null) return 1.0;
        double mult = 1.0;
        boolean any = false;
        for (EnchantPick pick : picks) {
            boolean overLevel = pick.level() > pick.enchantment().getMaxLevel();
            if (meta.addEnchant(pick.enchantment(), pick.level(), overLevel)) {
                mult += pick.level() * 0.15;
                any = true;
            }
        }
        if (!any) return 1.0;
        item.setItemMeta(meta);
        return mult;
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

    private void createCustomListing() throws Exception {
        var entries = customLoader.getItems();
        var entry = entries.get(rng.nextInt(entries.size()));
        ItemStack item = entry.item().clone();

        double price = roundPrice(entry.price() * pickMultiplier());
        price = Math.max(price, minPrice);

        String botName     = botManager.randomName();
        UUID botUUID       = botManager.uuidFor(botName);
        String displayName = botManager.displayName(botName);

        NoteForger.forge(botUUID, displayName, item, price, listingHours, log);
        log.info("[Listing] " + botName + " выставил кастомный предмет [" + entry.key() + "] за "
                + String.format("%.2f", price));
    }

    private void createNamedListing() throws Exception {
        var entries = namedLoader.getItems();
        var entry = entries.get(rng.nextInt(entries.size()));
        ItemStack item = entry.item().clone();

        double price = roundPrice(entry.price() * pickMultiplier());
        price = Math.max(price, minPrice);

        String botName     = botManager.randomName();
        UUID botUUID       = botManager.uuidFor(botName);
        String displayName = botManager.displayName(botName);

        NoteForger.forge(botUUID, displayName, item, price, listingHours, log);
        log.info("[Listing] " + botName + " выставил именной предмет [" + entry.key() + "] за "
                + String.format("%.2f", price));
    }

    private void createPotionListing() throws Exception {
        PotionCfg pc = potionPool.get(rng.nextInt(potionPool.size()));
        ItemStack item = new ItemStack(pc.form(), 1);
        PotionMeta meta = (PotionMeta) item.getItemMeta();
        if (meta == null) return;
        meta.setBasePotionType(pc.type());
        item.setItemMeta(meta);

        double price = roundPrice(pc.price() * pickMultiplier());
        price = Math.max(price, minPrice);

        String botName    = botManager.randomName();
        UUID botUUID      = botManager.uuidFor(botName);
        String displayName = botManager.displayName(botName);

        NoteForger.forge(botUUID, displayName, item, price, listingHours, log);
        log.info("[Listing] " + botName + " выставил " + pc.form().name()
                + " [" + pc.type().getKey().getKey() + "] за " + String.format("%.2f", price));
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
