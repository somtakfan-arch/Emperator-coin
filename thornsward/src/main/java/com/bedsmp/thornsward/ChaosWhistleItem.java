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

public final class ChaosWhistleItem {
    public static final String ITEM_ID = "chaos_whistle";
    private static final int CUSTOM_MODEL_DATA = 7022;
    private final NamespacedKey key;

    public ChaosWhistleItem(JavaPlugin plugin) { this.key = new NamespacedKey(plugin, ITEM_ID); }
    public NamespacedKey getKey() { return key; }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.NAUTILUS_SHELL);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(legacyLine("§5✦ Свисток Хаоса §5✦").color(NamedTextColor.DARK_PURPLE));
        meta.lore(List.of(
                legacyLine("§7ПКМ — вызывает случайного моба"),
                legacyLine("§7прямо рядом с ближайшим"),
                legacyLine("§7игроком-врагом."),
                legacyLine(""),
                legacyLine("§8⏱ Кулдаун: §730 сек")
        ));
        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isChaosWhistle(ItemStack item) {
        if (item == null || item.getType() == Material.AIR) return false;
        ItemMeta meta = item.getItemMeta();
        if (meta == null) return false;
        return meta.getPersistentDataContainer().has(key, PersistentDataType.BYTE);
    }

    private Component legacyLine(String legacy) {
        return LegacyComponentSerializer.legacySection().deserialize(legacy).decoration(TextDecoration.ITALIC, false);
    }
}
