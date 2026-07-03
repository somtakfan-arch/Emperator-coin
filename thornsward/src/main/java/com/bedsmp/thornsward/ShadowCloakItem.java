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

public final class ShadowCloakItem {
    public static final String ITEM_ID = "shadow_cloak";
    private static final int CUSTOM_MODEL_DATA = 7013;
    private final NamespacedKey key;

    public ShadowCloakItem(JavaPlugin plugin) { this.key = new NamespacedKey(plugin, ITEM_ID); }
    public NamespacedKey getKey() { return key; }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.CHAINMAIL_CHESTPLATE);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(legacyLine("§8✦ Плащ Теней §8✦").color(NamedTextColor.DARK_GRAY));
        meta.lore(List.of(
                legacyLine("§7Стоишь неподвижно §82 сек§7 — становишься"),
                legacyLine("§7полностью невидимым (/vanish)."),
                legacyLine("§7Любое движение — видимость возвращается."),
                legacyLine(""),
                legacyLine("§8▶ Надень на грудь")
        ));
        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isShadowCloak(ItemStack item) {
        if (item == null || item.getType() == Material.AIR) return false;
        ItemMeta meta = item.getItemMeta();
        if (meta == null) return false;
        return meta.getPersistentDataContainer().has(key, PersistentDataType.BYTE);
    }

    private Component legacyLine(String legacy) {
        return LegacyComponentSerializer.legacySection().deserialize(legacy).decoration(TextDecoration.ITALIC, false);
    }
}
