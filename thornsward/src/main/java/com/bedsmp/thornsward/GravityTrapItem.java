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

public final class GravityTrapItem {
    public static final String ITEM_ID = "gravity_trap";
    private static final int CUSTOM_MODEL_DATA = 7021;
    private final NamespacedKey key;

    public GravityTrapItem(JavaPlugin plugin) { this.key = new NamespacedKey(plugin, ITEM_ID); }
    public NamespacedKey getKey() { return key; }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.SLIME_BALL);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(legacyLine("§a✦ Ловушка Гравитации §a✦").color(NamedTextColor.GREEN));
        meta.lore(List.of(
                legacyLine("§7ПКМ — бросаешь ловушку."),
                legacyLine("§7При попадании создаёт зону на §a5 сек§7:"),
                legacyLine("§7все существа в радиусе §a4 блоков"),
                legacyLine("§7притягиваются к центру."),
                legacyLine(""),
                legacyLine("§c✦ §7Одноразовый снаряд")
        ));
        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isGravityTrap(ItemStack item) {
        if (item == null || item.getType() == Material.AIR) return false;
        ItemMeta meta = item.getItemMeta();
        if (meta == null) return false;
        return meta.getPersistentDataContainer().has(key, PersistentDataType.BYTE);
    }

    private Component legacyLine(String legacy) {
        return LegacyComponentSerializer.legacySection().deserialize(legacy).decoration(TextDecoration.ITALIC, false);
    }
}
