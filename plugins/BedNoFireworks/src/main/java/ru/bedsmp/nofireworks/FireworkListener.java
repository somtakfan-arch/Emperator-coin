package ru.bedsmp.nofireworks;

import com.destroystokyo.paper.event.player.PlayerElytraBoostEvent;
import com.destroystokyo.paper.event.player.PlayerLaunchProjectileEvent;
import org.bukkit.Material;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Firework;
import org.bukkit.entity.Item;
import org.bukkit.entity.ItemFrame;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockDispenseEvent;
import org.bukkit.event.block.BlockDropItemEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.entity.EntityDropItemEvent;
import io.papermc.paper.event.entity.EntityLoadCrossbowEvent;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.event.entity.EntityShootBowEvent;
import org.bukkit.event.entity.EntitySpawnEvent;
import org.bukkit.event.entity.VillagerAcquireTradeEvent;
import org.bukkit.event.inventory.CraftItemEvent;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.event.inventory.InventoryMoveItemEvent;
import org.bukkit.event.inventory.InventoryOpenEvent;
import org.bukkit.event.inventory.InventoryPickupItemEvent;
import org.bukkit.event.inventory.PrepareItemCraftEvent;
import org.bukkit.event.player.PlayerCommandPreprocessEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.event.server.ServerCommandEvent;
import org.bukkit.event.world.ChunkLoadEvent;
import org.bukkit.event.world.LootGenerateEvent;
import org.bukkit.inventory.ItemStack;

import java.util.List;
import java.util.Locale;

/** Все пути, которыми фейерверк может попасть в игру или быть применён. */
public final class FireworkListener implements Listener {

    /** Команды, после которых стоит перепроверить инвентари игроков. */
    private static final String[] ITEM_COMMANDS = {"give", "item", "loot", "summon", "invsee", "kit"};

    private final BedNoFireworks plugin;

    public FireworkListener(BedNoFireworks plugin) {
        this.plugin = plugin;
    }

    private boolean off() {
        return !plugin.settings().enabled();
    }

    private FireworkCleaner cleaner() {
        return plugin.cleaner();
    }

    private void later(Runnable runnable) {
        plugin.getServer().getScheduler().runTask(plugin, runnable);
    }

    /** Чистит сущность-предмет: полностью удаляет её или обновляет содержимое. */
    private void fixItemEntity(Item entity) {
        ItemStack stack = entity.getItemStack();
        FireworkCleaner.Result result = cleaner().clean(stack);
        if (result == FireworkCleaner.Result.REMOVE) {
            entity.remove();
        } else if (result == FireworkCleaner.Result.CHANGED) {
            entity.setItemStack(stack);
        }
    }

