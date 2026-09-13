package ru.bedsmp.nofireworks;

import org.bukkit.Chunk;
import org.bukkit.Material;
import org.bukkit.block.BlockState;
import org.bukkit.block.Container;
import org.bukkit.entity.AbstractVillager;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Firework;
import org.bukkit.entity.Item;
import org.bukkit.entity.ItemFrame;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.inventory.EntityEquipment;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.MerchantRecipe;
import org.bukkit.inventory.meta.BlockStateMeta;
import org.bukkit.inventory.meta.BundleMeta;
import org.bukkit.inventory.meta.CrossbowMeta;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.ArrayList;
import java.util.List;

/**
 * Ядро плагина: находит и удаляет фейерверки в любом предмете, инвентаре,
 * сущности и чанке. Рекурсивно проходит по вложенным контейнерам — шалкер
 * в сундуке, шалкер в шалкере, бандл, заряженный арбалет.
 */
public final class FireworkCleaner {

    /** Защита от бесконечной вложенности контейнеров. */
    private static final int MAX_DEPTH = 16;

    /** Что делать с предметом после проверки. */
    public enum Result {
        /** Предмет не тронут. */
        UNCHANGED,
        /** Предмет изменился (что-то удалили внутри него). */
        CHANGED,
        /** Предмет целиком подлежит удалению. */
        REMOVE
    }

    private final BedNoFireworks plugin;

    public FireworkCleaner(BedNoFireworks plugin) {
        this.plugin = plugin;
    }

    private Settings settings() {
        return plugin.settings();
    }

    // ------------------------------------------------------------------
    // Проверка
    // ------------------------------------------------------------------

    /** Это фейерверк, который нужно удалить? */
    public boolean isFirework(ItemStack item) {
        if (item == null) return false;
        return isFirework(item.getType());
    }

    public boolean isFirework(Material material) {
        if (material == Material.FIREWORK_ROCKET) return settings().removeRockets();
        if (material == Material.FIREWORK_STAR) return settings().removeStars();
        return false;
    }

    // ------------------------------------------------------------------
    // Предметы
    // ------------------------------------------------------------------

    public Result clean(ItemStack item) {
        return clean(item, 0);
    }

    private Result clean(ItemStack item, int depth) {
        if (item == null || depth > MAX_DEPTH) return Result.UNCHANGED;
        Material type = item.getType();
        if (type == Material.AIR) return Result.UNCHANGED;

        if (isFirework(type)) {
            plugin.stats().addItem(item.getAmount());
            if (settings().logToConsole()) {
                plugin.getLogger().info("Удалён фейерверк: " + type + " x" + item.getAmount());
            }
            return Result.REMOVE;
        }

        if (!item.hasItemMeta()) return Result.UNCHANGED;

        ItemMeta meta = item.getItemMeta();
        boolean changed = false;

        // Шалкер (и любой блок-контейнер) в виде предмета.
        if (meta instanceof BlockStateMeta blockStateMeta && blockStateMeta.hasBlockState()) {
            BlockState state = blockStateMeta.getBlockState();
            if (state instanceof Container container && cleanInventory(container.getInventory(), depth + 1)) {
                blockStateMeta.setBlockState(state);
                changed = true;
            }
        }

        // Бандл.
        if (meta instanceof BundleMeta bundle && bundle.hasItems()) {
            List<ItemStack> contents = new ArrayList<>(bundle.getItems());
            if (cleanList(contents, depth + 1)) {
                bundle.setItems(contents);
                changed = true;
            }
        }

        // Заряженный арбалет: ракета внутри — это выстрел фейерверком.
        if (settings().unloadCrossbows() && meta instanceof CrossbowMeta crossbow && crossbow.hasChargedProjectiles()) {
            List<ItemStack> projectiles = new ArrayList<>(crossbow.getChargedProjectiles());
            if (cleanList(projectiles, depth + 1)) {
                crossbow.setChargedProjectiles(projectiles);
                changed = true;
            }
        }

        if (changed) {
            item.setItemMeta(meta);
            return Result.CHANGED;
        }
        return Result.UNCHANGED;
    }

    // ------------------------------------------------------------------
    // Наборы предметов
    // ------------------------------------------------------------------

    /** Удаляет фейерверки из списка (лут, дроп, содержимое бандла). */
    public boolean cleanList(List<ItemStack> items) {
        return cleanList(items, 0);
    }

    private boolean cleanList(List<ItemStack> items, int depth) {
        if (items == null || items.isEmpty()) return false;
        boolean changed = false;
        for (int index = items.size() - 1; index >= 0; index--) {
            Result result = clean(items.get(index), depth);
            if (result == Result.REMOVE) {
                items.remove(index);
                changed = true;
            } else if (result == Result.CHANGED) {
                changed = true;
            }
        }
        return changed;
    }

    // ------------------------------------------------------------------
    // Инвентари
    // ------------------------------------------------------------------

    public boolean cleanInventory(Inventory inventory) {
        return cleanInventory(inventory, 0);
    }

    private boolean cleanInventory(Inventory inventory, int depth) {
        if (inventory == null || depth > MAX_DEPTH) return false;

        ItemStack[] contents = inventory.getContents();
        boolean changed = false;
        for (int slot = 0; slot < contents.length; slot++) {
            ItemStack item = contents[slot];
            if (item == null || item.getType() == Material.AIR) continue;
            Result result = clean(item, depth);
            if (result == Result.REMOVE) {
                contents[slot] = null;
                changed = true;
            } else if (result == Result.CHANGED) {
                contents[slot] = item;
                changed = true;
            }
        }
        if (changed) {
            inventory.setContents(contents);
            plugin.stats().addContainer();
        }
        return changed;
    }

