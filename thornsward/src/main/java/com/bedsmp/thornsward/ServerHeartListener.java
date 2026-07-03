package com.bedsmp.thornsward;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Location;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public final class ServerHeartListener implements Listener {

    private final JavaPlugin plugin;
    private final ServerHeartItem item;
    private final Map<UUID, Long> cooldowns = new HashMap<>();

    public ServerHeartListener(JavaPlugin plugin, ServerHeartItem item) {
        this.plugin = plugin;
        this.item   = item;
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteract(PlayerInteractEvent event) {
        if (event.getHand() != EquipmentSlot.HAND) return;
        if (event.getAction() != Action.RIGHT_CLICK_AIR && event.getAction() != Action.RIGHT_CLICK_BLOCK) return;

        Player player = event.getPlayer();
        if (!item.isServerHeart(player.getInventory().getItemInMainHand())) return;

        event.setUseItemInHand(Event.Result.DENY);

        int cooldownSec = plugin.getConfig().getInt("server-heart.cooldown-seconds", 60);
        long now = System.currentTimeMillis();
        Long last = cooldowns.get(player.getUniqueId());
        if (last != null && now - last < cooldownSec * 1000L) {
            long rem = cooldownSec - (now - last) / 1000;
            player.sendMessage(Component.text("Кулдаун: " + rem + " сек.", NamedTextColor.YELLOW));
            return;
        }
        cooldowns.put(player.getUniqueId(), now);

        Location loc = player.getLocation();
        String coords = String.format("X: %d, Y: %d, Z: %d [%s]",
                loc.getBlockX(), loc.getBlockY(), loc.getBlockZ(),
                loc.getWorld().getName());

        Component msg = Component.text("♥ ", NamedTextColor.RED)
                .append(Component.text(player.getName() + " ", NamedTextColor.WHITE))
                .append(Component.text("находится на ", NamedTextColor.GRAY))
                .append(Component.text(coords, NamedTextColor.WHITE));

        for (Player p : plugin.getServer().getOnlinePlayers()) {
            p.sendMessage(msg);
        }

        // Particle halo above head for reveal-seconds
        int revealSec = plugin.getConfig().getInt("server-heart.reveal-seconds", 10);
        int totalTicks = revealSec * 20;
        int[] ticks = {0};
        plugin.getServer().getScheduler().runTaskTimer(plugin, task -> {
            ticks[0] += 2;
            if (!player.isOnline() || ticks[0] > totalTicks) { task.cancel(); return; }
            double angle = ticks[0] * 0.4;
            Location head = player.getLocation().add(0, 2.5, 0);
            for (int i = 0; i < 4; i++) {
                double a = angle + Math.PI / 2.0 * i;
                head.getWorld().spawnParticle(Particle.HEART,
                        head.clone().add(Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6), 1, 0, 0, 0, 0);
            }
        }, 0L, 2L);

        player.playSound(player.getLocation(), Sound.BLOCK_BEACON_POWER_SELECT, 1f, 0.8f);
        player.sendMessage(Component.text("Твои координаты раскрыты всем!", NamedTextColor.RED));
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        cooldowns.remove(event.getPlayer().getUniqueId());
    }
}
