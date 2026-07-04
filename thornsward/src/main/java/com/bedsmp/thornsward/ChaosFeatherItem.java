package com.bedsmp.thornsward;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.List;

public final class ChaosFeatherItem {
    public static final String ITEM_ID = "chaos_feather";
    private static final int CUSTOM_MODEL_DATA = 7025;
    private final NamespacedKey key;

    public ChaosFeatherItem(JavaPlugin plugin) { this.key = new NamespacedKey(plugin, ITEM_ID); }
    public NamespacedKey getKey() { return key; }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.FEATHER);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(legacyLine("§d✦ Перо Хаоса §d✦").color(NamedTextColor.LIGHT_PURPLE));
        meta.lore(List.of(
                legacyLine("§7Держите в §bдопслоте§7."),
                legacyLine("§7Каждые §d3 сек §7применяет"),
                legacyLine("§7случайный эффект скорости"),
                legacyLine("§7к вам и всем в радиусе §d10 блоков§7.")
        ));
        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isChaosFeather(ItemStack item) {
        if (item == null || item.getType() == Material.AIR) return false;
        ItemMeta meta = item.getItemMeta();
        if (meta == null) return false;
        return meta.getPersistentDataContainer().has(key, PersistentDataType.BYTE);
    }

    private Component legacyLine(String legacy) {
        return LegacyComponentSerializer.legacySection().deserialize(legacy).decoration(TextDecoration.ITALIC, false);
    }
}
