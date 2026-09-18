package ru.bedsmp.notridents;

import io.papermc.paper.registry.RegistryAccess;
import io.papermc.paper.registry.RegistryKey;
import org.bukkit.NamespacedKey;
import org.bukkit.Registry;
import org.bukkit.enchantments.Enchantment;

import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.logging.Logger;

/** Какие чары снимать: весь список из конфига либо вообще все. */
public final class EnchantmentFilter {

    private final boolean all;
    private final Set<Enchantment> enchantments;

    private EnchantmentFilter(boolean all, Set<Enchantment> enchantments) {
        this.all = all;
        this.enchantments = enchantments;
    }

    public static EnchantmentFilter resolve(boolean all, List<String> keys, Logger logger) {
        Set<Enchantment> resolved = new HashSet<>();
        if (!all && keys != null) {
            Registry<Enchantment> registry = RegistryAccess.registryAccess().getRegistry(RegistryKey.ENCHANTMENT);
            for (String raw : keys) {
                if (raw == null || raw.isBlank()) continue;
                NamespacedKey key = NamespacedKey.fromString(raw.trim().toLowerCase(Locale.ROOT));
                Enchantment enchantment = key == null ? null : registry.get(key);
                if (enchantment == null) {
                    logger.warning("Неизвестные чары в enchantments.list: " + raw + " — пропущены.");
                    continue;
                }
                resolved.add(enchantment);
            }
        }
        return new EnchantmentFilter(all, resolved);
    }

    public boolean all() {
        return all;
    }

    public boolean isEmpty() {
        return !all && enchantments.isEmpty();
    }

    public int size() {
        return all ? -1 : enchantments.size();
    }

    public boolean matches(Enchantment enchantment) {
        return all || enchantments.contains(enchantment);
    }
}
