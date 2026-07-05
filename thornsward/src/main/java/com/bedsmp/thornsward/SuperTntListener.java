package com.bedsmp.thornsward;

import org.bukkit.Location;
import org.bukkit.Material;
import org.bukkit.NamespacedKey;
import org.bukkit.block.Block;
import org.bukkit.entity.TNTPrimed;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockIgniteEvent;
import org.bukkit.event.block.BlockPlaceEvent;
import org.bukkit.event.entity.EntityExplodeEvent;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.HashSet;
import java.util.Set;

public final class SuperTntListener implements Listener {

    private final JavaPlugin plugin;
    private final SuperTntItem item;
    private final NamespacedKey primedKey;
    // Tracks locations of placed super TNT blocks
    private final Set<String> superBlocks = new HashSet<>();

    public SuperTntListener(JavaPlugin plugin, SuperTntItem item) {
        this.plugin     = plugin;
        this.item       = item;
        this.primedKey  = new NamespacedKey(plugin, "super_tnt_primed");
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onPlace(BlockPlaceEvent event) {
        if (!item.isSuperTnt(event.getItemInHand())) return;
        superBlocks.add(key(event.getBlock().getLocation()));
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onBreak(BlockBreakEvent event) {
        Block block = event.getBlock();
        if (block.getType() != Material.TNT) return;
        String k = key(block.getLocation());
        if (!superBlocks.remove(k)) return;

        event.setDropItems(false);
        block.getWorld().dropItemNaturally(
                block.getLocation().add(0.5, 0.5, 0.5), item.create());
    }

    @EventHandler(priority = EventPriority.HIGH, ignoreCancelled = true)
    public void onIgnite(BlockIgniteEvent event) {
        Block block = event.getBlock();
        if (block.getType() != Material.TNT) return;
        String k = key(block.getLocation());
        if (!superBlocks.remove(k)) return;

        // Cancel vanilla priming so we can spawn our own TNTPrimed
        event.setCancelled(true);
        block.setType(Material.AIR);

        Location spawnLoc = block.getLocation().add(0.5, 0, 0.5);
        block.getWorld().spawn(spawnLoc, TNTPrimed.class, tnt -> {
            tnt.setFuseTicks(80);
            tnt.getPersistentDataContainer().set(primedKey, PersistentDataType.BYTE, (byte) 1);
        });
    }

    @EventHandler(priority = EventPriority.HIGH)
    public void onExplode(EntityExplodeEvent event) {
        // Clean up any tracked super TNT blocks that vanilla explosion would destroy
        event.blockList().stream()
                .filter(b -> b.getType() == Material.TNT)
                .forEach(b -> superBlocks.remove(key(b.getLocation())));

        if (!(event.getEntity() instanceof TNTPrimed tnt)) return;
        if (!tnt.getPersistentDataContainer().has(primedKey, PersistentDataType.BYTE)) return;

        // Remove marker before creating explosion so there's no recursion risk
        tnt.getPersistentDataContainer().remove(primedKey);

        float power    = (float) plugin.getConfig().getDouble("super-tnt.power", 20.0);
        boolean fire   = plugin.getConfig().getBoolean("super-tnt.set-fire", true);

        event.setCancelled(true);
        Location loc = tnt.getLocation();
        // createExplosion naturally ignites nearby TNT blocks (chain reaction)
        loc.getWorld().createExplosion(loc, power, fire, true);
    }

    private static String key(Location loc) {
        return loc.getWorld().getName() + "," + loc.getBlockX() + "," + loc.getBlockY() + "," + loc.getBlockZ();
    }
}
