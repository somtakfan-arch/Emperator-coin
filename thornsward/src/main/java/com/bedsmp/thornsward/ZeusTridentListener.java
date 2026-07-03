package com.bedsmp.thornsward;

import org.bukkit.NamespacedKey;
import org.bukkit.entity.Player;
import org.bukkit.entity.Trident;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.ProjectileHitEvent;
import org.bukkit.event.entity.ProjectileLaunchEvent;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.java.JavaPlugin;

public final class ZeusTridentListener implements Listener {

    private final ZeusTridentItem item;
    private final NamespacedKey markerKey;

    public ZeusTridentListener(JavaPlugin plugin, ZeusTridentItem item) {
        this.item      = item;
        this.markerKey = new NamespacedKey(plugin, "zeus_thrown");
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onLaunch(ProjectileLaunchEvent event) {
        if (!(event.getEntity() instanceof Trident trident)) return;
        if (!(trident.getShooter() instanceof Player player)) return;
        if (!item.isZeusTrident(player.getInventory().getItemInMainHand())) return;
        trident.getPersistentDataContainer().set(markerKey, PersistentDataType.BYTE, (byte) 1);
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onHit(ProjectileHitEvent event) {
        if (!(event.getEntity() instanceof Trident trident)) return;
        if (!trident.getPersistentDataContainer().has(markerKey, PersistentDataType.BYTE)) return;
        trident.getWorld().strikeLightning(trident.getLocation());
    }
}
