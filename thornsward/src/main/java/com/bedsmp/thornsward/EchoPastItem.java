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

import java.util.ArrayList;
import java.util.List;

public final class EchoPastItem {
    public static final String ITEM_ID = "echo_past";
    private static final int CUSTOM_MODEL_DATA = 7020;
    private final NamespacedKey key;
    private final NamespacedKey usesKey;

    public EchoPastItem(JavaPlugin plugin) {
        this.key     = new NamespacedKey(plugin, ITEM_ID);
        this.usesKey = new NamespacedKey(plugin, "echo_past_uses");
    }

    public NamespacedKey getKey() { return key; }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.RECOVERY_COMPASS);
        ItemMeta meta = stack.getItemMeta();
        meta.displayName(legacyLine("§d✦ Эхо Прошлого §d✦").color(NamedTextColor.LIGHT_PURPLE));
        meta.lore(List.of(
                legacyLine("§7ПКМ — телепортирует тебя туда,"),
                legacyLine("§7где ты был §d30 секунд назад§7."),
                legacyLine(""),
                legacyLine("§8⏱ Осталось: §f3§8/§f3 §7зарядов")
        ));
        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);
        meta.getPersistentDataContainer().set(usesKey, PersistentDataType.INTEGER, 3);
        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isEchoPast(ItemStack item) {
        if (item == null || item.getType() == Material.AIR) return false;
        ItemMeta meta = item.getItemMeta();
        if (meta == null) return false;
        return meta.getPersistentDataContainer().has(key, PersistentDataType.BYTE);
    }

    public int getUses(ItemStack item) {
        if (!isEchoPast(item)) return 0;
        return item.getItemMeta().getPersistentDataContainer()
                .getOrDefault(usesKey, PersistentDataType.INTEGER, 3);
    }

    public void decrementUses(ItemStack item) {
        ItemMeta meta = item.getItemMeta();
        int uses = meta.getPersistentDataContainer()
                .getOrDefault(usesKey, PersistentDataType.INTEGER, 3) - 1;
        if (uses <= 0) {
            item.setAmount(0);
            return;
        }
        meta.getPersistentDataContainer().set(usesKey, PersistentDataType.INTEGER, uses);
        List<Component> lore = new ArrayList<>(meta.lore() != null ? meta.lore() : List.of());
        if (!lore.isEmpty()) {
            lore.set(lore.size() - 1, legacyLine("§8⏱ Осталось: §f" + uses + "§8/§f3 §7зарядов"));
        }
        meta.lore(lore);
        item.setItemMeta(meta);
    }

    private Component legacyLine(String legacy) {
        return LegacyComponentSerializer.legacySection().deserialize(legacy).decoration(TextDecoration.ITALIC, false);
    }
}
