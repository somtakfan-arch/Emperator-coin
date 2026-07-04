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
import org.bukkit.event.entity.EntityDamageEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

public final class VoodooDollListener implements Listener {

    private final JavaPlugin plugin;
    private final VoodooDollItem item;
    // victim UUID → linked target UUID
    private final Map<UUID, UUID> linked    = new HashMap<>();
    private final Set<UUID>       charging  = new HashSet<>();
    // anti-recursion: prevents mirrored damage re-triggering this handler
    private final Set<UUID>       processing = new HashSet<>();

    public VoodooDollListener(JavaPlugin plugin, VoodooDollItem item) {
        this.plugin = plugin;
        this.item   = item;
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteract(PlayerInteractEvent event) {
        if (event.getHand() != EquipmentSlot.HAND) return;
        if (event.getAction() != Action.RIGHT_CLICK_AIR && event.getAction() != Action.RIGHT_CLICK_BLOCK) return;

        Player player = event.getPlayer();
        if (!item.isVoodooDoll(player.getInventory().getItemInMainHand())) return;

        event.setUseItemInHand(Event.Result.DENY);

        if (charging.contains(player.getUniqueId())) return;
        charging.add(player.getUniqueId());

        player.sendMessage(Component.text("Держите ПКМ 2 секунды...", NamedTextColor.DARK_PURPLE));
        player.playSound(player.getLocation(), Sound.BLOCK_ENCHANTMENT_TABLE_USE, 0.8f, 0.5f);

        plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
            charging.remove(player.getUniqueId());
            if (!player.isOnline()) return;
            if (!item.isVoodooDoll(player.getInventory().getItemInMainHand())) return;

            Player nearest = null;
            double nearestDist = Double.MAX_VALUE;
            for (Player p : player.getWorld().getPlayers()) {
                if (p.equals(player)) continue;
                double d = p.getLocation().distanceSquared(player.getLocation());
                if (d < nearestDist) { nearestDist = d; nearest = p; }
            }

            if (nearest == null) {
                player.sendMessage(Component.text("Нет других игроков рядом!", NamedTextColor.RED));
                return;
            }

            linked.put(player.getUniqueId(), nearest.getUniqueId());

            // Consume item
            player.getInventory().getItemInMainHand().setAmount(0);

            player.playSound(player.getLocation(), Sound.ENTITY_WITCH_CELEBRATE, 1f, 0.6f);
            nearest.playSound(nearest.getLocation(), Sound.ENTITY_WITCH_HURT, 1f, 0.8f);

            player.sendMessage(Component.text("Связь установлена с ", NamedTextColor.DARK_PURPLE)
                    .append(Component.text(nearest.getName(), NamedTextColor.LIGHT_PURPLE))
                    .append(Component.text(" на 10 секунд!", NamedTextColor.DARK_PURPLE)));
            nearest.sendMessage(Component.text("☠ На вас наложено проклятие Куклы Вуду!", NamedTextColor.DARK_PURPLE));

            player.getWorld().spawnParticle(Particle.WITCH,
                    player.getLocation().add(0, 1, 0), 20, 0.3, 0.5, 0.3, 0);

            Player finalNearest = nearest;
            plugin.getServer().getScheduler().runTaskLater(plugin, () -> {
                if (linked.remove(player.getUniqueId()) != null) {
                    if (player.isOnline())
                        player.sendMessage(Component.text("Связь Куклы Вуду истекла.", NamedTextColor.GRAY));
                    if (finalNearest.isOnline())
                        finalNearest.sendMessage(Component.text("Проклятие Куклы Вуду снято.", NamedTextColor.GRAY));
                }
            }, 200L);
        }, 40L);
    }

    @EventHandler(priority = EventPriority.HIGHEST)
    public void onDamage(EntityDamageEvent event) {
        if (!(event.getEntity() instanceof Player victim)) return;
        if (event.isCancelled()) return;
        if (processing.contains(victim.getUniqueId())) return;

        UUID targetId = linked.get(victim.getUniqueId());
        if (targetId == null) return;

        Player target = plugin.getServer().getPlayer(targetId);
        if (target == null || !target.isOnline()) {
            linked.remove(victim.getUniqueId());
            return;
        }

        double damage = event.getFinalDamage();
        processing.add(target.getUniqueId());
        try {
            target.damage(damage);
        } finally {
            processing.remove(target.getUniqueId());
        }

        target.playSound(target.getLocation(), Sound.ENTITY_WITCH_HURT, 0.8f, 1.2f);
        target.getWorld().spawnParticle(Particle.WITCH,
                target.getLocation().add(0, 1, 0), 8, 0.3, 0.5, 0.3, 0);
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        UUID id = event.getPlayer().getUniqueId();
        charging.remove(id);
        linked.remove(id);
        processing.remove(id);
    }
}
