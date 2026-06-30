package com.bedsmp.unbreakablestand.listeners;

import com.bedsmp.unbreakablestand.Keys;
import org.bukkit.entity.ArmorStand;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.persistence.PersistentDataType;

public final class StandProtectionListener implements Listener {

    private final Keys keys;

    public StandProtectionListener(Keys keys) {
        this.keys = keys;
    }

    @EventHandler
    public void onDamage(EntityDamageEvent event) {
        if (isUnbreakableStand(event)) {
            event.setCancelled(true);
        }
    }

    @EventHandler
    public void onDamageByEntity(EntityDamageByEntityEvent event) {
        if (isUnbreakableStand(event)) {
            event.setCancelled(true);
        }
    }

    private boolean isUnbreakableStand(EntityDamageEvent event) {
        if (!(event.getEntity() instanceof ArmorStand stand)) {
            return false;
        }

        Byte marked = stand.getPersistentDataContainer().get(keys.unbreakableStand, PersistentDataType.BYTE);
        return marked != null && marked == (byte) 1;
    }
}
