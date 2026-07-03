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

public final class RevengeThornItem {

    public static final String ITEM_ID = "revenge_thorn";
    private static final int CUSTOM_MODEL_DATA = 7008;

    private final NamespacedKey key;

    public RevengeThornItem(JavaPlugin plugin) {
        this.key = new NamespacedKey(plugin, ITEM_ID);
    }

    public NamespacedKey getKey() { return key; }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.IRON_CHESTPLATE);
        ItemMeta meta = stack.getItemMeta();

        meta.displayName(legacyLine("§c✦ Шип Возмездия §c✦").color(NamedTextColor.RED));

        meta.lore(List.of(
                legacyLine("§7Запоминает последнего ударившего тебя игрока."),
                legacyLine("§7ПКМ пустой рукой — телепортация к нему"),
                legacyLine("§7на расстояние §c3 блоков§7. Радиус действия: §c50 блоков§7."),
                legacyLine(""),
                legacyLine("§8⏱ Кулдаун: §720 сек"),
                legacyLine("§8▶ Надень на грудь — пассивно работает")
        ));

        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isRevengeThorn(ItemStack item) {
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
