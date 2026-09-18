package ru.bedsmp.notridents;

import org.bukkit.Chunk;
import org.bukkit.Material;
import org.bukkit.block.BlockState;
import org.bukkit.block.Container;
import org.bukkit.enchantments.Enchantment;
import org.bukkit.entity.AbstractVillager;
import org.bukkit.entity.Entity;
import org.bukkit.entity.Item;
import org.bukkit.entity.ItemFrame;
import org.bukkit.entity.LivingEntity;
import org.bukkit.entity.Player;
import org.bukkit.entity.Trident;
import org.bukkit.inventory.EntityEquipment;
import org.bukkit.inventory.EquipmentSlot;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.InventoryHolder;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.MerchantRecipe;
import org.bukkit.inventory.meta.BlockStateMeta;
import org.bukkit.inventory.meta.BundleMeta;
import org.bukkit.inventory.meta.CrossbowMeta;
import org.bukkit.inventory.meta.EnchantmentStorageMeta;
import org.bukkit.inventory.meta.ItemMeta;

import java.util.ArrayList;
import java.util.List;

/**
 * Ядро плагина: удаляет трезубцы и снимает запрещённые чары в любом предмете,
 * инвентаре, сущности и чанке. Рекурсивно проходит по вложенным контейнерам —
 * шалкер в сундуке, шалкер в шалкере, бандл, заряженный арбалет.
 */
public final class TridentCleaner {

    private static final int MAX_DEPTH = 16;

    /** Что произошло с предметом. */
    public enum Result {
        UNCHANGED,
        CHANGED,
        REMOVE
    }

    /** Итог проверки: что делать со слотом и какой предмет в него положить. */
    public record Outcome(Result result, ItemStack item) {

        private static final Outcome UNCHANGED = new Outcome(Result.UNCHANGED, null);
        private static final Outcome REMOVE = new Outcome(Result.REMOVE, null);

        public static Outcome unchanged() { return UNCHANGED; }
        public static Outcome remove() { return REMOVE; }
        public static Outcome changed(ItemStack item) { return new Outcome(Result.CHANGED, item); }

        public boolean isRemove() { return result == Result.REMOVE; }
        public boolean isChanged() { return result == Result.CHANGED; }
    }

    private final BedNoTridents plugin;

    public TridentCleaner(BedNoTridents plugin) {
        this.plugin = plugin;
    }

    private Settings settings() {
        return plugin.settings();
    }

    // ------------------------------------------------------------------
    // Проверки
    // ------------------------------------------------------------------

    public boolean isTrident(ItemStack item) {
        return item != null && isTrident(item.getType());
    }

    public boolean isTrident(Material material) {
        return material == Material.TRIDENT && settings().removeTridents();
    }

