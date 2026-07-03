package com.bedsmp.thornsward;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

public final class PhoenixAshListener implements Listener {

    private final JavaPlugin plugin;
    private final PhoenixAshItem item;
    private final Set<UUID> processing = new HashSet<>();

    public PhoenixAshListener(JavaPlugin plugin, PhoenixAshItem item) {
        this.plugin = plugin;
        this.item   = item;
    }

    @EventHandler(priority = EventPriority.HIGHEST)
    public void onDamage(EntityDamageEvent event) {
        if (event.isCancelled()) return;
        if (!(event.getEntity() instanceof Player player)) return;
        if (processing.contains(player.getUniqueId())) return;
        if (player.getHealth() - event.getFinalDamage() > 0) return; // won't die

        ItemStack ash = findAsh(player);
        if (ash == null) return;

        event.setCancelled(true);
        processing.add(player.getUniqueId());

        // Consume ash
        if (ash.getAmount() > 1) ash.setAmount(ash.getAmount() - 1);
        else player.getInventory().remove(ash);

        double reviveHealth = plugin.getConfig().getDouble("phoenix-ash.revive-health", 8.0);
        player.setHealth(Math.min(reviveHealth, player.getMaxHealth()));
        player.addPotionEffect(new PotionEffect(PotionEffectType.FIRE_RESISTANCE, 200, 0, false, true));

        player.getWorld().spawnParticle(Particle.FLAME, player.getLocation().add(0, 1, 0), 60, 0.4, 0.8, 0.4, 0.05);
        player.playSound(player.getLocation(), Sound.ENTITY_BLAZE_SHOOT, 1f, 0.5f);
        player.sendMessage(Component.text("Пепел Феникса сгорел, но возродил тебя!", NamedTextColor.GOLD));

        plugin.getServer().getScheduler().runTask(plugin,
                () -> processing.remove(player.getUniqueId()));
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        processing.remove(event.getPlayer().getUniqueId());
    }

    private ItemStack findAsh(Player player) {
        for (ItemStack stack : player.getInventory().getContents()) {
            if (item.isPhoenixAsh(stack)) return stack;
        }
        return null;
    }
}
