package com.bedsmp.unbreakablestand.listeners;

import com.bedsmp.unbreakablestand.Keys;
import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.entity.ArmorStand;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.player.PlayerInteractEntityEvent;
import org.bukkit.inventory.EntityEquipment;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.persistence.PersistentDataType;

public final class StandBreakerListener implements Listener {

    private final Keys keys;

    public StandBreakerListener(Keys keys) {
        this.keys = keys;
    }

    @EventHandler(ignoreCancelled = true)
    public void onInteract(PlayerInteractEntityEvent event) {
        if (!(event.getRightClicked() instanceof ArmorStand stand) || !isUnbreakable(stand)) {
            return;
        }

        Player player = event.getPlayer();
        EquipmentSlot hand = event.getHand();
        ItemStack item = hand == EquipmentSlot.OFF_HAND
                ? player.getInventory().getItemInOffHand()
                : player.getInventory().getItemInMainHand();

        if (!isStandBreaker(item)) {
            return;
        }

        breakStand(stand);
        consumeItem(player, hand, item);
        event.setCancelled(true);
    }

    @EventHandler
    public void onDamageByEntity(EntityDamageByEntityEvent event) {
        if (!(event.getEntity() instanceof ArmorStand stand) || !isUnbreakable(stand)) {
            return;
        }

        if (!(event.getDamager() instanceof Player player)) {
            return;
        }

        ItemStack item = player.getInventory().getItemInMainHand();
        if (!isStandBreaker(item)) {
            return;
        }

        breakStand(stand);
        consumeItem(player, EquipmentSlot.HAND, item);
        event.setCancelled(true);
    }

    private boolean isUnbreakable(ArmorStand stand) {
        Byte marked = stand.getPersistentDataContainer().get(keys.unbreakableStand, PersistentDataType.BYTE);
        return marked != null && marked == (byte) 1;
    }

    private boolean isStandBreaker(ItemStack item) {
        if (item == null || !item.hasItemMeta()) {
            return false;
        }
        Byte marked = item.getItemMeta().getPersistentDataContainer()
                .get(keys.standBreaker, PersistentDataType.BYTE);
        return marked != null && marked == (byte) 1;
    }

    private void breakStand(ArmorStand stand) {
        World world = stand.getWorld();
        Location loc = stand.getLocation();

        EntityEquipment equipment = stand.getEquipment();
        if (equipment != null) {
            for (EquipmentSlot slot : EquipmentSlot.values()) {
                ItemStack slotItem = equipment.getItem(slot);
                if (slotItem != null && slotItem.getType() != Material.AIR) {
                    world.dropItemNaturally(loc, slotItem);
                    equipment.setItem(slot, null);
                }
            }
        }

        stand.remove();
    }

    private void consumeItem(Player player, EquipmentSlot hand, ItemStack item) {
        if (item.getAmount() > 1) {
            item.setAmount(item.getAmount() - 1);
        } else if (hand == EquipmentSlot.OFF_HAND) {
            player.getInventory().setItemInOffHand(null);
        } else {
            player.getInventory().setItemInMainHand(null);
        }
    }
}
