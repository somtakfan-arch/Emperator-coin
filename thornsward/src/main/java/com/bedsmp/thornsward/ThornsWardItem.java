package com.bedsmp.thornsward;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.PlayerInventory;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.List;

/**
 * Создание и распознавание предмета "Оберег Терновника".
 * Принадлежность определяется ИСКЛЮЧИТЕЛЬНО через PersistentDataContainer,
 * чтобы предмет нельзя было подделать переименованием/анвилом.
 */
public final class ThornsWardItem {

    public static final String ITEM_ID = "thorns_ward";
    private static final int CUSTOM_MODEL_DATA = 7001;

    private final NamespacedKey key;

    public ThornsWardItem(JavaPlugin plugin) {
        this.key = new NamespacedKey(plugin, ITEM_ID);
    }

    public NamespacedKey getKey() {
        return key;
    }

    public ItemStack create() {
        ItemStack stack = new ItemStack(Material.ECHO_SHARD);
        ItemMeta meta = stack.getItemMeta();

        meta.displayName(legacyLine("§b✦ Оберег Терновника §b✦").color(NamedTextColor.AQUA));

        meta.lore(List.of(
                legacyLine("§7Пока лежит в инвентаре —"),
                legacyLine("§7шипы врага не наносят тебе урона"),
                legacyLine("§7и не отбрасывают тебя."),
                legacyLine("§8(работает при любом уровне Шипов)")
        ));

        meta.setCustomModelData(CUSTOM_MODEL_DATA);
        meta.getPersistentDataContainer().set(key, PersistentDataType.BYTE, (byte) 1);

        stack.setItemMeta(meta);
        return stack;
    }

    public boolean isThornsWard(ItemStack item) {
        if (item == null || item.getType() == Material.AIR) {
            return false;
        }
        ItemMeta meta = item.getItemMeta();
        if (meta == null) {
            return false;
        }
        return meta.getPersistentDataContainer().has(key, PersistentDataType.BYTE);
    }

    /**
     * Проверяет наличие предмета где угодно в инвентаре игрока:
     * хотбар, основной инвентарь, броня, оффхенд.
     */
    public boolean hasInInventory(Player player) {
        PlayerInventory inv = player.getInventory();

        for (ItemStack item : inv.getStorageContents()) {
            if (isThornsWard(item)) {
                return true;
            }
        }
        if (isThornsWard(inv.getItemInOffHand())) {
            return true;
        }
        for (ItemStack armor : inv.getArmorContents()) {
            if (isThornsWard(armor)) {
                return true;
            }
        }
        return false;
    }

    private Component legacyLine(String legacy) {
        return LegacyComponentSerializer.legacySection()
                .deserialize(legacy)
                .decoration(TextDecoration.ITALIC, false);
    }
}
