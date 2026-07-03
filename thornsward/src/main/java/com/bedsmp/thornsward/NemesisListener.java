package com.bedsmp.thornsward;

import org.bukkit.Bukkit;
import org.bukkit.entity.AbstractArrow;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.ProjectileHitEvent;
import org.bukkit.event.entity.ProjectileLaunchEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.util.Vector;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public final class NemesisListener implements Listener {

    private final ThornsWardPlugin plugin;
    private final NemesisItem item;

    private final Map<UUID, BukkitTask> tasks   = new HashMap<>();
    private final Map<UUID, UUID>       targets = new HashMap<>();

    public NemesisListener(ThornsWardPlugin plugin, NemesisItem item) {
        this.plugin = plugin;
        this.item   = item;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onProjectileLaunch(ProjectileLaunchEvent event) {
        if (!(event.getEntity().getShooter() instanceof Player player)) return;
        if (!(event.getEntity() instanceof AbstractArrow arrow))        return;

        ItemStack main = player.getInventory().getItemInMainHand();
        ItemStack off  = player.getInventory().getItemInOffHand();
        if (!item.isNemesisCrossbow(main) && !item.isNemesisCrossbow(off)) return;

        double radius = plugin.getConfig().getDouble("nemesis-crossbow.tracking-radius", 20.0);
        double speed  = plugin.getConfig().getDouble("nemesis-crossbow.tracking-speed",  2.0);

        Player target = findNearestPlayer(player, radius);
        if (target == null) return;

        UUID arrowId  = arrow.getUniqueId();
        UUID targetId = target.getUniqueId();
        targets.put(arrowId, targetId);

        // Самоссылающийся массив, чтобы отменить задачу изнутри лямбды
        BukkitTask[] taskRef = new BukkitTask[1];
        taskRef[0] = Bukkit.getScheduler().runTaskTimer(plugin, () -> {

            // Стрела удалена из мира (подобрана, или вышла за границу)
            if (!arrow.isValid()) {
                stopTracking(arrowId, taskRef[0]);
                return;
            }
            // Стрела застряла в блоке — velocity обнуляется ванилью
            if (arrow.getVelocity().lengthSquared() < 0.001) {
                stopTracking(arrowId, taskRef[0]);
                return;
            }

            Player t = Bukkit.getPlayer(targetId);
            if (t == null || !t.isOnline()) {
                stopTracking(arrowId, taskRef[0]);
                return;
            }

            // Вектор от стрелы к уровню глаз цели
            Vector rawDir = t.getEyeLocation().toVector()
                    .subtract(arrow.getLocation().toVector());

            if (rawDir.lengthSquared() < 0.01) {
                // Стрела вплотную к цели — останавливаем слежение
                stopTracking(arrowId, taskRef[0]);
                return;
            }

            arrow.setVelocity(rawDir.normalize().multiply(speed));

        }, 1L, 1L);

        tasks.put(arrowId, taskRef[0]);
    }

    // Стрела ударилась о блок — прекращаем корректировать траекторию
    @EventHandler(priority = EventPriority.MONITOR)
    public void onProjectileHit(ProjectileHitEvent event) {
        if (event.getHitBlock() == null) return;
        UUID id   = event.getEntity().getUniqueId();
        BukkitTask task = tasks.remove(id);
        targets.remove(id);
        if (task != null) task.cancel();
    }

    private void stopTracking(UUID arrowId, BukkitTask task) {
        tasks.remove(arrowId);
        targets.remove(arrowId);
        task.cancel();
    }

    private Player findNearestPlayer(Player shooter, double radius) {
        Player nearest      = null;
        double nearestDistSq = radius * radius;
        for (Player p : shooter.getWorld().getPlayers()) {
            if (p.equals(shooter)) continue;
            double d = p.getLocation().distanceSquared(shooter.getLocation());
            if (d < nearestDistSq) {
                nearestDistSq = d;
                nearest       = p;
            }
        }
        return nearest;
    }
}
