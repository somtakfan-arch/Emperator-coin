package com.bedsmp.unbreakablestand;

import org.bukkit.Material;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataType;

import java.util.List;

public final class ItemFactory {

    private final Keys keys;

    public ItemFactory(Keys keys) {
        this.keys = keys;
    }

    @SuppressWarnings("deprecation")
    public ItemStack createUnbreakableStand(int amount) {
        ItemStack item = new ItemStack(Material.ARMOR_STAND, amount);
        ItemMeta meta = item.getItemMeta();

        meta.setDisplayName("§bНеломаемая стойка");

        meta.getPersistentDataContainer().set(keys.unbreakableStand, PersistentDataType.BYTE, (byte) 1);

        item.setItemMeta(meta);
        return item;
    }

    @SuppressWarnings("deprecation")
    public ItemStack createStandBreaker(int amount) {
        ItemStack item = new ItemStack(Material.SHEARS, amount);
        ItemMeta meta = item.getItemMeta();

        meta.setDisplayName("§cНожницы разрушения");
        meta.setLore(List.of("§7Ломают неломаемую стойку. Одноразовые."));

        meta.getPersistentDataContainer().set(keys.standBreaker, PersistentDataType.BYTE, (byte) 1);

        item.setItemMeta(meta);
        return item;
    }
}
