package com.bedsmp.thornsward;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Sound;
import org.bukkit.entity.EntityType;
import org.bukkit.entity.Player;
import org.bukkit.event.Event;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.Action;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

public final class ChaosWhistleListener implements Listener {

    private static final EntityType[] MOBS = {
            EntityType.SKELETON, EntityType.CREEPER, EntityType.ENDERMAN,
            EntityType.ZOMBIE, EntityType.WITCH, EntityType.PILLAGER,
            EntityType.PHANTOM, EntityType.SPIDER
    };

    private final JavaPlugin plugin;
    private final ChaosWhistleItem item;
    private final Map<UUID, Long> cooldowns = new HashMap<>();

    public ChaosWhistleListener(JavaPlugin plugin, ChaosWhistleItem item) {
        this.plugin = plugin;
        this.item   = item;
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteract(PlayerInteractEvent event) {
        if (event.getHand() != EquipmentSlot.HAND) return;
        if (event.getAction() != Action.RIGHT_CLICK_AIR && event.getAction() != Action.RIGHT_CLICK_BLOCK) return;

        Player player = event.getPlayer();
        if (!item.isChaosWhistle(player.getInventory().getItemInMainHand())) return;

        event.setUseItemInHand(Event.Result.DENY);

        int cooldownSec = plugin.getConfig().getInt("chaos-whistle.cooldown-seconds", 30);
        long now = System.currentTimeMillis();
        Long last = cooldowns.get(player.getUniqueId());
        if (last != null && now - last < cooldownSec * 1000L) {
            long rem = cooldownSec - (now - last) / 1000;
            player.sendMessage(Component.text("Кулдаун: " + rem + " сек.", NamedTextColor.YELLOW));
            return;
        }

        // Find nearest other player
        Player nearest = null;
        double nearestDist = Double.MAX_VALUE;
        for (Player p : player.getWorld().getPlayers()) {
            if (p.equals(player)) continue;
            double d = p.getLocation().distanceSquared(player.getLocation());
            if (d < nearestDist) { nearestDist = d; nearest = p; }
        }

        if (nearest == null) {
            player.sendMessage(Component.text("Нет врагов поблизости!", NamedTextColor.RED));
            return;
        }

        EntityType chosen = MOBS[ThreadLocalRandom.current().nextInt(MOBS.length)];
        nearest.getWorld().spawnEntity(nearest.getLocation(), chosen);
        cooldowns.put(player.getUniqueId(), now);

        player.playSound(player.getLocation(), Sound.ENTITY_GOAT_HORN_BREAK, 1f, 0.5f);
        player.sendMessage(Component.text("Свисток вызвал " + mobName(chosen) +
                " у игрока " + nearest.getName() + "!", NamedTextColor.DARK_PURPLE));
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        cooldowns.remove(event.getPlayer().getUniqueId());
    }

    private String mobName(EntityType type) {
        return switch (type) {
            case SKELETON -> "Скелет";
            case CREEPER  -> "Крипер";
            case ENDERMAN -> "Эндермен";
            case ZOMBIE   -> "Зомби";
            case WITCH    -> "Ведьму";
            case PILLAGER -> "Разбойника";
            case PHANTOM  -> "Фантома";
            case SPIDER   -> "Паука";
            default       -> type.name();
        };
    }
}
