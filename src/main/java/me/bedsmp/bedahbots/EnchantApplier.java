package me.bedsmp.bedahbots;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.EnchantmentStorageMeta;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

/**
 * Adds random, item-type-valid enchantments to bot listings, and stored
 * enchants to bot-listed Enchanted Books.
 *
 * Validity for regular items is delegated entirely to
 * {@link Enchantment#canEnchantItem(ItemStack)}, the same check vanilla/anvil
 * logic uses — this is what guarantees e.g. Density never lands on a sword,
 * since Density only reports true for a Mace. Books can store any enchant.
 */
public final class EnchantApplier {

    private record Pick(Enchantment enchantment, int level) {}

    private final Random rng = new Random();

    private boolean enabled;
    private double itemChance;
    private int maxCount;
    private boolean allowCurses;
    private boolean allowOverlevel;
    private double overlevelChance;
    private int overlevelMaxBonus;
    private double pricePerLevelMult;

    public void reloadConfig(FileConfiguration cfg) {
        ConfigurationSection sec = cfg.getConfigurationSection("enchant");
        enabled            = sec == null || sec.getBoolean("enabled", true);
        itemChance         = cfg.getDouble("enchant.item-chance", 0.35);
        maxCount           = Math.max(1, cfg.getInt("enchant.max-count", 3));
        allowCurses        = cfg.getBoolean("enchant.allow-curses", false);
        allowOverlevel     = cfg.getBoolean("enchant.allow-overlevel", true);
        overlevelChance    = cfg.getDouble("enchant.overlevel-chance", 0.15);
        overlevelMaxBonus  = Math.max(0, cfg.getInt("enchant.overlevel-max-bonus", 2));
        pricePerLevelMult  = cfg.getDouble("enchant.price-per-level-mult", 0.15);
    }

    /** Randomly enchants the item in place, subject to the configured item-chance roll. */
    public double apply(ItemStack item) {
        return apply(item, false);
    }

    /**
     * Randomly enchants the item in place (item-type-valid, conflict-free, varied levels).
     *
     * @param forceAttempt skip the item-chance roll and always try to enchant (used for
     *                     the "gear" bucket of listings, which should almost always end up enchanted)
     * @return price multiplier to apply on top of the base price (1.0 = no enchants added)
     */
    public double apply(ItemStack item, boolean forceAttempt) {
        if (!enabled || item == null) return 1.0;
        if (!forceAttempt && rng.nextDouble() > itemChance) return 1.0;

        List<Enchantment> candidates = new ArrayList<>();
        for (Enchantment e : Enchantment.values()) {
            if (!allowCurses && e.isCursed()) continue;
            if (!e.canEnchantItem(item)) continue;
            candidates.add(e);
        }
        if (candidates.isEmpty()) return 1.0;

        ItemMeta meta = item.getItemMeta();
        if (meta == null) return 1.0;

        double mult = 1.0;
        boolean any = false;
        for (Pick pick : pickEnchants(candidates)) {
            boolean overleveled = pick.level() > pick.enchantment().getMaxLevel();
            if (meta.addEnchant(pick.enchantment(), pick.level(), overleveled)) {
                mult += pick.level() * pricePerLevelMult;
                any = true;
            }
        }
        if (!any) return 1.0;

        item.setItemMeta(meta);
        return mult;
    }

    /**
     * Randomly fills an Enchanted Book with stored enchants (any enchant is valid on a book).
     *
     * @return price multiplier to apply on top of the book's base price (1.0 = no enchants added)
     */
    public double applyToBook(ItemStack book) {
        if (!enabled || book == null) return 1.0;
        ItemMeta meta = book.getItemMeta();
        if (!(meta instanceof EnchantmentStorageMeta esm)) return 1.0;

        List<Enchantment> candidates = new ArrayList<>();
        for (Enchantment e : Enchantment.values()) {
            if (!allowCurses && e.isCursed()) continue;
            candidates.add(e);
        }
        if (candidates.isEmpty()) return 1.0;

        double mult = 1.0;
        boolean any = false;
        for (Pick pick : pickEnchants(candidates)) {
            boolean overleveled = pick.level() > pick.enchantment().getMaxLevel();
            if (esm.addStoredEnchant(pick.enchantment(), pick.level(), overleveled)) {
                mult += pick.level() * pricePerLevelMult;
                any = true;
            }
        }
        if (!any) return 1.0;

        book.setItemMeta(esm);
        return mult;
    }

    /** Picks up to max-count conflict-free enchants from the candidate pool, with varied levels. */
    private List<Pick> pickEnchants(List<Enchantment> candidates) {
        List<Enchantment> shuffled = new ArrayList<>(candidates);
        Collections.shuffle(shuffled, rng);

        int wanted = 1 + rng.nextInt(maxCount);
        List<Enchantment> chosen = new ArrayList<>();
        List<Pick> picks = new ArrayList<>();

        for (Enchantment e : shuffled) {
            if (chosen.size() >= wanted) break;

            boolean conflicts = false;
            for (Enchantment c : chosen) {
                if (e.conflictsWith(c) || c.conflictsWith(e)) {
                    conflicts = true;
                    break;
                }
            }
            if (conflicts) continue;

            int maxLevel = Math.max(1, e.getMaxLevel());
            int level = 1 + rng.nextInt(maxLevel);
            if (allowOverlevel && overlevelMaxBonus > 0 && rng.nextDouble() < overlevelChance) {
                level += 1 + rng.nextInt(overlevelMaxBonus);
            }

            chosen.add(e);
            picks.add(new Pick(e, level));
        }
        return picks;
    }
}
