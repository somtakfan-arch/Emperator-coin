package com.bedsmp.thornsward;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.NamespacedKey;
import org.bukkit.entity.AbstractArrow;
import org.bukkit.entity.Arrow;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.ProjectileHitEvent;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.scheduler.BukkitTask;
import org.bukkit.util.Vector;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public final class MirrorShieldListener implements Listener {

    private final ThornsWardPlugin plugin;
    private final MirrorShieldItem item;

    /** Ключ, которым помечаем уже отражённые стрелы, чтобы не было бесконечного пинг-понга. */
    private final NamespacedKey reflectedKey;

    private final Set<UUID>             tracked = new HashSet<>();
    private final Map<UUID, BukkitTask> tasks   = new HashMap<>();

    public MirrorShieldListener(ThornsWardPlugin plugin, MirrorShieldItem item) {
        this.plugin       = plugin;
        this.item         = item;
        this.reflectedKey = new NamespacedKey(plugin, "reflected_arrow");
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onArrowHit(EntityDamageByEntityEvent event) {
        if (!(event.getEntity()  instanceof Player       victim)) return;
        if (!(event.getDamager() instanceof AbstractArrow arrow))  return;

        // Не отражаем стрелы, которые уже были отражены — предотвращает бесконечную петлю
        if (arrow.getPersistentDataContainer().has(reflectedKey, PersistentDataType.BYTE)) return;

        if (!hasMirrorShield(victim)) return;
        if (!(arrow.getShooter() instanceof LivingEntity shooter)) return;
        if (shooter.equals(victim)) return; // не отражаем собственные стрелы

        event.setCancelled(true); // игрок не получает урон

        double  speed  = plugin.getConfig().getDouble("mirror-shield.tracking-speed", 2.5);
        boolean crit   = arrow.isCritical();
        double  damage = arrow.getDamage();

        // LivingEntity shooter — эффективно финальная переменная для лямбды
        LivingEntity trackedShooter = shooter;

        Bukkit.getScheduler().runTask(plugin, () -> {
            if (arrow.isValid()) arrow.remove();
            if (!victim.isOnline())          return;
            if (!trackedShooter.isValid())   return;

            Location spawnLoc = victim.getEyeLocation();
            Vector   rawDir   = trackedShooter.getEyeLocation().toVector()
                                              .subtract(spawnLoc.toVector());
            if (rawDir.lengthSquared() < 0.01) return;

            Arrow reflected = victim.getWorld().spawn(spawnLoc, Arrow.class, a -> {
                a.setVelocity(rawDir.normalize().multiply(speed));
                a.setCritical(crit);
                a.setDamage(damage);
                a.setShooter(victim);
                // Помечаем отражённую стрелу, чтобы второй щит не отразил её снова
                a.getPersistentDataContainer().set(reflectedKey, PersistentDataType.BYTE, (byte) 1);
            });

            UUID reflectedId = reflected.getUniqueId();
            tracked.add(reflectedId);

            // Nemesis-механика: каждый тик перенаправляем в сторону стрелявшего
            BukkitTask[] taskRef = new BukkitTask[1];
            taskRef[0] = Bukkit.getScheduler().runTaskTimer(plugin, () -> {

                if (!reflected.isValid() || reflected.getVelocity().lengthSquared() < 0.001) {
                    stopTracking(reflectedId, taskRef[0]);
                    return;
                }
                if (!trackedShooter.isValid()) {
                    stopTracking(reflectedId, taskRef[0]);
                    return;
                }

                Vector dir = trackedShooter.getEyeLocation().toVector()
                        .subtract(reflected.getLocation().toVector());

                if (dir.lengthSquared() < 0.01) {
                    stopTracking(reflectedId, taskRef[0]);
                    return;
                }

                reflected.setVelocity(dir.normalize().multiply(speed));

            }, 1L, 1L);

            tasks.put(reflectedId, taskRef[0]);
        });
    }

    /** Отражённая стрела ударилась о блок — прекращаем слежение. */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onProjectileHit(ProjectileHitEvent event) {
        if (event.getHitBlock() == null) return;
        UUID id = event.getEntity().getUniqueId();
        if (!tracked.contains(id)) return;
        BukkitTask task = tasks.remove(id);
        tracked.remove(id);
        if (task != null) task.cancel();
    }

    private void stopTracking(UUID arrowId, BukkitTask task) {
        tracked.remove(arrowId);
        tasks.remove(arrowId);
        task.cancel();
    }

    private boolean hasMirrorShield(Player player) {
        return item.isMirrorShield(player.getInventory().getItemInMainHand())
            || item.isMirrorShield(player.getInventory().getItemInOffHand());
    }
}
