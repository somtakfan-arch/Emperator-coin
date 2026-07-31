package com.bedsmp.thornsward;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerMoveEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public final class ShadowCloakListener implements Listener {

    private final JavaPlugin plugin;
    private final ShadowCloakItem item;
    private final Map<UUID, Long> lastMoved = new HashMap<>();
    // Tracks players currently invisible from ShadowCloak so we can remove it cleanly
    private final Set<UUID> cloaked = new HashSet<>();

    public ShadowCloakListener(JavaPlugin plugin, ShadowCloakItem item) {
        this.plugin = plugin;
        this.item   = item;
        plugin.getServer().getScheduler().runTaskTimer(plugin, this::tick, 10L, 10L);
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onMove(PlayerMoveEvent event) {
        Player player = event.getPlayer();
        if (!wearsShadowCloak(player)) return;

        org.bukkit.Location from = event.getFrom();
        org.bukkit.Location to   = event.getTo();
        if (from.getX() == to.getX() && from.getY() == to.getY() && from.getZ() == to.getZ()) return;

        lastMoved.put(player.getUniqueId(), System.currentTimeMillis());
        if (cloaked.remove(player.getUniqueId())) {
            player.removePotionEffect(PotionEffectType.INVISIBILITY);
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        UUID id = event.getPlayer().getUniqueId();
        lastMoved.remove(id);
        cloaked.remove(id);
    }

    private void tick() {
        double stillMs = plugin.getConfig().getDouble("shadow-cloak.still-seconds", 2.0) * 1000;
        long now = System.currentTimeMillis();

        for (Player player : plugin.getServer().getOnlinePlayers()) {
            boolean wearing = wearsShadowCloak(player);

            if (!wearing) {
                // Cloak removed — revoke our invisibility immediately
                if (cloaked.remove(player.getUniqueId())) {
                    player.removePotionEffect(PotionEffectType.INVISIBILITY);
                }
                continue;
            }

            long last = lastMoved.getOrDefault(player.getUniqueId(), now);
            boolean shouldBeInvisible = (now - last) >= stillMs;

            if (shouldBeInvisible) {
                cloaked.add(player.getUniqueId());
                // Short duration refreshed each tick cycle — expires naturally if we stop refreshing
                player.addPotionEffect(new PotionEffect(PotionEffectType.INVISIBILITY, 25, 0, false, false));
            } else if (cloaked.remove(player.getUniqueId())) {
                player.removePotionEffect(PotionEffectType.INVISIBILITY);
            }
        }
    }

    private boolean wearsShadowCloak(Player player) {
        return item.isShadowCloak(player.getInventory().getChestplate());
    }
}
