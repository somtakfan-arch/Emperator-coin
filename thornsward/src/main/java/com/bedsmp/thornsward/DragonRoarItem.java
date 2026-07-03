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

public final class DragonRoarItem {
    public static final String ITEM_ID = "dragon_roar";
    private static final int CUSTOM_MODEL_DATA = 7010;
    private final NamespacedKey key;

    public DragonRoarItem(JavaPlugin plugin) { this.key = new NamespacedKey(plugin, ITEM_ID); }
    public NamespacedKey getKey() { return key; }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.MACE);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(legacyLine("§4✦ Рёв Дракона §4✦").color(NamedTextColor.DARK_RED));
        meta.lore(List.of(
                legacyLine("§7Удар создаёт ударную волну:"),
                legacyLine("§7все игроки в радиусе §c5 блоков"),
                legacyLine("§7взлетают вверх и падают."),
                legacyLine(""),
                legacyLine("§8▶ Ты сам не получаешь урона от волны")
        ));
        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isDragonRoar(ItemStack item) {
        if (item == null || item.getType() == Material.AIR) return false;
        ItemMeta meta = item.getItemMeta();
        if (meta == null) return false;
        return meta.getPersistentDataContainer().has(key, PersistentDataType.BYTE);
    }

    private Component legacyLine(String legacy) {
        return LegacyComponentSerializer.legacySection().deserialize(legacy).decoration(TextDecoration.ITALIC, false);
    }
}
