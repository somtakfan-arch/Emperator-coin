package com.bedsmp.thornsward;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Location;
import org.bukkit.NamespacedKey;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Entity;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.entity.Snowball;
import org.bukkit.event.Event;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.entity.ProjectileHitEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.util.Vector;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

public final class GravityTrapListener implements Listener {

    private final JavaPlugin plugin;
    private final GravityTrapItem item;
    private final NamespacedKey projectileKey;

    private static class Zone {
        final Location center;
        int ticksLeft;
        Zone(Location c, int t) { center = c; ticksLeft = t; }
    }
    private final List<Zone> zones = new ArrayList<>();

    public GravityTrapListener(JavaPlugin plugin, GravityTrapItem item) {
        this.plugin       = plugin;
        this.item         = item;
        this.projectileKey = new NamespacedKey(plugin, "gravity_trap_projectile");
        plugin.getServer().getScheduler().runTaskTimer(plugin, this::tickZones, 2L, 2L);
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteract(PlayerInteractEvent event) {
        if (event.getHand() != EquipmentSlot.HAND) return;
        if (event.getAction() != Action.RIGHT_CLICK_AIR && event.getAction() != Action.RIGHT_CLICK_BLOCK) return;

        Player player = event.getPlayer();
        ItemStack held = player.getInventory().getItemInMainHand();
        if (!item.isGravityTrap(held)) return;

        event.setUseItemInHand(Event.Result.DENY);
        event.setUseInteractedBlock(Event.Result.DENY);

        // Consume one item
        if (held.getAmount() > 1) held.setAmount(held.getAmount() - 1);
        else player.getInventory().setItemInMainHand(null);

        // Launch a Snowball projectile marked with PDC
        player.getWorld().spawn(player.getEyeLocation(), Snowball.class, s -> {
            s.setShooter(player);
            s.setVelocity(player.getLocation().getDirection().multiply(1.5));
            s.getPersistentDataContainer().set(projectileKey, PersistentDataType.BYTE, (byte) 1);
        });

        player.playSound(player.getLocation(), Sound.ENTITY_SNOWBALL_THROW, 1f, 0.8f);
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onProjectileHit(ProjectileHitEvent event) {
        if (!(event.getEntity() instanceof Snowball snowball)) return;
        if (!snowball.getPersistentDataContainer().has(projectileKey, PersistentDataType.BYTE)) return;

        int durationSec = plugin.getConfig().getInt("gravity-trap.duration-seconds", 5);
        zones.add(new Zone(snowball.getLocation().clone(), durationSec * 20));

        snowball.getWorld().spawnParticle(Particle.PORTAL, snowball.getLocation(), 30, 1, 1, 1, 0.3);
        snowball.getWorld().playSound(snowball.getLocation(), Sound.BLOCK_BEACON_ACTIVATE, 1f, 0.5f);
    }

    private void tickZones() {
        if (zones.isEmpty()) return;
        double radius = plugin.getConfig().getDouble("gravity-trap.pull-radius", 4.0);

        Iterator<Zone> it = zones.iterator();
        while (it.hasNext()) {
            Zone zone = it.next();
            zone.ticksLeft -= 2;
            if (zone.ticksLeft <= 0) { it.remove(); continue; }

            Location center = zone.center;
            for (Entity e : center.getWorld().getNearbyEntities(center, radius, radius, radius)) {
                if (!(e instanceof LivingEntity)) continue;
                Vector dir = center.toVector().subtract(e.getLocation().toVector());
                if (dir.lengthSquared() < 0.01) continue;
                Vector pull = dir.normalize().multiply(0.4);
                e.setVelocity(e.getVelocity().add(pull));
            }

            if (zone.ticksLeft % 10 == 0) {
                center.getWorld().spawnParticle(Particle.PORTAL, center, 15, 2, 0.5, 2, 0.1);
            }
        }
    }
}
