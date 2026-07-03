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

public final class ZeusTridentItem {
    public static final String ITEM_ID = "zeus_trident";
    private static final int CUSTOM_MODEL_DATA = 7011;
    private final NamespacedKey key;

    public ZeusTridentItem(JavaPlugin plugin) { this.key = new NamespacedKey(plugin, ITEM_ID); }
    public NamespacedKey getKey() { return key; }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.TRIDENT);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(legacyLine("§b✦ Трезубец Зевса §b✦").color(NamedTextColor.AQUA));
        meta.lore(List.of(
                legacyLine("§7При броске вызывает настоящую молнию"),
                legacyLine("§7в точке попадания."),
                legacyLine(""),
                legacyLine("§8▶ Дождь не нужен"),
                legacyLine("§8▶ Молния наносит урон всем рядом")
        ));
        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isZeusTrident(ItemStack item) {
        if (item == null || item.getType() == Material.AIR) return false;
        ItemMeta meta = item.getItemMeta();
        if (meta == null) return false;
        return meta.getPersistentDataContainer().has(key, PersistentDataType.BYTE);
    }

    private Component legacyLine(String legacy) {
        return LegacyComponentSerializer.legacySection().deserialize(legacy).decoration(TextDecoration.ITALIC, false);
    }
}
