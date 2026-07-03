package com.bedsmp.thornsward;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Material;
import org.bukkit.Particle;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.entity.Projectile;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.util.Vector;
import org.bukkit.Location;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

public final class RevengeThornListener implements Listener {

    private final JavaPlugin plugin;
    private final RevengeThornItem item;

    private final Map<UUID, UUID> lastAttacker = new HashMap<>();
    private final Map<UUID, Long> cooldowns    = new HashMap<>();

    public RevengeThornListener(JavaPlugin plugin, RevengeThornItem item) {
        this.plugin = plugin;
        this.item   = item;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onDamage(EntityDamageByEntityEvent event) {
        if (!(event.getEntity() instanceof Player victim)) return;
        if (!wearingRevengeThorn(victim)) return;

        Player attacker = null;
        if (event.getDamager() instanceof Player p) {
            attacker = p;
        } else if (event.getDamager() instanceof Projectile proj
                && proj.getShooter() instanceof Player p) {
            attacker = p;
        }
        if (attacker == null || attacker.equals(victim)) return;

        lastAttacker.put(victim.getUniqueId(), attacker.getUniqueId());
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onInteract(PlayerInteractEvent event) {
        if (event.getHand() != EquipmentSlot.HAND) return;
        if (event.getAction() != org.bukkit.event.block.Action.RIGHT_CLICK_AIR
                && event.getAction() != org.bukkit.event.block.Action.RIGHT_CLICK_BLOCK) return;

        Player player = event.getPlayer();
        if (player.getInventory().getItemInMainHand().getType() != Material.AIR) return;
        if (!wearingRevengeThorn(player)) return;

        UUID attackerId = lastAttacker.get(player.getUniqueId());
        if (attackerId == null) {
            player.sendMessage(Component.text("Нет цели для телепортации.", NamedTextColor.GRAY));
            return;
        }

        Player target = plugin.getServer().getPlayer(attackerId);
        if (target == null || !target.isOnline() || !target.getWorld().equals(player.getWorld())) {
            player.sendMessage(Component.text("Цель недоступна.", NamedTextColor.RED));
            lastAttacker.remove(player.getUniqueId());
            return;
        }

        double maxRange = plugin.getConfig().getDouble("revenge-thorn.max-range-blocks", 50.0);
        if (player.getLocation().distanceSquared(target.getLocation()) > maxRange * maxRange) {
            player.sendMessage(Component.text("Цель слишком далеко (>" + (int) maxRange + " блоков).", NamedTextColor.RED));
            return;
        }

        int cooldownSec = plugin.getConfig().getInt("revenge-thorn.teleport-cooldown-seconds", 20);
        long now = System.currentTimeMillis();
        Long last = cooldowns.get(player.getUniqueId());
        if (last != null && now - last < cooldownSec * 1000L) {
            long remaining = cooldownSec - (now - last) / 1000;
            player.sendMessage(Component.text("Кулдаун: " + remaining + " сек.", NamedTextColor.YELLOW));
            return;
        }

        double dist = plugin.getConfig().getDouble("revenge-thorn.teleport-distance", 3.0);
        Location attackerLoc = target.getLocation();
        Vector dir = player.getLocation().toVector().subtract(attackerLoc.toVector());
        dir.setY(0);
        if (dir.lengthSquared() < 0.0001) dir = new Vector(1, 0, 0);
        dir = dir.normalize().multiply(dist);

        Location dest = attackerLoc.clone().add(dir);
        dest.setY(attackerLoc.getY());

        Vector toTarget = attackerLoc.toVector().subtract(dest.toVector());
        float yaw = (float) Math.toDegrees(Math.atan2(-toTarget.getX(), toTarget.getZ()));
        dest.setYaw(yaw);
        dest.setPitch(0f);

        player.teleport(dest);
        cooldowns.put(player.getUniqueId(), now);

        player.getWorld().spawnParticle(Particle.CRIT, dest, 20, 0.3, 0.5, 0.3, 0.1);
        player.playSound(dest, Sound.ENTITY_ENDERMAN_TELEPORT, 1f, 1.2f);
        player.sendMessage(Component.text("Телепортация к " + target.getName() + "!", NamedTextColor.RED));
    }

    @EventHandler
    public void onQuit(PlayerQuitEvent event) {
        UUID id = event.getPlayer().getUniqueId();
        lastAttacker.remove(id);
        cooldowns.remove(id);
    }

    private boolean wearingRevengeThorn(Player player) {
        return item.isRevengeThorn(player.getInventory().getChestplate());
    }
}
