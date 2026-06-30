package me.bedsmp.bedahbots;

import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

/**
 * Adds random, item-type-valid enchantments to bot listings.
 *
 * Validity is delegated entirely to {@link Enchantment#canEnchantItem(ItemStack)},
 * the same check vanilla/anvil logic uses — this is what guarantees e.g. Density
 * never lands on a sword, since Density only reports true for a Mace.
 */
public final class EnchantApplier {

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

    /**
     * Randomly enchants the item in place (item-type-valid, conflict-free, varied levels).
     *
     * @return price multiplier to apply on top of the base price (1.0 = no enchants added)
     */
    public double apply(ItemStack item) {
        if (!enabled || item == null) return 1.0;
        if (rng.nextDouble() > itemChance) return 1.0;

        List<Enchantment> candidates = new ArrayList<>();
        for (Enchantment e : Enchantment.values()) {
            if (!allowCurses && e.isCursed()) continue;
            if (!e.canEnchantItem(item)) continue;
            candidates.add(e);
        }
        if (candidates.isEmpty()) return 1.0;
        Collections.shuffle(candidates, rng);

        ItemMeta meta = item.getItemMeta();
        if (meta == null) return 1.0;

        int wanted = 1 + rng.nextInt(maxCount);
        List<Enchantment> chosen = new ArrayList<>();
        double mult = 1.0;

        for (Enchantment e : candidates) {
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
            boolean overleveled = false;
            if (allowOverlevel && overlevelMaxBonus > 0 && rng.nextDouble() < overlevelChance) {
                level += 1 + rng.nextInt(overlevelMaxBonus);
                overleveled = true;
            }

            if (meta.addEnchant(e, level, overleveled)) {
                chosen.add(e);
                mult += level * pricePerLevelMult;
            }
        }

        if (chosen.isEmpty()) return 1.0;
        item.setItemMeta(meta);
        return mult;
    }
}
