package com.bedsmp.thornsward;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.List;

/**
 * Создание и распознавание предмета "Меч Кристаллера".
 * Принадлежность определяется ИСКЛЮЧИТЕЛЬНО через PersistentDataContainer.
 */
public final class CrystallerSwordItem {

    public static final String ITEM_ID = "crystaller_sword";
    private static final int CUSTOM_MODEL_DATA = 7002;

    private final NamespacedKey key;

    public CrystallerSwordItem(JavaPlugin plugin) {
        this.key = new NamespacedKey(plugin, ITEM_ID);
    }

    public NamespacedKey getKey() {
        return key;
    }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.NETHERITE_SWORD);
        ItemMeta meta = stack.getItemMeta();

        meta.displayName(legacyLine("§d✦ Меч Кристаллера §d✦").color(NamedTextColor.LIGHT_PURPLE));

        meta.lore(List.of(
                legacyLine("§7При ударе подбрасывает противника"),
                legacyLine("§7на 2 блока вверх без отброса в сторону."),
                legacyLine("§7Зачарован Остротой V.")
        ));

        meta.addEnchant(Enchantment.SHARPNESS, 5, true);
        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);

        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isCrystallerSword(ItemStack item) {
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
