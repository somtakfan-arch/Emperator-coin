package com.bedsmp.thornsward;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;
import org.bukkit.util.Vector;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

public final class ChronoStoneListener implements Listener {

    private final JavaPlugin plugin;
    private final ChronoStoneItem item;
    private final Set<UUID> frozen = new HashSet<>();

    public ChronoStoneListener(JavaPlugin plugin, ChronoStoneItem item) {
        this.plugin = plugin;
        this.item   = item;
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteract(PlayerInteractEvent event) {
        if (event.getHand() != EquipmentSlot.HAND) return;
        if (event.getAction() != Action.RIGHT_CLICK_AIR && event.getAction() != Action.RIGHT_CLICK_BLOCK) return;

        Player player = event.getPlayer();
        ItemStack held = player.getInventory().getItemInMainHand();
        if (!item.isChronoStone(held)) return;

        event.setUseItemInHand(Event.Result.DENY);

        // Consume
        if (held.getAmount() > 1) held.setAmount(held.getAmount() - 1);
        else player.getInventory().setItemInMainHand(null);

        int freezeSec = plugin.getConfig().getInt("chrono-stone.freeze-seconds", 5);
        int speedSec  = plugin.getConfig().getInt("chrono-stone.speed-duration-seconds", 3);
        int freezeTicks = freezeSec * 20;
        int speedTicks  = speedSec * 20;

        player.addPotionEffect(new PotionEffect(PotionEffectType.SLOWNESS,    freezeTicks, 255, false, false));
        player.addPotionEffect(new PotionEffect(PotionEffectType.INVISIBILITY, freezeTicks, 0,   false, false));
        player.addPotionEffect(new PotionEffect(PotionEffectType.RESISTANCE,   freezeTicks, 255, false, false));
        player.sendMessage(Component.text("Время остановлено на " + freezeSec + " сек!", NamedTextColor.YELLOW));

        UUID uid = player.getUniqueId();
        frozen.add(uid);
        int[] ticks = {0};
        plugin.getServer().getScheduler().runTaskTimer(plugin, task -> {
            ticks[0]++;
            if (!player.isOnline() || ticks[0] > freezeTicks) {
                frozen.remove(uid);
                task.cancel();
                if (player.isOnline()) {
                    player.removePotionEffect(PotionEffectType.SLOWNESS);
                    player.removePotionEffect(PotionEffectType.INVISIBILITY);
                    player.removePotionEffect(PotionEffectType.RESISTANCE);
                    player.addPotionEffect(new PotionEffect(PotionEffectType.SPEED, speedTicks, 1, false, true));
                    player.sendMessage(Component.text("Время возобновлено! Скорость II на " + speedSec + " сек.", NamedTextColor.GREEN));
                    player.playSound(player.getLocation(), Sound.BLOCK_BEACON_ACTIVATE, 0.8f, 1.2f);
                }
                return;
            }
            // Lock XZ movement, keep gravity
            Vector vel = player.getVelocity();
            player.setVelocity(new Vector(0, Math.min(vel.getY(), 0), 0));
            // Particle trail
            if (ticks[0] % 5 == 0) {
                player.getWorld().spawnParticle(Particle.SNOWFLAKE, player.getLocation().add(0, 1, 0), 5, 0.3, 0.5, 0.3, 0);
            }
        }, 0L, 1L);

        player.playSound(player.getLocation(), Sound.BLOCK_BEACON_POWER_SELECT, 1f, 0.5f);
    }
}
