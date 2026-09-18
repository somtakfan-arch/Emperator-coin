package ru.bedsmp.notridents;

import org.bukkit.entity.Entity;
import org.bukkit.entity.Item;
import org.bukkit.entity.ItemFrame;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.entity.Trident;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockDropItemEvent;
import org.bukkit.event.enchantment.EnchantItemEvent;
import org.bukkit.event.enchantment.PrepareItemEnchantEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import org.bukkit.event.entity.EntityDropItemEvent;
import org.bukkit.event.entity.EntityPickupItemEvent;
import org.bukkit.event.entity.EntitySpawnEvent;
import org.bukkit.event.entity.ProjectileLaunchEvent;
import org.bukkit.event.entity.VillagerAcquireTradeEvent;
import org.bukkit.event.inventory.InventoryClickEvent;
import org.bukkit.event.inventory.InventoryCloseEvent;
import org.bukkit.event.inventory.InventoryDragEvent;
import org.bukkit.event.inventory.InventoryMoveItemEvent;
import org.bukkit.event.inventory.InventoryOpenEvent;
import org.bukkit.event.inventory.InventoryPickupItemEvent;
import org.bukkit.event.player.PlayerCommandPreprocessEvent;
import org.bukkit.event.player.PlayerDropItemEvent;
import org.bukkit.event.player.PlayerInteractEvent;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.event.player.PlayerRiptideEvent;
import org.bukkit.event.server.ServerCommandEvent;
import org.bukkit.event.world.ChunkLoadEvent;
import org.bukkit.event.world.LootGenerateEvent;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.MerchantRecipe;
import com.destroystokyo.paper.event.inventory.PrepareResultEvent;

import java.util.List;
import java.util.Locale;

/** Все пути, которыми трезубец или запрещённые чары могут попасть в игру. */
public final class TridentListener implements Listener {

    private static final String[] ITEM_COMMANDS = {"give", "item", "enchant", "loot", "summon", "invsee", "kit"};

    private final BedNoTridents plugin;

    public TridentListener(BedNoTridents plugin) {
        this.plugin = plugin;
    }

    private boolean off() {
        return !plugin.settings().enabled();
    }

    private TridentCleaner cleaner() {
        return plugin.cleaner();
    }

    private void later(Runnable runnable) {
        plugin.getServer().getScheduler().runTask(plugin, runnable);
    }

    private void fixItemEntity(Item entity) {
        TridentCleaner.Outcome outcome = cleaner().clean(entity.getItemStack());
        if (outcome.isRemove()) {
            entity.remove();
        } else if (outcome.isChanged()) {
            entity.setItemStack(outcome.item());
        }
    }

    private void warn(Player player, String key) {
        String message = plugin.settings().message(key);
        if (message != null && !message.isBlank()) {
            player.sendActionBar(Text.component(message));
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
    // Запрет применения
    // ------------------------------------------------------------------

    /** Правый клик с трезубцем — это и бросок, и разгон Тягуном. */
    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onInteract(PlayerInteractEvent event) {
        if (off() || !plugin.settings().blockUse()) return;
        ItemStack item = event.getItem();
        if (item == null || !cleaner().isTrident(item.getType())) return;

        event.setCancelled(true);
        plugin.stats().addBlockedUse();
        warn(event.getPlayer(), "use-blocked");
        Player player = event.getPlayer();
        later(() -> cleaner().cleanPlayer(player));
    }

    @EventHandler(priority = EventPriority.LOWEST, ignoreCancelled = true)
    public void onProjectileLaunch(ProjectileLaunchEvent event) {
        if (off() || !plugin.settings().blockUse()) return;
        if (!(event.getEntity() instanceof Trident)) return;
        event.setCancelled(true);
        plugin.stats().addBlockedUse();
    }

    /** Если Тягун всё-таки сработал (например, выдан другим плагином) — чистим сразу. */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onRiptide(PlayerRiptideEvent event) {
        if (off()) return;
        Player player = event.getPlayer();
        plugin.stats().addBlockedUse();
        later(() -> cleaner().cleanPlayer(player));
    }

    // ------------------------------------------------------------------
    // Зачарование
    // ------------------------------------------------------------------

    @EventHandler(priority = EventPriority.LOWEST)
    public void onPrepareEnchant(PrepareItemEnchantEvent event) {
        if (off() || !plugin.settings().blockEnchanting()) return;
        if (cleaner().isTrident(event.getItem().getType())) {
            event.setCancelled(true);
        }
    }

    @EventHandler(priority = EventPriority.LOWEST)
    public void onEnchant(EnchantItemEvent event) {
        if (off() || !plugin.settings().blockEnchanting()) return;

        boolean trident = cleaner().isTrident(event.getItem().getType());
        boolean banned = event.getEnchantsToAdd().keySet().stream()
                .anyMatch(enchantment -> plugin.settings().enchantmentsEnabled()
                        && plugin.settings().enchantmentFilter().matches(enchantment));
        if (!trident && !banned) return;

        event.getEnchantsToAdd().keySet().removeIf(enchantment ->
                plugin.settings().enchantmentsEnabled()
                        && plugin.settings().enchantmentFilter().matches(enchantment));
        if (trident || event.getEnchantsToAdd().isEmpty()) {
            event.setCancelled(true);
        }
        plugin.stats().addBlockedUse();
        warn(event.getEnchanter(), "enchanting-blocked");
    }

    /** Наковальня, точило, кузнечный стол. */
    @EventHandler(priority = EventPriority.HIGHEST)
    public void onPrepareResult(PrepareResultEvent event) {
        if (off()) return;
        TridentCleaner.Outcome outcome = cleaner().clean(event.getResult());
        if (outcome.isRemove()) {
            event.setResult(null);
        } else if (outcome.isChanged()) {
            event.setResult(outcome.item());
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
        TridentCleaner.Outcome outcome = cleaner().clean(event.getItem());
        if (outcome.isRemove()) {
            event.setCancelled(true);
        } else if (outcome.isChanged()) {
            event.setItem(outcome.item());
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onHopperPickup(InventoryPickupItemEvent event) {
        if (off()) return;
        if (cleaner().isTrident(event.getItem().getItemStack())) {
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

        if (entity instanceof Trident trident) {
            if (plugin.settings().removeTridents() && plugin.settings().removeEntities()) {
                trident.remove();
                plugin.stats().addEntity();
            }
            return;
        }
        if (entity instanceof Item item) {
            fixItemEntity(item);
            return;
        }
        // утопленники получают трезубец на тик позже спавна
        if (entity instanceof LivingEntity || entity instanceof ItemFrame || entity instanceof InventoryHolder) {
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

    /** Утопленники роняют трезубцы — вырезаем из дропа. */
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
        if (cleaner().isTrident(event.getItem().getItemStack())) {
            event.setCancelled(true);
        }
        fixItemEntity(event.getItem());
    }

    // ------------------------------------------------------------------
    // Лут и торговля
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
        MerchantRecipe cleaned = cleaner().cleanRecipe(event.getRecipe());
        if (cleaned == null) {
            event.setCancelled(true);
        } else if (cleaned != event.getRecipe()) {
            event.setRecipe(cleaned);
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
