package com.bedsmp.thornsward;

import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Entity;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.util.Vector;

public final class DragonRoarListener implements Listener {

    private final JavaPlugin plugin;
    private final DragonRoarItem item;

    public DragonRoarListener(JavaPlugin plugin, DragonRoarItem item) {
        this.plugin = plugin;
        this.item   = item;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onHit(EntityDamageByEntityEvent event) {
        if (!(event.getDamager() instanceof Player attacker)) return;
        if (!item.isDragonRoar(attacker.getInventory().getItemInMainHand())) return;
        if (!(event.getEntity() instanceof LivingEntity victim)) return;

        double radius    = plugin.getConfig().getDouble("dragon-roar.shockwave-radius", 5.0);
        double launchVel = plugin.getConfig().getDouble("dragon-roar.launch-velocity", 0.9);

        for (Entity e : victim.getNearbyEntities(radius, radius, radius)) {
            if (e.equals(attacker)) continue;
            e.setVelocity(new Vector(0, launchVel, 0));
        }

        victim.getWorld().spawnParticle(Particle.EXPLOSION, victim.getLocation().add(0, 1, 0), 3, 0.5, 0.5, 0.5, 0);
        victim.getWorld().playSound(victim.getLocation(), Sound.ENTITY_ENDER_DRAGON_GROWL, 1f, 0.6f);
    }
}
