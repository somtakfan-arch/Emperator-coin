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

public final class PhoenixAshItem {
    public static final String ITEM_ID = "phoenix_ash";
    private static final int CUSTOM_MODEL_DATA = 7019;
    private final NamespacedKey key;

    public PhoenixAshItem(JavaPlugin plugin) { this.key = new NamespacedKey(plugin, ITEM_ID); }
    public NamespacedKey getKey() { return key; }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.BLAZE_POWDER);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(legacyLine("§6✦ Пепел Феникса §6✦").color(NamedTextColor.GOLD));
        meta.lore(List.of(
                legacyLine("§7Лежи в инвентаре — при смерти"),
                legacyLine("§7автоматически воскрешает тебя"),
                legacyLine("§7с §c4 ❤§7 на месте гибели."),
                legacyLine(""),
                legacyLine("§c✦ §7Расходуется — один пепел, одно спасение")
        ));
        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isPhoenixAsh(ItemStack item) {
        if (item == null || item.getType() == Material.AIR) return false;
        ItemMeta meta = item.getItemMeta();
        if (meta == null) return false;
        return meta.getPersistentDataContainer().has(key, PersistentDataType.BYTE);
    }

    private Component legacyLine(String legacy) {
        return LegacyComponentSerializer.legacySection().deserialize(legacy).decoration(TextDecoration.ITALIC, false);
    }
}
