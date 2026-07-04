package com.bedsmp.thornsward;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Entity;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.Listener;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;

import java.util.concurrent.ThreadLocalRandom;

public final class ChaosFeatherListener implements Listener {

    // 4 seconds — longer than the 3-second interval so effects don't briefly lapse
    private static final int EFFECT_TICKS = 80;

    private final JavaPlugin plugin;
    private final ChaosFeatherItem item;

    public ChaosFeatherListener(JavaPlugin plugin, ChaosFeatherItem item) {
        this.plugin = plugin;
        this.item   = item;
        plugin.getServer().getScheduler().runTaskTimer(plugin, this::tick, 60L, 60L);
    }

    private void tick() {
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            if (!item.isChaosFeather(player.getInventory().getItemInOffHand())) continue;

            int roll = ThreadLocalRandom.current().nextInt(3);

            applyEffect(player, roll);
            for (Entity nearby : player.getNearbyEntities(10, 10, 10)) {
                if (nearby instanceof LivingEntity living) applyEffect(living, roll);
            }

            String label = switch (roll) {
                case 0  -> "§9Замедление";
                case 1  -> "§fОбычная скорость";
                default -> "§aСкорость";
            };
            float pitch = roll == 0 ? 0.5f : (roll == 2 ? 1.5f : 1f);
            player.playSound(player.getLocation(), Sound.ENTITY_BAT_AMBIENT, 0.7f, pitch);
            player.getWorld().spawnParticle(Particle.WITCH,
                    player.getLocation().add(0, 1.2, 0), 15, 1.0, 0.6, 1.0, 0.08);
            player.sendActionBar(Component.text("Перо Хаоса: " + label, NamedTextColor.LIGHT_PURPLE));
        }
    }

    private void applyEffect(LivingEntity entity, int roll) {
        entity.removePotionEffect(PotionEffectType.SPEED);
        entity.removePotionEffect(PotionEffectType.SLOWNESS);
        switch (roll) {
            case 0 -> entity.addPotionEffect(new PotionEffect(PotionEffectType.SLOWNESS,  EFFECT_TICKS, 2, true, false));
            case 2 -> entity.addPotionEffect(new PotionEffect(PotionEffectType.SPEED,     EFFECT_TICKS, 2, true, false));
            // case 1: normal — effects already removed
        }
    }
}
