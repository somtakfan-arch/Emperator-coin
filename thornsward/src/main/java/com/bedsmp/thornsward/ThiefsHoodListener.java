package com.bedsmp.thornsward;

import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.HashSet;
import java.util.Random;
import java.util.Set;
import java.util.UUID;

public final class ThiefsHoodListener implements Listener {

    private final JavaPlugin plugin;
    private final ThiefsHoodItem item;
    private final Set<UUID> processing = new HashSet<>();
    private final Random random = new Random();

    public ThiefsHoodListener(JavaPlugin plugin, ThiefsHoodItem item) {
        this.plugin = plugin;
        this.item   = item;
    }

    @EventHandler(priority = EventPriority.HIGHEST)
    public void onDamage(EntityDamageEvent event) {
        if (event.isCancelled()) return;
        if (!(event.getEntity() instanceof Player player)) return;
        if (processing.contains(player.getUniqueId())) return;
        if (!item.isThiefsHood(player.getInventory().getHelmet())) return;
        if (player.getHealth() - event.getFinalDamage() > 0) return; // won't die

        event.setCancelled(true);
        processing.add(player.getUniqueId());

        // Remove the hood — one-time use
        player.getInventory().setHelmet(null);

        // Teleport randomly 10-15 blocks away
        double dist  = plugin.getConfig().getDouble("thiefs-hood.teleport-distance", 15.0);
        double angle = random.nextDouble() * 2 * Math.PI;
        org.bukkit.Location dest = player.getLocation().clone()
                .add(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
        // Find a safe Y
        dest = findSurface(dest);

        player.teleport(dest);
        double surviveHealth = plugin.getConfig().getDouble("thiefs-hood.survive-health", 4.0);
        player.setHealth(Math.min(surviveHealth, player.getMaxHealth()));

        player.getWorld().spawnParticle(Particle.SMOKE, player.getLocation().add(0, 1, 0), 40, 0.5, 1, 0.5, 0.05);
        player.playSound(player.getLocation(), Sound.ENTITY_ENDERMAN_TELEPORT, 1f, 0.8f);
        player.sendMessage(net.kyori.adventure.text.Component.text(
                "Капюшон Вора сгорел, но спас тебя!", net.kyori.adventure.text.format.NamedTextColor.DARK_BLUE));

        plugin.getServer().getScheduler().runTask(plugin,
                () -> processing.remove(player.getUniqueId()));
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        processing.remove(event.getPlayer().getUniqueId());
    }

    private org.bukkit.Location findSurface(org.bukkit.Location loc) {
        org.bukkit.World world = loc.getWorld();
        int x = loc.getBlockX();
        int z = loc.getBlockZ();
        int y = world.getHighestBlockYAt(x, z);
        return new org.bukkit.Location(world, x + 0.5, y + 1, z + 0.5,
                loc.getYaw(), loc.getPitch());
    }
}
