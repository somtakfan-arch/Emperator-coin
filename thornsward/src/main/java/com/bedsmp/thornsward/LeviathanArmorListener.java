package com.bedsmp.thornsward;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.plugin.java.JavaPlugin;

public final class LeviathanArmorListener implements Listener {

    private final JavaPlugin plugin;
    private final LeviathanArmorItem item;

    public LeviathanArmorListener(JavaPlugin plugin, LeviathanArmorItem item) {
        this.plugin = plugin;
        this.item   = item;
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onDamage(EntityDamageEvent event) {
        if (!(event.getEntity() instanceof Player player)) return;
        if (!item.isLeviathanArmor(player.getInventory().getChestplate())) return;
        if (!player.isInWater()) return;

        double factor = plugin.getConfig().getDouble("leviathan-armor.damage-reduction", 3.0);
        event.setDamage(event.getDamage() / factor);
    }
}
