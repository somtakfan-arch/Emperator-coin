package com.bedsmp.thornsward;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.CreatureSpawnEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.Location;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public final class SoulLanternListener implements Listener {

    private final JavaPlugin plugin;
    private final SoulLanternItem lanternItem;

    private final Set<UUID> active          = new HashSet<>();
    private final Map<UUID, BukkitTask> tasks = new HashMap<>();

    public SoulLanternListener(JavaPlugin plugin, SoulLanternItem lanternItem) {
        this.plugin      = plugin;
        this.lanternItem = lanternItem;
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteract(PlayerInteractEvent event) {
        if (event.getHand() != EquipmentSlot.HAND) return;
        if (event.getAction() != org.bukkit.event.block.Action.RIGHT_CLICK_AIR
                && event.getAction() != org.bukkit.event.block.Action.RIGHT_CLICK_BLOCK) return;

        Player player = event.getPlayer();
        ItemStack held = player.getInventory().getItemInMainHand();
        if (!lanternItem.isSoulLantern(held)) return;

        // Prevent block placement
        event.setUseItemInHand(org.bukkit.event.Event.Result.DENY);
        event.setUseInteractedBlock(org.bukkit.event.Event.Result.DENY);

        if (active.contains(player.getUniqueId())) {
            player.sendMessage(Component.text("Фонарь Душ уже горит!", NamedTextColor.DARK_PURPLE));
            return;
        }

        int durationSec = plugin.getConfig().getInt("soul-lantern.duration-seconds", 30);
        activate(player, durationSec);
    }

    private void activate(Player player, int durationSec) {
        active.add(player.getUniqueId());
        player.sendMessage(Component.text("✦ Фонарь Душ активирован на " + durationSec + " секунд!", NamedTextColor.DARK_PURPLE));
        player.playSound(player.getLocation(), Sound.BLOCK_SOUL_SAND_PLACE, 1f, 0.7f);

        int[] ticks = {0};
        int totalTicks = durationSec * 20;
        BukkitTask[] taskRef = new BukkitTask[1];

        taskRef[0] = plugin.getServer().getScheduler().runTaskTimer(plugin, () -> {
            ticks[0]++;

            if (!player.isOnline() || ticks[0] > totalTicks) {
                deactivate(player, taskRef[0]);
                return;
            }

            // Spinning soul particles every 2 ticks
            if (ticks[0] % 2 == 0) {
                Location center = player.getLocation().add(0, 0.5, 0);
                double angle = ticks[0] * 0.25;
                for (int i = 0; i < 6; i++) {
                    double a = angle + (Math.PI * 2 / 6) * i;
                    double x = Math.cos(a) * 2.5;
                    double z = Math.sin(a) * 2.5;
                    player.getWorld().spawnParticle(Particle.SOUL, center.clone().add(x, 0, z), 1, 0, 0, 0, 0);
                }
            }

            // Warn at 5 seconds remaining
            if (ticks[0] == totalTicks - 100) {
                player.sendMessage(Component.text("Фонарь Душ догорает...", NamedTextColor.GRAY));
            }
        }, 0L, 1L);

        tasks.put(player.getUniqueId(), taskRef[0]);
    }

    private void deactivate(Player player, BukkitTask task) {
        active.remove(player.getUniqueId());
        tasks.remove(player.getUniqueId());
        task.cancel();
        if (player.isOnline()) {
            player.sendMessage(Component.text("Фонарь Душ погас.", NamedTextColor.GRAY));
            player.playSound(player.getLocation(), Sound.BLOCK_SOUL_SAND_BREAK, 0.8f, 0.7f);
        }
    }

    @EventHandler(priority = EventPriority.NORMAL, ignoreCancelled = true)
    public void onCreatureSpawn(CreatureSpawnEvent event) {
        if (event.getSpawnReason() != CreatureSpawnEvent.SpawnReason.NATURAL) return;

        if (active.isEmpty()) return;

        double radius = plugin.getConfig().getDouble("soul-lantern.no-spawn-radius", 5.0);
        double radiusSq = radius * radius;
        Location spawnLoc = event.getLocation();

        for (UUID uid : active) {
            Player player = plugin.getServer().getPlayer(uid);
            if (player == null || !player.isOnline()) continue;
            if (!player.getWorld().equals(spawnLoc.getWorld())) continue;
            if (player.getLocation().distanceSquared(spawnLoc) <= radiusSq) {
                event.setCancelled(true);
                return;
            }
        }
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        UUID id = event.getPlayer().getUniqueId();
        BukkitTask task = tasks.remove(id);
        if (task != null) task.cancel();
        active.remove(id);
    }
}
