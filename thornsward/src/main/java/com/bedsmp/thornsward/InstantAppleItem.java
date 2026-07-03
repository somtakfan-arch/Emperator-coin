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

public final class InstantAppleItem {

    public static final String ITEM_ID = "instant_apple";
    private static final int CUSTOM_MODEL_DATA = 7007;

    private final NamespacedKey key;

    public InstantAppleItem(JavaPlugin plugin) {
        this.key = new NamespacedKey(plugin, ITEM_ID);
    }

    public NamespacedKey getKey() { return key; }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.ENCHANTED_GOLDEN_APPLE);
        ItemMeta meta = stack.getItemMeta();

        meta.displayName(legacyLine("§6✦ Яблоко Богов §6✦").color(NamedTextColor.GOLD));

        meta.lore(List.of(
                legacyLine("§7Мгновенно восстанавливает голод до максимума."),
                legacyLine("§7Съедается одним кликом — без анимации."),
                legacyLine(""),
                legacyLine("§c✦ §fВозрождение IV §7— 20 сек"),
                legacyLine("§6✦ §fПоглощение IV §7— 2 мин"),
                legacyLine("§a✦ §fСопротивление I §7— 5 мин"),
                legacyLine("§e✦ §fОгнеупорность I §7— 5 мин")
        ));

        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isInstantApple(ItemStack item) {
        if (item == null || item.getType() == Material.AIR) return false;
        ItemMeta meta = item.getItemMeta();
        if (meta == null) return false;
        return meta.getPersistentDataContainer().has(key, PersistentDataType.BYTE);
    }

    private Component legacyLine(String legacy) {
        return LegacyComponentSerializer.legacySection()
                .deserialize(legacy)
                .decoration(TextDecoration.ITALIC, false);
    }
}
