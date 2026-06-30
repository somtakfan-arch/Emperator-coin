package com.bedsmp.unbreakablestand.listeners;

import com.bedsmp.unbreakablestand.Keys;
import org.bukkit.entity.ArmorStand;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityPlaceEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.persistence.PersistentDataType;

public final class StandPlaceListener implements Listener {

    private final Keys keys;

    public StandPlaceListener(Keys keys) {
        this.keys = keys;
    }

    @EventHandler(ignoreCancelled = true)
    public void onPlace(EntityPlaceEvent event) {
        if (!(event.getEntity() instanceof ArmorStand stand)) {
            return;
        }

        Player player = event.getPlayer();
        if (player == null) {
            return;
        }

        EquipmentSlot hand = event.getHand();
        ItemStack item = hand == EquipmentSlot.OFF_HAND
                ? player.getInventory().getItemInOffHand()
                : player.getInventory().getItemInMainHand();

        if (item == null || !item.hasItemMeta()) {
            return;
        }

        Byte marked = item.getItemMeta().getPersistentDataContainer()
                .get(keys.unbreakableStand, PersistentDataType.BYTE);

        if (marked != null && marked == (byte) 1) {
            stand.getPersistentDataContainer().set(keys.unbreakableStand, PersistentDataType.BYTE, (byte) 1);
        }
    }
}