    // ------------------------------------------------------------------
    // Игроки
    // ------------------------------------------------------------------

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        if (off()) return;
        Player player = event.getPlayer();
        cleaner().cleanPlayer(player);
        later(() -> cleaner().cleanPlayer(player));
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onRespawn(PlayerRespawnEvent event) {
        if (off()) return;
        Player player = event.getPlayer();
        later(() -> cleaner().cleanPlayer(player));
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onCommand(PlayerCommandPreprocessEvent event) {
        if (off()) return;
        scheduleCommandCleanup(event.getMessage());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onConsoleCommand(ServerCommandEvent event) {
        if (off()) return;
        scheduleCommandCleanup(event.getCommand());
    }

    private void scheduleCommandCleanup(String rawCommand) {
        String command = rawCommand == null ? "" : rawCommand.toLowerCase(Locale.ROOT);
        for (String keyword : ITEM_COMMANDS) {
            if (command.contains(keyword)) {
                later(() -> {
                    for (Player online : plugin.getServer().getOnlinePlayers()) {
                        cleaner().cleanPlayer(online);
                    }
                });
                return;
            }
        }
    }

    // ------------------------------------------------------------------
    // Запрет использования
    // ------------------------------------------------------------------

    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onInteract(PlayerInteractEvent event) {
        if (off() || !plugin.settings().blockUse()) return;
        ItemStack item = event.getItem();
        if (item == null || !cleaner().isFirework(item.getType())) return;

        event.setCancelled(true);
        plugin.stats().addBlockedUse();
        warn(event.getPlayer());
        Player player = event.getPlayer();
        later(() -> cleaner().cleanPlayer(player));
    }

    /** Разгон на элитрах ракетой. */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onElytraBoost(PlayerElytraBoostEvent event) {
        if (off() || !plugin.settings().blockUse()) return;
        event.setCancelled(true);
        event.setShouldConsume(false);
        plugin.stats().addBlockedUse();
        warn(event.getPlayer());
        Player player = event.getPlayer();
        later(() -> cleaner().cleanPlayer(player));
    }

    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onLaunch(PlayerLaunchProjectileEvent event) {
        if (off() || !plugin.settings().blockUse()) return;
        if (!cleaner().isFirework(event.getItemStack())) return;
        event.setCancelled(true);
        event.setShouldConsume(false);
        plugin.stats().addBlockedUse();
        warn(event.getPlayer());
    }

    /** Зарядка арбалета ракетой: ракета выгружается из арбалета следующим тиком. */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onLoadCrossbow(EntityLoadCrossbowEvent event) {
        if (off() || !plugin.settings().blockCrossbow()) return;
        LivingEntity shooter = event.getEntity();
        later(() -> {
            if (shooter.isValid()) cleaner().cleanEntity(shooter);
        });
    }

    /** Выстрел фейерверком из арбалета. */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onShootBow(EntityShootBowEvent event) {
        if (off() || !plugin.settings().blockCrossbow()) return;
        boolean firework = event.getProjectile() instanceof Firework
                || cleaner().isFirework(event.getConsumable());
        if (!firework) return;
        event.setCancelled(true);
        plugin.stats().addBlockedUse();
        if (event.getEntity() instanceof Player player) warn(player);
    }

    /** Раздатчик с фейерверком. */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onDispense(BlockDispenseEvent event) {
        if (off() || !plugin.settings().blockDispensers()) return;
        if (!cleaner().isFirework(event.getItem())) return;
        event.setCancelled(true);
        plugin.stats().addBlockedUse();
    }

    private void warn(Player player) {
        String message = plugin.settings().message("use-blocked");
        if (message != null && !message.isBlank()) {
            player.sendActionBar(Text.component(message));
        }
    }

    // ------------------------------------------------------------------
    // Инвентари
    // ------------------------------------------------------------------

    @EventHandler(priority = EventPriority.LOWEST)
    public void onInventoryOpen(InventoryOpenEvent event) {
        if (off()) return;
        cleaner().cleanInventory(event.getInventory());
        if (event.getPlayer() instanceof Player player) {
            cleaner().cleanInventory(player.getInventory());
        }
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onInventoryClose(InventoryCloseEvent event) {
        if (off()) return;
        cleaner().cleanInventory(event.getInventory());
        if (event.getPlayer() instanceof Player player) {
            later(() -> cleaner().cleanPlayer(player));
        }
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onInventoryClick(InventoryClickEvent event) {
        if (off() || event.isCancelled()) return;
        if (event.getWhoClicked() instanceof Player player) {
            later(() -> cleaner().cleanPlayer(player));
        }
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onInventoryDrag(InventoryDragEvent event) {
        if (off() || event.isCancelled()) return;
        if (event.getWhoClicked() instanceof Player player) {
            later(() -> cleaner().cleanPlayer(player));
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onHopperMove(InventoryMoveItemEvent event) {
        if (off() || !plugin.settings().hookHoppers()) return;
        ItemStack item = event.getItem();
        FireworkCleaner.Result result = cleaner().clean(item);
        if (result == FireworkCleaner.Result.REMOVE) {
            event.setCancelled(true);
        } else if (result == FireworkCleaner.Result.CHANGED) {
            event.setItem(item);
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onHopperPickup(InventoryPickupItemEvent event) {
        if (off()) return;
        if (cleaner().isFirework(event.getItem().getItemStack())) {
            event.setCancelled(true);
        }
        fixItemEntity(event.getItem());
    }

    // ------------------------------------------------------------------
    // Предметы в мире
    // ------------------------------------------------------------------

    @EventHandler(priority = EventPriority.MONITOR)
    public void onEntitySpawn(EntitySpawnEvent event) {
        if (off()) return;
        Entity entity = event.getEntity();

        if (entity instanceof Firework firework) {
            if (plugin.settings().removeEntities()) {
                firework.remove();
                plugin.stats().addEntity();
            }
            return;
        }
        if (entity instanceof Item item) {
            fixItemEntity(item);
            return;
        }
        if (entity instanceof LivingEntity || entity instanceof ItemFrame
                || entity instanceof org.bukkit.inventory.InventoryHolder) {
            later(() -> {
                if (entity.isValid()) cleaner().cleanEntity(entity);
            });
        }
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onPlayerDrop(PlayerDropItemEvent event) {
        if (off() || event.isCancelled()) return;
        fixItemEntity(event.getItemDrop());
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onEntityDrop(EntityDropItemEvent event) {
        if (off() || event.isCancelled()) return;
        fixItemEntity(event.getItemDrop());
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onBlockDrop(BlockDropItemEvent event) {
        if (off()) return;
        for (Item drop : event.getItems()) {
            fixItemEntity(drop);
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST)
    public void onDeath(EntityDeathEvent event) {
        if (off()) return;
        cleaner().cleanList(event.getDrops());
        if (event.getEntity() instanceof Player player) {
            later(() -> cleaner().cleanPlayer(player));
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onPickup(EntityPickupItemEvent event) {
        if (off()) return;
        if (cleaner().isFirework(event.getItem().getItemStack())) {
            event.setCancelled(true);
        }
        fixItemEntity(event.getItem());
    }

    // ------------------------------------------------------------------
    // Лут, торговля, крафт
    // ------------------------------------------------------------------

    @EventHandler(priority = EventPriority.HIGHEST)
    public void onLootGenerate(LootGenerateEvent event) {
        if (off()) return;
        List<ItemStack> loot = event.getLoot();
        if (cleaner().cleanList(loot)) {
            event.setLoot(loot);
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onVillagerTrade(VillagerAcquireTradeEvent event) {
        if (off()) return;
        if (cleaner().isFireworkTrade(event.getRecipe())) {
            event.setCancelled(true);
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST)
    public void onPrepareCraft(PrepareItemCraftEvent event) {
        if (off() || !plugin.settings().blockCrafting()) return;
        ItemStack result = event.getInventory().getResult();
        if (cleaner().isFirework(result)) {
            event.getInventory().setResult(new ItemStack(Material.AIR));
        }
    }

    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onCraft(CraftItemEvent event) {
        if (off() || !plugin.settings().blockCrafting()) return;
        if (cleaner().isFirework(event.getRecipe().getResult())) {
            event.setCancelled(true);
            if (event.getWhoClicked() instanceof Player player) warn(player);
        }
    }

    // ------------------------------------------------------------------
    // Мир
    // ------------------------------------------------------------------

    @EventHandler(priority = EventPriority.MONITOR)
    public void onChunkLoad(ChunkLoadEvent event) {
        if (off() || !plugin.settings().sweepOnChunkLoad()) return;
        plugin.sweepTask().enqueue(event.getChunk());
    }
}
