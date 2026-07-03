package com.bedsmp.thornsward;

import org.bukkit.Sound;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerFishEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.util.Vector;

public final class SpiderThreadListener implements Listener {

    private final JavaPlugin plugin;
    private final SpiderThreadItem item;

    public SpiderThreadListener(JavaPlugin plugin, SpiderThreadItem item) {
        this.plugin = plugin;
        this.item   = item;
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onFish(PlayerFishEvent event) {
        if (event.getState() != PlayerFishEvent.State.CAUGHT_ENTITY) return;
        Player player = event.getPlayer();
        if (!item.isSpiderThread(player.getInventory().getItemInMainHand())) return;
        Entity caught = event.getCaught();
        if (caught == null) return;

        double force = plugin.getConfig().getDouble("spider-thread.pull-force", 4.0);

        // Override vanilla pull with massive force on next tick
        plugin.getServer().getScheduler().runTask(plugin, () -> {
            if (!caught.isValid()) return;
            Vector dir = player.getLocation().toVector().subtract(caught.getLocation().toVector());
            dir.setY(dir.getY() + 0.4);
            if (dir.lengthSquared() < 0.001) return;
            caught.setVelocity(dir.normalize().multiply(force));
        });

        player.playSound(player.getLocation(), Sound.ENTITY_FISHING_BOBBER_RETRIEVE, 1f, 0.5f);
        if (caught instanceof Player target) {
            target.sendMessage(net.kyori.adventure.text.Component.text(
                    "Тебя притягивает Нить Паука!", net.kyori.adventure.text.format.NamedTextColor.DARK_GREEN));
        }
    }
}
