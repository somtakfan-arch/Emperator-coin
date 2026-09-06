package ru.bedsmp.noenchants;

import com.destroystokyo.paper.event.inventory.PrepareResultEvent;
import io.papermc.paper.event.player.PlayerTradeEvent;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Item;
import org.bukkit.entity.ItemFrame;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
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
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.event.server.ServerCommandEvent;
import org.bukkit.event.world.ChunkLoadEvent;
import org.bukkit.event.world.LootGenerateEvent;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.MerchantRecipe;

import java.util.List;
import java.util.Locale;

/** Все точки, через которые чары могут попасть в мир. Здесь они и умирают. */
public final class StripListener implements Listener {

    /** Команды, после которых стоит перепроверить инвентари игроков. */
    private static final String[] ITEM_COMMANDS = {"give", "item", "enchant", "loot", "summon", "invsee", "kit"};

    private final BedNoEnchants plugin;

    public StripListener(BedNoEnchants plugin) {
        this.plugin = plugin;
    }

    private boolean off() {
        return !plugin.settings().enabled();
    }

    private EnchantStripper stripper() {
        return plugin.stripper();
    }

    private void later(Runnable runnable) {
        plugin.getServer().getScheduler().runTask(plugin, runnable);
    }

    /** Чистит стак у сущности-предмета и записывает результат обратно. */
    private void fixItemEntity(Item entity) {
        ItemStack fixed = stripper().strip(entity.getItemStack());
        if (fixed != null) entity.setItemStack(fixed);
    }

    // ------------------------------------------------------------------
    // Игроки
    // ------------------------------------------------------------------