    /** Есть ли на предмете чары из чёрного списка (в том числе в книге). */
    public boolean hasBannedEnchantment(ItemStack item) {
        if (item == null || !settings().enchantmentsEnabled()) return false;
        EnchantmentFilter filter = settings().enchantmentFilter();
        for (Enchantment enchantment : item.getEnchantments().keySet()) {
            if (filter.matches(enchantment)) return true;
        }
        if (item.hasItemMeta() && item.getItemMeta() instanceof EnchantmentStorageMeta storage) {
            for (Enchantment enchantment : storage.getStoredEnchants().keySet()) {
                if (filter.matches(enchantment)) return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------------
    // Предметы
    // ------------------------------------------------------------------

    public Outcome clean(ItemStack item) {
        return clean(item, 0);
    }

    private Outcome clean(ItemStack item, int depth) {
        if (item == null || depth > MAX_DEPTH) return Outcome.unchanged();
        Material type = item.getType();
        if (type == Material.AIR) return Outcome.unchanged();

        // 1. Сам трезубец — удаляем целиком.
        if (isTrident(type)) {
            plugin.stats().addItem(item.getAmount());
            if (settings().logToConsole()) {
                plugin.getLogger().info("Удалён трезубец x" + item.getAmount());
            }
            return Outcome.remove();
        }

        ItemStack result = item;
        boolean changed = false;

        // 2. Запрещённые чары на самом предмете.
        if (settings().enchantmentsEnabled()) {
            EnchantmentFilter filter = settings().enchantmentFilter();
            for (Enchantment enchantment : new ArrayList<>(result.getEnchantments().keySet())) {
                if (!filter.matches(enchantment)) continue;
                result.removeEnchantment(enchantment);
                plugin.stats().addEnchantment();
                changed = true;
            }
        }

        // 3. Всё, что живёт в мете.
        if (result.hasItemMeta()) {
            ItemMeta meta = result.getItemMeta();
            boolean metaChanged = false;

            // Зачарованная книга.
            if (settings().enchantmentsEnabled() && meta instanceof EnchantmentStorageMeta storage
                    && storage.hasStoredEnchants()) {
                EnchantmentFilter filter = settings().enchantmentFilter();
                for (Enchantment enchantment : new ArrayList<>(storage.getStoredEnchants().keySet())) {
                    if (!filter.matches(enchantment)) continue;
                    storage.removeStoredEnchant(enchantment);
                    plugin.stats().addEnchantment();
                    metaChanged = true;
                }
            }

            // Шалкер (и любой блок-контейнер) в виде предмета.
            if (meta instanceof BlockStateMeta blockStateMeta && blockStateMeta.hasBlockState()) {
                BlockState state = blockStateMeta.getBlockState();
                if (state instanceof Container container && cleanInventory(container.getInventory(), depth + 1)) {
                    blockStateMeta.setBlockState(state);
                    metaChanged = true;
                }
            }

            // Бандл.
            if (meta instanceof BundleMeta bundle && bundle.hasItems()) {
                List<ItemStack> contents = new ArrayList<>(bundle.getItems());
                if (cleanList(contents, depth + 1)) {
                    bundle.setItems(contents);
                    metaChanged = true;
                }
            }

            // Заряженный арбалет.
            if (meta instanceof CrossbowMeta crossbow && crossbow.hasChargedProjectiles()) {
                List<ItemStack> projectiles = new ArrayList<>(crossbow.getChargedProjectiles());
                if (cleanList(projectiles, depth + 1)) {
                    crossbow.setChargedProjectiles(projectiles);
                    metaChanged = true;
                }
            }

            if (metaChanged) {
                result.setItemMeta(meta);
                changed = true;
            }
        }

        // 4. Книга, оставшаяся без чар, становится обычной книгой.
        if (changed && settings().convertEmptyBooks() && result.getType() == Material.ENCHANTED_BOOK) {
            boolean empty = !(result.getItemMeta() instanceof EnchantmentStorageMeta storage)
                    || !storage.hasStoredEnchants();
            if (empty) {
                result = result.withType(Material.BOOK);
            }
        }

        return changed ? Outcome.changed(result) : Outcome.unchanged();
    }

    // ------------------------------------------------------------------
    // Наборы предметов
    // ------------------------------------------------------------------

    public boolean cleanList(List<ItemStack> items) {
        return cleanList(items, 0);
    }

    private boolean cleanList(List<ItemStack> items, int depth) {
        if (items == null || items.isEmpty()) return false;
        boolean changed = false;
        for (int index = items.size() - 1; index >= 0; index--) {
            Outcome outcome = clean(items.get(index), depth);
            if (outcome.isRemove()) {
                items.remove(index);
                changed = true;
            } else if (outcome.isChanged()) {
                items.set(index, outcome.item());
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
            Outcome outcome = clean(item, depth);
            if (outcome.isRemove()) {
                contents[slot] = null;
                changed = true;
            } else if (outcome.isChanged()) {
                contents[slot] = outcome.item();
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

    public boolean cleanPlayer(Player player) {
        if (player == null) return false;
        if (!settings().worldEnabled(player.getWorld())) return false;
        if (isExempt(player)) return false;

        boolean changed = cleanInventory(player.getInventory(), 0);
        changed |= cleanInventory(player.getEnderChest(), 0);

        Outcome cursor = clean(player.getItemOnCursor(), 0);
        if (cursor.isRemove()) {
            player.setItemOnCursor(null);
            changed = true;
        } else if (cursor.isChanged()) {
            player.setItemOnCursor(cursor.item());
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

    public boolean cleanEntity(Entity entity) {
        if (entity == null) return false;
        if (!settings().worldEnabled(entity.getWorld())) return false;

        if (entity instanceof Player player) {
            return cleanPlayer(player);
        }

        // Брошенный трезубец в полёте или воткнутый в землю.
        if (entity instanceof Trident trident) {
            if (settings().removeTridents() && settings().removeEntities()) {
                trident.remove();
                plugin.stats().addEntity();
                return true;
            }
            return false;
        }

        boolean changed = false;

        if (entity instanceof Item itemEntity) {
            Outcome outcome = clean(itemEntity.getItemStack(), 0);
            if (outcome.isRemove()) {
                itemEntity.remove();
                plugin.stats().addEntity();
                return true;
            }
            if (outcome.isChanged()) {
                itemEntity.setItemStack(outcome.item());
                changed = true;
            }
        }

        if (entity instanceof ItemFrame frame) {
            Outcome outcome = clean(frame.getItem(), 0);
            if (outcome.isRemove()) {
                frame.setItem(null, false);
                changed = true;
            } else if (outcome.isChanged()) {
                frame.setItem(outcome.item(), false);
                changed = true;
            }
        }

        // Экипировка мобов — прежде всего утопленники с трезубцами.
        if (entity instanceof LivingEntity living) {
            EntityEquipment equipment = living.getEquipment();
            if (equipment != null) {
                for (EquipmentSlot slot : EquipmentSlot.values()) {
                    try {
                        Outcome outcome = clean(equipment.getItem(slot), 0);
                        if (outcome.isRemove()) {
                            equipment.setItem(slot, null);
                            changed = true;
                        } else if (outcome.isChanged()) {
                            equipment.setItem(slot, outcome.item());
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

    /** Убирает сделки с трезубцами и чистит запрещённые чары в остальных. */
    public boolean cleanTrades(AbstractVillager villager) {
        List<MerchantRecipe> recipes = villager.getRecipes();
        if (recipes.isEmpty()) return false;

        List<MerchantRecipe> updated = new ArrayList<>(recipes.size());
        boolean changed = false;
        for (MerchantRecipe recipe : recipes) {
            MerchantRecipe cleaned = cleanRecipe(recipe);
            if (cleaned == null) {
                changed = true; // сделка целиком выкинута
                continue;
            }
            if (cleaned != recipe) changed = true;
            updated.add(cleaned);
        }
        if (changed) villager.setRecipes(updated);
        return changed;
    }

    /**
     * @return исходный рецепт, если чистить нечего; копию без чар, если что-то снято;
     *         {@code null}, если сделку надо убрать целиком
     */
    public MerchantRecipe cleanRecipe(MerchantRecipe recipe) {
        if (recipe == null) return null;

        ItemStack result = recipe.getResult().clone();
        Outcome outcome = clean(result, 0);
        if (outcome.isRemove()) return null;
        if (outcome.isChanged()) result = outcome.item();

        List<ItemStack> ingredients = new ArrayList<>();
        for (ItemStack ingredient : recipe.getIngredients()) {
            ingredients.add(ingredient == null ? null : ingredient.clone());
        }
        boolean ingredientsChanged = cleanList(ingredients, 0);
        if (ingredients.isEmpty()) return null;

        if (!outcome.isChanged() && !ingredientsChanged) return recipe;

        MerchantRecipe copy = new MerchantRecipe(
                result,
                recipe.getUses(),
                recipe.getMaxUses(),
                recipe.hasExperienceReward(),
                recipe.getVillagerExperience(),
                recipe.getPriceMultiplier(),
                recipe.getDemand(),
                recipe.getSpecialPrice());
        copy.setIngredients(ingredients);
        return copy;
    }

    // ------------------------------------------------------------------
    // Чанки
    // ------------------------------------------------------------------

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
