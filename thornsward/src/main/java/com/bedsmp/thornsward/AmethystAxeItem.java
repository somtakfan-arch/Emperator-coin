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

/**
 * Создание и распознавание предмета "Топор Аметиста".
 * Принадлежность определяется ИСКЛЮЧИТЕЛЬНО через PersistentDataContainer.
 */
public final class AmethystAxeItem {

    public static final String ITEM_ID = "amethyst_axe";
    private static final int CUSTOM_MODEL_DATA = 7003;

    private final NamespacedKey key;

    public AmethystAxeItem(JavaPlugin plugin) {
        this.key = new NamespacedKey(plugin, ITEM_ID);
    }

    public NamespacedKey getKey() {
        return key;
    }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.NETHERITE_AXE);
        ItemMeta meta = stack.getItemMeta();

        meta.displayName(legacyLine("§5✦ Топор Аметиста §5✦").color(NamedTextColor.DARK_PURPLE));

        meta.lore(List.of(
                legacyLine("§7Срубает дерево целиком —"),
                legacyLine("§7все соединённые брёвна за один удар."),
                legacyLine("§8(не затрагивает доски и другие блоки)")
        ));

        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);

        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isAmethystAxe(ItemStack item) {
        if (item == null || item.getType() == Material.AIR) {
            return false;
        }
        ItemMeta meta = item.getItemMeta();
        if (meta == null) {
            return false;
        }
        return meta.getPersistentDataContainer().has(key, PersistentDataType.BYTE);
    }

    private Component legacyLine(String legacy) {
        return LegacyComponentSerializer.legacySection()
                .deserialize(legacy)
                .decoration(TextDecoration.ITALIC, false);
    }
}
