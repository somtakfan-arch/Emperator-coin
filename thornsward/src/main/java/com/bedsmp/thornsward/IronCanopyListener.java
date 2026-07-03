package com.bedsmp.thornsward;

import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.event.Listener;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.util.Vector;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public final class IronCanopyListener implements Listener {

    private final JavaPlugin plugin;
    private final IronCanopyItem item;
    private final Map<UUID, Boolean> wasBlocking = new HashMap<>();
    private final Set<UUID> sphereActive = new HashSet<>();

    public IronCanopyListener(JavaPlugin plugin, IronCanopyItem item) {
        this.plugin = plugin;
        this.item   = item;
        plugin.getServer().getScheduler().runTaskTimer(plugin, this::tick, 5L, 5L);
    }

    private void tick() {
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            UUID uid = player.getUniqueId();
            if (!hasIronCanopy(player)) { wasBlocking.remove(uid); continue; }

            boolean now  = player.isBlocking();
            boolean prev = wasBlocking.getOrDefault(uid, false);
            wasBlocking.put(uid, now);

            if (now && !prev) activateSphere(player);
        }
    }

    private void activateSphere(Player player) {
        UUID uid = player.getUniqueId();
        if (sphereActive.contains(uid)) return;
        sphereActive.add(uid);

        double radius   = plugin.getConfig().getDouble("iron-canopy.repel-radius", 4.0);
        double strength = plugin.getConfig().getDouble("iron-canopy.repel-strength", 1.5);

        int[] ticks = {0};
        plugin.getServer().getScheduler().runTaskTimer(plugin, task -> {
            ticks[0]++;
            if (!player.isOnline() || ticks[0] > 10) { // 10 * 2 ticks = 20 ticks = 1 second
                sphereActive.remove(uid);
                task.cancel();
                return;
            }
            for (Entity e : player.getNearbyEntities(radius, radius, radius)) {
                if (e.equals(player)) continue;
                Vector dir = e.getLocation().toVector().subtract(player.getLocation().toVector());
                dir.setY(0.3);
                if (dir.lengthSquared() < 0.001) dir = new Vector(1, 0.3, 0);
                else dir = dir.normalize().multiply(strength);
                e.setVelocity(dir);
            }
            player.getWorld().spawnParticle(Particle.ENCHANT, player.getLocation().add(0, 1, 0),
                    20, 2, 1, 2, 0.05);
        }, 0L, 2L);

        player.playSound(player.getLocation(), Sound.BLOCK_ANVIL_LAND, 0.5f, 1.5f);
    }

    private boolean hasIronCanopy(Player player) {
        return item.isIronCanopy(player.getInventory().getItem(EquipmentSlot.OFF_HAND));
    }
}
