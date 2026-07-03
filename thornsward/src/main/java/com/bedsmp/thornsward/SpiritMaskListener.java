package com.bedsmp.thornsward;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityTargetLivingEntityEvent;

public final class SpiritMaskListener implements Listener {

    private final SpiritMaskItem item;

    public SpiritMaskListener(SpiritMaskItem item) {
        this.item = item;
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onTarget(EntityTargetLivingEntityEvent event) {
        if (!(event.getTarget() instanceof Player player)) return;
        if (!item.isSpiritMask(player.getInventory().getHelmet())) return;
        event.setCancelled(true);
    }
}