    @EventHandler(priority = EventPriority.MONITOR)
    public void onJoin(PlayerJoinEvent event) {
        if (off()) return;
        Player player = event.getPlayer();
        stripper().stripPlayer(player);
        later(() -> stripper().stripPlayer(player)); // после выдач других плагинов
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onRespawn(PlayerRespawnEvent event) {
        if (off()) return;
        Player player = event.getPlayer();
        later(() -> stripper().stripPlayer(player));
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

    /** /give, /loot, /item и подобное вносят предметы мимо всех остальных событий. */
    private void scheduleCommandCleanup(String rawCommand) {
        String command = rawCommand == null ? "" : rawCommand.toLowerCase(Locale.ROOT);
        for (String keyword : ITEM_COMMANDS) {
            if (command.contains(keyword)) {
                later(() -> {
                    for (Player online : plugin.getServer().getOnlinePlayers()) {
                        stripper().stripPlayer(online);
                    }
                });
                return;
            }
        }
    }

    // ------------------------------------------------------------------
    // Инвентари
    // ------------------------------------------------------------------

    @EventHandler(priority = EventPriority.LOWEST)
    public void onInventoryOpen(InventoryOpenEvent event) {
        if (off()) return;
        stripper().stripInventory(event.getInventory());
        if (event.getPlayer() instanceof Player player) {
            stripper().stripInventory(player.getInventory());
        }
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onInventoryClose(InventoryCloseEvent event) {
        if (off()) return;
        stripper().stripInventory(event.getInventory());
        if (event.getPlayer() instanceof Player player) {
            later(() -> stripper().stripPlayer(player));
        }
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onInventoryClick(InventoryClickEvent event) {
        if (off() || event.isCancelled()) return;

        ItemStack current = stripper().strip(event.getCurrentItem());
        if (current != null) event.setCurrentItem(current);

        if (event.getWhoClicked() instanceof Player player) {
            ItemStack cursor = stripper().strip(player.getItemOnCursor());
            if (cursor != null) player.setItemOnCursor(cursor);
            later(() -> stripper().stripPlayer(player));
        }
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onInventoryDrag(InventoryDragEvent event) {
        if (off() || event.isCancelled()) return;
        if (event.getWhoClicked() instanceof Player player) {
            later(() -> stripper().stripPlayer(player));
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onHopperMove(InventoryMoveItemEvent event) {
        if (off() || !plugin.settings().hookHoppers()) return;
        ItemStack fixed = stripper().strip(event.getItem());
        if (fixed != null) event.setItem(fixed);
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onHopperPickup(InventoryPickupItemEvent event) {
        if (off()) return;
        fixItemEntity(event.getItem());
    }

    // ------------------------------------------------------------------
    // Предметы в мире
    // ------------------------------------------------------------------

    @EventHandler(priority = EventPriority.MONITOR)
    public void onEntitySpawn(EntitySpawnEvent event) {
        if (off()) return;
        Entity entity = event.getEntity();
        if (entity instanceof Item item) {
            fixItemEntity(item);
            return;
        }
        // всё остальное, что вообще способно держать предметы;
        // экипировка мобов и содержимое вагонеток выдаются на тик позже спавна
        if (entity instanceof LivingEntity || entity instanceof ItemFrame || entity instanceof InventoryHolder) {
            later(() -> {
                if (entity.isValid()) stripper().stripEntity(entity);
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
        stripper().stripList(event.getDrops());
        if (event.getEntity() instanceof Player player) {
            later(() -> stripper().stripPlayer(player));
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onPickup(EntityPickupItemEvent event) {
        if (off()) return;
        fixItemEntity(event.getItem());
    }

    // ------------------------------------------------------------------
    // Лут и торговля
    // ------------------------------------------------------------------

    @EventHandler(priority = EventPriority.HIGHEST)
    public void onLootGenerate(LootGenerateEvent event) {
        if (off()) return;
        List<ItemStack> loot = event.getLoot();
        if (stripper().stripList(loot)) {
            event.setLoot(loot);
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onVillagerTrade(VillagerAcquireTradeEvent event) {
        if (off() || !plugin.settings().stripVillagerTrades()) return;
        MerchantRecipe cleaned = stripper().stripRecipe(event.getRecipe());
        if (cleaned != null && cleaned != event.getRecipe()) {
            event.setRecipe(cleaned);
        }
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onPlayerTrade(PlayerTradeEvent event) {
        if (off() || !plugin.settings().stripVillagerTrades()) return;
        MerchantRecipe cleaned = stripper().stripRecipe(event.getTrade());
        if (cleaned != null && cleaned != event.getTrade()) {
            event.setTrade(cleaned);
        }
        Player player = event.getPlayer();
        later(() -> stripper().stripPlayer(player));
    }

    // ------------------------------------------------------------------
    // Столы: зачарование, наковальня, верстак, точило, кузница
    // ------------------------------------------------------------------

    @EventHandler(priority = EventPriority.LOWEST)
    public void onPrepareEnchant(PrepareItemEnchantEvent event) {
        if (off() || !plugin.settings().blockEnchantingTable()) return;
        event.setCancelled(true);
    }

    @EventHandler(priority = EventPriority.LOWEST)
    public void onEnchant(EnchantItemEvent event) {
        if (off()) return;
        plugin.stats().addBlockedEnchant();
        if (plugin.settings().blockEnchantingTable()) {
            event.setCancelled(true);
            event.getEnchanter().sendMessage(Text.component(plugin.settings().message("enchanting-blocked")));
        }
        event.getEnchantsToAdd().clear();
        ItemStack fixed = stripper().strip(event.getItem());
        if (fixed != null) event.setItem(fixed);
    }

    /** Наковальня, точило, кузнечный стол, ткацкий станок, картография. */
    @EventHandler(priority = EventPriority.HIGHEST)
    public void onPrepareResult(PrepareResultEvent event) {
        if (off() || !plugin.settings().cleanWorkstationResults()) return;
        ItemStack fixed = stripper().strip(event.getResult());
        if (fixed != null) event.setResult(fixed);
    }

    @EventHandler(priority = EventPriority.HIGHEST)
    public void onPrepareCraft(PrepareItemCraftEvent event) {
        if (off() || !plugin.settings().cleanWorkstationResults()) return;
        ItemStack fixed = stripper().strip(event.getInventory().getResult());
        if (fixed != null) event.getInventory().setResult(fixed);
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onCraft(CraftItemEvent event) {
        if (off() || event.isCancelled()) return;
        ItemStack fixed = stripper().strip(event.getCurrentItem());
        if (fixed != null) event.setCurrentItem(fixed);
        if (event.getWhoClicked() instanceof Player player) {
            later(() -> stripper().stripPlayer(player));
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
