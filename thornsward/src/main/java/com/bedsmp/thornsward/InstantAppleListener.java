package com.bedsmp.thornsward;

import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.potion.PotionEffect;
import org.bukkit.potion.PotionEffectType;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

public final class InstantAppleListener implements Listener {

    private final JavaPlugin plugin;
    private final InstantAppleItem appleItem;
    private final Set<UUID> processing = new HashSet<>();

    public InstantAppleListener(JavaPlugin plugin, InstantAppleItem appleItem) {
        this.plugin = plugin;
        this.appleItem = appleItem;
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteract(PlayerInteractEvent event) {
        if (event.getAction() != org.bukkit.event.block.Action.RIGHT_CLICK_AIR
                && event.getAction() != org.bukkit.event.block.Action.RIGHT_CLICK_BLOCK) return;

        Player player = event.getPlayer();

        // Paper fires event twice (HAND + OFF_HAND) — process only once per click
        if (!processing.add(player.getUniqueId())) return;
        plugin.getServer().getScheduler().runTask(plugin, () -> processing.remove(player.getUniqueId()));

        EquipmentSlot hand = event.getHand();
        if (hand == null) return;
        ItemStack item = hand == EquipmentSlot.HAND
                ? player.getInventory().getItemInMainHand()
                : player.getInventory().getItemInOffHand();

        if (!appleItem.isInstantApple(item)) return;

        // Suppress vanilla eat animation / sound
        event.setUseItemInHand(Event.Result.DENY);

        // Restore hunger
        player.setFoodLevel(20);
        player.setSaturation(20.0f);
        player.setExhaustion(0.0f);

        // God apple effects (matching vanilla ENCHANTED_GOLDEN_APPLE)
        player.addPotionEffect(new PotionEffect(PotionEffectType.REGENERATION,  400,  3, false, true, true));
        player.addPotionEffect(new PotionEffect(PotionEffectType.ABSORPTION,    2400, 3, false, true, true));
        player.addPotionEffect(new PotionEffect(PotionEffectType.RESISTANCE,    6000, 0, false, true, true));
        player.addPotionEffect(new PotionEffect(PotionEffectType.FIRE_RESISTANCE, 6000, 0, false, true, true));

        // Consume one apple
        if (item.getAmount() > 1) {
            item.setAmount(item.getAmount() - 1);
        } else {
            if (hand == EquipmentSlot.HAND) {
                player.getInventory().setItemInMainHand(null);
            } else {
                player.getInventory().setItemInOffHand(null);
            }
        }

        // Play eat + burp sounds
        player.playSound(player.getLocation(), Sound.ENTITY_PLAYER_BURP, 1.0f, 1.0f);
        player.playSound(player.getLocation(), Sound.ENTITY_GENERIC_EAT, 0.5f, 1.0f);
    }
}