    // ------------------------------------------------------------------
    // Игроки
    // ------------------------------------------------------------------

    public boolean isExempt(Player player) {
        Settings settings = settings();
        return settings.bypassEnabled() && player.hasPermission(settings.bypassPermission());
    }

    /** Инвентарь + броня + вторая рука + эндер-сундук + курсор + открытый интерфейс. */
    public boolean cleanPlayer(Player player) {
        if (player == null) return false;
        if (!settings().worldEnabled(player.getWorld())) return false;
        if (isExempt(player)) return false;

        boolean changed = cleanInventory(player.getInventory(), 0);
        changed |= cleanInventory(player.getEnderChest(), 0);

        ItemStack cursor = player.getItemOnCursor();
        Result cursorResult = clean(cursor, 0);
        if (cursorResult == Result.REMOVE) {
            player.setItemOnCursor(null);
            changed = true;
        } else if (cursorResult == Result.CHANGED) {
            player.setItemOnCursor(cursor);
            changed = true;
        }

        try {
            changed |= cleanInventory(player.getOpenInventory().getTopInventory(), 0);
        } catch (RuntimeException ignored) {
            // виртуальные интерфейсы некоторых плагинов трогать нельзя
        }

        if (changed) {
            plugin.stats().addPlayer();
            player.updateInventory();
        }
        return changed;
    }

    // ------------------------------------------------------------------
    // Сущности
    // ------------------------------------------------------------------

    /** Дроп, рамки, экипировка мобов, вагонетки/лодки с сундуком, торговцы, летящие фейерверки. */
    public boolean cleanEntity(Entity entity) {
        if (entity == null) return false;
        if (!settings().worldEnabled(entity.getWorld())) return false;

        if (entity instanceof Player player) {
            return cleanPlayer(player);
        }

        // Уже запущенный фейерверк в воздухе.
        if (entity instanceof Firework firework) {
            if (settings().removeEntities()) {
                firework.remove();
                plugin.stats().addEntity();
                return true;
            }
            return false;
        }

        boolean changed = false;

        if (entity instanceof Item itemEntity) {
            ItemStack stack = itemEntity.getItemStack();
            Result result = clean(stack, 0);
            if (result == Result.REMOVE) {
                itemEntity.remove();
                plugin.stats().addEntity();
                return true;
            }
            if (result == Result.CHANGED) {
                itemEntity.setItemStack(stack);
                changed = true;
            }
        }

        if (entity instanceof ItemFrame frame) {
            ItemStack stack = frame.getItem();
            Result result = clean(stack, 0);
            if (result == Result.REMOVE) {
                frame.setItem(null, false);
                changed = true;
            } else if (result == Result.CHANGED) {
                frame.setItem(stack, false);
                changed = true;
            }
        }

        if (entity instanceof LivingEntity living) {
            EntityEquipment equipment = living.getEquipment();
            if (equipment != null) {
                for (EquipmentSlot slot : EquipmentSlot.values()) {
                    try {
                        ItemStack stack = equipment.getItem(slot);
                        Result result = clean(stack, 0);
                        if (result == Result.REMOVE) {
                            equipment.setItem(slot, null);
                            changed = true;
                        } else if (result == Result.CHANGED) {
                            equipment.setItem(slot, stack);
                            changed = true;
                        }
                    } catch (RuntimeException ignored) {
                        // слот не поддерживается этой сущностью
                    }
                }
            }
        }

        if (entity instanceof InventoryHolder holder) {
            changed |= cleanInventory(holder.getInventory(), 0);
        }

        if (entity instanceof AbstractVillager villager) {
            changed |= cleanTrades(villager);
        }

        return changed;
    }

    /** Убирает у торговца сделки, которые выдают или требуют фейерверки. */
    public boolean cleanTrades(AbstractVillager villager) {
        List<MerchantRecipe> recipes = villager.getRecipes();
        if (recipes.isEmpty()) return false;

        List<MerchantRecipe> kept = new ArrayList<>(recipes.size());
        for (MerchantRecipe recipe : recipes) {
            if (isFireworkTrade(recipe)) continue;
            kept.add(recipe);
        }
        if (kept.size() == recipes.size()) return false;
        villager.setRecipes(kept);
        return true;
    }

    /** Сделка выдаёт или требует фейерверк? */
    public boolean isFireworkTrade(MerchantRecipe recipe) {
        if (recipe == null) return false;
        if (isFirework(recipe.getResult())) return true;
        for (ItemStack ingredient : recipe.getIngredients()) {
            if (isFirework(ingredient)) return true;
        }
        return false;
    }

    // ------------------------------------------------------------------
    // Чанки
    // ------------------------------------------------------------------

    /** Все тайл-энтити чанка (сундуки, бочки, раздатчики...) и все сущности. */
    public boolean cleanChunk(Chunk chunk) {
        if (chunk == null || !chunk.isLoaded()) return false;
        if (!settings().worldEnabled(chunk.getWorld())) return false;

        boolean changed = false;

        for (BlockState state : chunk.getTileEntities(false)) {
            if (!(state instanceof Container container)) continue;
            try {
                changed |= cleanInventory(container.getInventory(), 0);
            } catch (RuntimeException ignored) {
                // блок мог исчезнуть между итерациями
            }
        }

        for (Entity entity : chunk.getEntities()) {
            try {
                changed |= cleanEntity(entity);
            } catch (RuntimeException ignored) {
                // сущность могла умереть или выгрузиться
            }
        }

        plugin.stats().addChunk();
        return changed;
    }
}
