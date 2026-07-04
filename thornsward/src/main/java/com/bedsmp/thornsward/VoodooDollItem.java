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

public final class VoodooDollItem {
    public static final String ITEM_ID = "voodoo_doll";
    private static final int CUSTOM_MODEL_DATA = 7024;
    private final NamespacedKey key;

    public VoodooDollItem(JavaPlugin plugin) { this.key = new NamespacedKey(plugin, ITEM_ID); }
    public NamespacedKey getKey() { return key; }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.PAPER);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(legacyLine("§5☠ Кукла Вуду §5☠").color(NamedTextColor.DARK_PURPLE));
        meta.lore(List.of(
                legacyLine("§7Зажмите ПКМ 2 секунды — кукла"),
                legacyLine("§7свяжется с ближайшим игроком."),
                legacyLine("§7Следующие §d10 сек §7весь урон,"),
                legacyLine("§7что ты получаешь, получает и он."),
                legacyLine(""),
                legacyLine("§8⚠ Одноразовый предмет")
        ));
        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isVoodooDoll(ItemStack item) {
        if (item == null || item.getType() == Material.AIR) return false;
        ItemMeta meta = item.getItemMeta();
        if (meta == null) return false;
        return meta.getPersistentDataContainer().has(key, PersistentDataType.BYTE);
    }

    private Component legacyLine(String legacy) {
        return LegacyComponentSerializer.legacySection().deserialize(legacy).decoration(TextDecoration.ITALIC, false);
    }
}
