package com.bedsmp.thornsward;

import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.entity.AbstractArrow;
import org.bukkit.entity.Arrow;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.ProjectileHitEvent;
import org.bukkit.event.entity.ProjectileLaunchEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.projectiles.ProjectileSource;
import org.bukkit.util.Vector;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public final class PhantomListener implements Listener {

    private final ThornsWardPlugin plugin;
    private final PhantomItem item;

    /** arrow UUID → количество оставшихся блоков проходки */
    private final Map<UUID, Integer> penetrationLeft  = new HashMap<>();
    /** arrow UUID → вектор скорости в момент выстрела (направление + скорость) */
    private final Map<UUID, Vector>  launchVelocity   = new HashMap<>();

    public PhantomListener(ThornsWardPlugin plugin, PhantomItem item) {
        this.plugin = plugin;
        this.item   = item;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onProjectileLaunch(ProjectileLaunchEvent event) {
        if (!(event.getEntity().getShooter() instanceof Player player)) return;
        if (!(event.getEntity() instanceof AbstractArrow arrow))        return;

        ItemStack main = player.getInventory().getItemInMainHand();
        ItemStack off  = player.getInventory().getItemInOffHand();
        if (!item.isPhantomCrossbow(main) && !item.isPhantomCrossbow(off)) return;

        int budget = plugin.getConfig().getInt("phantom-crossbow.wall-penetration-blocks", 15);
        penetrationLeft.put(arrow.getUniqueId(), budget);
        launchVelocity .put(arrow.getUniqueId(), arrow.getVelocity().clone());
    }

    /**
     * Когда стрела Призрака упирается в блок:
     *  1. Сканируем вперёд вдоль исходного направления полёта.
     *  2. Находим первый не-твёрдый блок после стены (или конец бюджета).
     *  3. Удаляем старую стрелу и спауним новую в точке выхода с той же скоростью.
     */
    @EventHandler(priority = EventPriority.HIGHEST)
    public void onProjectileHit(ProjectileHitEvent event) {
        // Попадание в сущность (игрок, моб) — не трогаем, урон проходит штатно
        if (event.getHitBlock() == null)                                return;
        if (!(event.getEntity() instanceof AbstractArrow arrow))        return;

        UUID arrowId = arrow.getUniqueId();
        Integer remaining = penetrationLeft.remove(arrowId);
        Vector stored     = launchVelocity.remove(arrowId);

        if (remaining == null || remaining <= 0 || stored == null) return;

        // Направление по сохранённому вектору запуска — оно не меняется в полёте
        Vector dir   = stored.clone().normalize();
        double speed = stored.length();

        Location start = arrow.getLocation();

        // Ищем точку выхода: первый нетвёрдый блок в пределах бюджета
        int solidPassed = 0;
        Location exitLoc = null;

        for (int i = 1; i <= remaining + 1; i++) {
            Location check = start.clone().add(dir.clone().multiply(i));
            Block    block  = check.getBlock();

            if (!block.getType().isSolid()) {
                // Чуть сдвигаем внутрь воздушного кармана, чтобы стрела не застряла на границе
                exitLoc = check.clone().add(dir.clone().multiply(0.2));
                break;
            }
            solidPassed++;
        }

        // Выход не найден или твёрдых блоков больше, чем остаток бюджета — стрела останавливается
        if (exitLoc == null || solidPassed == 0 || solidPassed > remaining) return;

        final Location  spawnAt      = exitLoc;
        final int       newRemaining = remaining - solidPassed;
        final boolean   critical     = arrow.isCritical();
        final double    damage       = arrow.getDamage();
        final int       fireTicks    = arrow.getFireTicks();
        final Vector    velAtSpawn   = dir.clone().multiply(speed);
        final Vector    storedFinal  = stored.clone();
        final ProjectileSource shooter =
                (arrow.getShooter() instanceof ProjectileSource ps) ? ps : null;

        // Откладываем на следующий тик, чтобы ванилла успела зафиксировать попадание
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (arrow.isValid()) arrow.remove();

            World world = spawnAt.getWorld();
            if (world == null) return;

            world.spawn(spawnAt, Arrow.class, newArrow -> {
                newArrow.setVelocity(velAtSpawn);
                newArrow.setCritical(critical);
                newArrow.setDamage(damage);
                newArrow.setFireTicks(fireTicks);
                if (shooter != null) newArrow.setShooter(shooter);

                // Если остался бюджет — регистрируем новую стрелу для дальнейшей проходки
                if (newRemaining > 0) {
                    penetrationLeft.put(newArrow.getUniqueId(), newRemaining);
                    launchVelocity .put(newArrow.getUniqueId(), storedFinal);
                }
            });
        });
    }
}
