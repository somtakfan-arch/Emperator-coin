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

public final class ThiefsHoodItem {
    public static final String ITEM_ID = "thiefs_hood";
    private static final int CUSTOM_MODEL_DATA = 7016;
    private final NamespacedKey key;

    public ThiefsHoodItem(JavaPlugin plugin) { this.key = new NamespacedKey(plugin, ITEM_ID); }
    public NamespacedKey getKey() { return key; }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.LEATHER_HELMET);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(legacyLine("§9✦ Капюшон Вора §9✦").color(NamedTextColor.BLUE));
        meta.lore(List.of(
                legacyLine("§7При смертельном ударе §cодин раз§7:"),
                legacyLine("§7телепортирует на §915 блоков§7 в сторону"),
                legacyLine("§7и оставляет тебя с §c2 ❤§7."),
                legacyLine(""),
                legacyLine("§c✦ §7Расходуется навсегда — §cодноразовый"),
                legacyLine("§8▶ Надень на голову")
        ));
        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isThiefsHood(ItemStack item) {
        if (item == null || item.getType() == Material.AIR) return false;
        ItemMeta meta = item.getItemMeta();
        if (meta == null) return false;
        return meta.getPersistentDataContainer().has(key, PersistentDataType.BYTE);
    }

    private Component legacyLine(String legacy) {
        return LegacyComponentSerializer.legacySection().deserialize(legacy).decoration(TextDecoration.ITALIC, false);
    }
}
