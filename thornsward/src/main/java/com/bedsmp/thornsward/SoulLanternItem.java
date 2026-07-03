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

public final class SoulLanternItem {

    public static final String ITEM_ID = "soul_lantern";
    private static final int CUSTOM_MODEL_DATA = 7009;

    private final NamespacedKey key;

    public SoulLanternItem(JavaPlugin plugin) {
        this.key = new NamespacedKey(plugin, ITEM_ID);
    }

    public NamespacedKey getKey() { return key; }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.SOUL_LANTERN);
        ItemMeta meta = stack.getItemMeta();

        meta.displayName(legacyLine("§5✦ Фонарь Душ §5✦").color(NamedTextColor.DARK_PURPLE));

        meta.lore(List.of(
                legacyLine("§7ПКМ — активирует ауру на §530 секунд§7."),
                legacyLine("§7В радиусе §55 блоков §7вокруг тебя"),
                legacyLine("§7мобы §5не появляются§7 естественным образом."),
                legacyLine(""),
                legacyLine("§8▶ Держи в руке для активации")
        ));

        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isSoulLantern(ItemStack item) {
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
