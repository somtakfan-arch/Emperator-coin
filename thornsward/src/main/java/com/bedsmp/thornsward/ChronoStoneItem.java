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

public final class ChronoStoneItem {
    public static final String ITEM_ID = "chrono_stone";
    private static final int CUSTOM_MODEL_DATA = 7017;
    private final NamespacedKey key;

    public ChronoStoneItem(JavaPlugin plugin) { this.key = new NamespacedKey(plugin, ITEM_ID); }
    public NamespacedKey getKey() { return key; }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.CLOCK);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(legacyLine("§e✦ Хронокамень §e✦").color(NamedTextColor.YELLOW));
        meta.lore(List.of(
                legacyLine("§7ПКМ — замораживает тебя на §e5 сек§7:"),
                legacyLine("§7невидим, неуязвим, не двигаешься."),
                legacyLine("§7После — §aСкорость II§7 на §a3 сек§7."),
                legacyLine(""),
                legacyLine("§c✦ §7Одноразовый — исчезает после использования")
        ));
        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isChronoStone(ItemStack item) {
        if (item == null || item.getType() == Material.AIR) return false;
        ItemMeta meta = item.getItemMeta();
        if (meta == null) return false;
        return meta.getPersistentDataContainer().has(key, PersistentDataType.BYTE);
    }

    private Component legacyLine(String legacy) {
        return LegacyComponentSerializer.legacySection().deserialize(legacy).decoration(TextDecoration.ITALIC, false);
    }
}
