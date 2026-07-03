package com.bedsmp.thornsward;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Location;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public final class EchoPastListener implements Listener {

    private final JavaPlugin plugin;
    private final EchoPastItem item;
    private final Map<UUID, ArrayDeque<Location>> history = new HashMap<>();

    public EchoPastListener(JavaPlugin plugin, EchoPastItem item) {
        this.plugin = plugin;
        this.item   = item;
        // Record every player's position once per second
        plugin.getServer().getScheduler().runTaskTimer(plugin, this::recordPositions, 20L, 20L);
    }

    private void recordPositions() {
        int maxEntries = plugin.getConfig().getInt("echo-past.history-seconds", 30);
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            ArrayDeque<Location> deque = history.computeIfAbsent(player.getUniqueId(), k -> new ArrayDeque<>());
            deque.addLast(player.getLocation().clone());
            while (deque.size() > maxEntries) deque.pollFirst();
        }
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteract(PlayerInteractEvent event) {
        if (event.getHand() != EquipmentSlot.HAND) return;
        if (event.getAction() != Action.RIGHT_CLICK_AIR && event.getAction() != Action.RIGHT_CLICK_BLOCK) return;

        Player player = event.getPlayer();
        ItemStack held = player.getInventory().getItemInMainHand();
        if (!item.isEchoPast(held)) return;

        event.setUseItemInHand(Event.Result.DENY);

        ArrayDeque<Location> deque = history.getOrDefault(player.getUniqueId(), new ArrayDeque<>());
        if (deque.isEmpty()) {
            player.sendMessage(Component.text("Нет истории перемещений!", NamedTextColor.RED));
            return;
        }

        Location dest = deque.peekFirst();
        if (dest == null || dest.getWorld() == null) {
            player.sendMessage(Component.text("Нет истории перемещений!", NamedTextColor.RED));
            return;
        }

        player.teleport(dest);
        player.playSound(dest, Sound.ENTITY_ENDERMAN_TELEPORT, 1f, 0.7f);
        player.sendMessage(Component.text("Эхо перенесло тебя на " + deque.size() + " сек назад!", NamedTextColor.LIGHT_PURPLE));

        item.decrementUses(held);
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        history.remove(event.getPlayer().getUniqueId());
    }
}
