package com.bedsmp.thornsward;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.util.Vector;

public final class CrystallerSwordListener implements Listener {

    private final ThornsWardPlugin plugin;
    private final CrystallerSwordItem item;

    public CrystallerSwordListener(ThornsWardPlugin plugin, CrystallerSwordItem item) {
        this.plugin = plugin;
        this.item = item;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onEntityDamageByEntity(EntityDamageByEntityEvent event) {
        if (!(event.getDamager() instanceof Player attacker)) {
            return;
        }
        if (!(event.getEntity() instanceof Player victim)) {
            return;
        }

        ItemStack weapon = attacker.getInventory().getItemInMainHand();
        if (!item.isCrystallerSword(weapon)) {
            return;
        }

        double upVelocity = plugin.getConfig().getDouble("crystaller-sword.launch-up-velocity", 0.63);
        Vector launch = new Vector(0.0, upVelocity, 0.0);

        // Применяем на следующем тике, чтобы перекрыть штатный knockback
        // (включая бонус от чар Отбрасывание/Острота), который Paper
        // накладывает уже после обработки события урона.
        Bukkit.getScheduler().runTask(plugin, () -> {
            if (victim.isOnline()) {
                victim.setVelocity(launch);
            }
        });
    }
}
