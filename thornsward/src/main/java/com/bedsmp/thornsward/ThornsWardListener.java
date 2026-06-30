package com.bedsmp.thornsward;

import org.bukkit.Bukkit;
import org.bukkit.damage.DamageType;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.util.Vector;

public final class ThornsWardListener implements Listener {

    private final ThornsWardPlugin plugin;
    private final ThornsWardItem item;

    public ThornsWardListener(ThornsWardPlugin plugin, ThornsWardItem item) {
        this.plugin = plugin;
        this.item = item;
    }

    /**
     * HIGHEST, чтобы наша отмена была последним словом и её не перезаписали
     * другие плагины, отрабатывающие на более ранних приоритетах.
     */
    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onEntityDamage(EntityDamageEvent event) {
        if (event.getDamageSource().getDamageType() != DamageType.THORNS) {
            return;
        }
        if (!(event.getEntity() instanceof Player victim)) {
            return;
        }

        if (plugin.getConfig().getBoolean("only-block-thorns-from-players", false)) {
            if (!(event instanceof EntityDamageByEntityEvent byEntity)
                    || !(byEntity.getDamager() instanceof Player)) {
                return;
            }
        }

        if (!item.hasInInventory(victim)) {
            return;
        }

        // Отмена события убирает урон и штатное отбрасывание от шипов.
        Vector velocityBefore = victim.getVelocity().clone();
        event.setCancelled(true);

        // Подстраховка: если в этой версии API импульс от шипов всё же
        // применяется отдельно от события урона, гасим его на следующем тике.
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (victim.isOnline()) {
                victim.setVelocity(velocityBefore);
            }
        });
    }
}
