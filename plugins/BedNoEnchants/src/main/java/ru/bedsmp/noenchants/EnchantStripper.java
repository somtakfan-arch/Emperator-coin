package ru.bedsmp.noenchants;

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
 * Ядро плагина: снимает зачарования с любого предмета, инвентаря, сущности и чанка.
 * Рекурсивно проходит по вложенным контейнерам: шалкер в сундуке, шалкер в шалкере,
 * бандл в шалкере в вагонетке — всё до самого дна.
 */
public final class EnchantStripper {

    /** Защита от бесконечной вложенности контейнеров. */
    private static final int MAX_DEPTH = 16;

    private final BedNoEnchants plugin;

    public EnchantStripper(BedNoEnchants plugin) {
        this.plugin = plugin;
    }

    private Settings settings() {
        return plugin.settings();
    }

    // ------------------------------------------------------------------
    // Предметы
    // ------------------------------------------------------------------

    /**
     * Снимает чары с предмета.
     *
     * @return предмет, который нужно записать обратно в слот, либо {@code null},
     *         если чистить было нечего.
     */
    public ItemStack strip(ItemStack item) {
        return strip(item, 0);
    }

    private ItemStack strip(ItemStack item, int depth) {
        if (item == null || depth > MAX_DEPTH) return null;
        Material type = item.getType();
        if (type == Material.AIR) return null;

        ItemStack result = item;
        boolean changed = false;

        // 1. Обычные чары на предмете.
        if (!result.getEnchantments().isEmpty()) {
            result.removeEnchantments();
            changed = true;
        }

        // 2. Всё, что живёт в мете.
        if (result.hasItemMeta()) {
            ItemMeta meta = result.getItemMeta();
            boolean metaChanged = false;

            // Зачарованная книга: чары лежат отдельно, в stored_enchantments.
            if (meta instanceof EnchantmentStorageMeta storage && storage.hasStoredEnchants()) {
                for (Enchantment enchantment : new ArrayList<>(storage.getStoredEnchants().keySet())) {
                    storage.removeStoredEnchant(enchantment);
                }
                metaChanged = true;
            }

            // Шалкер (и любой блок-контейнер) в виде предмета — чистим содержимое.
            if (meta instanceof BlockStateMeta blockStateMeta && blockStateMeta.hasBlockState()) {
                BlockState state = blockStateMeta.getBlockState();
                if (state instanceof Container container && stripInventory(container.getInventory(), depth + 1)) {
                    blockStateMeta.setBlockState(state);
                    metaChanged = true;
                }
            }

            // Бандл — тоже контейнер.
            if (meta instanceof BundleMeta bundle && bundle.hasItems()) {
                List<ItemStack> contents = new ArrayList<>(bundle.getItems());
                if (stripList(contents, depth + 1)) {
                    bundle.setItems(contents);
                    metaChanged = true;
                }
            }

            // Заряженный арбалет хранит снаряды внутри себя.
            if (meta instanceof CrossbowMeta crossbow && crossbow.hasChargedProjectiles()) {
                List<ItemStack> projectiles = new ArrayList<>(crossbow.getChargedProjectiles());
                if (stripList(projectiles, depth + 1)) {
                    crossbow.setChargedProjectiles(projectiles);
                    metaChanged = true;
                }
            }

            // Принудительный "блеск" без чар.
            if (settings().clearGlintOverride() && meta.hasEnchantmentGlintOverride()) {
                meta.setEnchantmentGlintOverride(null);
                metaChanged = true;
            }

            if (metaChanged) {
                result.setItemMeta(meta);
                changed = true;
            }
        }

        // 3. Кастомные характеристики (урон, скорость атаки, броня, прочность,
        //    неломаемость, кастомная еда и т.п.) — обратно к ванильным значениям.
        if (settings().vanillaGearEnabled() && settings().vanillaComponents().restore(result)) {
            changed = true;
        }

        // 4. Пустая зачарованная книга -> обычная книга.
        if (settings().convertEnchantedBooks() && result.getType() == Material.ENCHANTED_BOOK) {
            result = result.withType(Material.BOOK);
            changed = true;
        }

        if (!changed) return null;

        plugin.stats().addItem();
        if (settings().logToConsole()) {
            plugin.getLogger().info("Очищен предмет: " + type);
        }
        return result;
    }

    // ------------------------------------------------------------------
    // Наборы предметов
    // ------------------------------------------------------------------

    /** Чистит список предметов на месте (дроп, лут и т.п.). */
    public boolean stripList(List<ItemStack> items) {
        return stripList(items, 0);
    }

    private boolean stripList(List<ItemStack> items, int depth) {
        if (items == null || items.isEmpty()) return false;
        boolean changed = false;
        for (int index = 0; index < items.size(); index++) {
            ItemStack fixed = strip(items.get(index), depth);
            if (fixed != null) {
                items.set(index, fixed);
                changed = true;
            }
        }
        return changed;
    }

    /** Чистит массив предметов на месте. */
    public boolean stripArray(ItemStack[] contents) {
        if (contents == null) return false;
        boolean changed = false;
        for (int slot = 0; slot < contents.length; slot++) {
            ItemStack fixed = strip(contents[slot], 0);
            if (fixed != null) {
                contents[slot] = fixed;
                changed = true;
            }
        }
        return changed;
    }

    // ------------------------------------------------------------------
    // Инвентари
    // ------------------------------------------------------------------

    public boolean stripInventory(Inventory inventory) {
        return stripInventory(inventory, 0);
    }

    private boolean stripInventory(Inventory inventory, int depth) {
        if (inventory == null || depth > MAX_DEPTH) return false;

        ItemStack[] contents = inventory.getContents();
        boolean changed = false;
        for (int slot = 0; slot < contents.length; slot++) {
            ItemStack item = contents[slot];
            if (item == null || item.getType() == Material.AIR) continue;
            ItemStack fixed = strip(item, depth);
            if (fixed != null) {
                contents[slot] = fixed;
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
    public boolean stripPlayer(Player player) {
        if (player == null) return false;
        if (!settings().worldEnabled(player.getWorld())) return false;
        if (isExempt(player)) return false;

        boolean changed = stripInventory(player.getInventory(), 0);
        changed |= stripInventory(player.getEnderChest(), 0);

        ItemStack cursor = strip(player.getItemOnCursor(), 0);
        if (cursor != null) {
            player.setItemOnCursor(cursor);
            changed = true;
        }

        try {
            changed |= stripInventory(player.getOpenInventory().getTopInventory(), 0);
        } catch (RuntimeException ignored) {
            // некоторые виртуальные интерфейсы не дают трогать содержимое
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

    /** Дроп, рамки, экипировка мобов, вагонетки/лодки с сундуком, инвентари жителей, сделки. */
    public boolean stripEntity(Entity entity) {
        if (entity == null) return false;
        if (!settings().worldEnabled(entity.getWorld())) return false;

        if (entity instanceof Player player) {
            return stripPlayer(player);
        }

        boolean changed = false;

        if (entity instanceof Item itemEntity) {
            ItemStack fixed = strip(itemEntity.getItemStack(), 0);
            if (fixed != null) {
                itemEntity.setItemStack(fixed);
                changed = true;
            }
        }

        if (entity instanceof ItemFrame frame) {
            ItemStack fixed = strip(frame.getItem(), 0);
            if (fixed != null) {
                frame.setItem(fixed, false);
                changed = true;
            }
        }

        if (entity instanceof LivingEntity living) {
            EntityEquipment equipment = living.getEquipment();
            if (equipment != null) {
                for (EquipmentSlot slot : EquipmentSlot.values()) {
                    try {
                        ItemStack fixed = strip(equipment.getItem(slot), 0);
                        if (fixed != null) {
                            equipment.setItem(slot, fixed);
                            changed = true;
                        }
                    } catch (RuntimeException ignored) {
                        // слот не поддерживается этой сущностью
                    }
                }
            }
        }

        if (entity instanceof InventoryHolder holder) {
            changed |= stripInventory(holder.getInventory(), 0);
        }

        if (settings().stripVillagerTrades() && entity instanceof AbstractVillager villager) {
            changed |= stripTrades(villager);
        }

        return changed;
    }

    /** Чистит сделки торговца (например, зачарованные книги у библиотекаря). */
    public boolean stripTrades(AbstractVillager villager) {
        List<MerchantRecipe> recipes = villager.getRecipes();
        if (recipes.isEmpty()) return false;

        List<MerchantRecipe> updated = new ArrayList<>(recipes.size());
        boolean changed = false;
        for (MerchantRecipe recipe : recipes) {
            MerchantRecipe cleaned = stripRecipe(recipe);
            if (cleaned != recipe) changed = true;
            updated.add(cleaned);
        }
        if (changed) villager.setRecipes(updated);
        return changed;
    }

    /** Возвращает исходный рецепт, если чистить нечего, иначе — копию без чар. */
    public MerchantRecipe stripRecipe(MerchantRecipe recipe) {
        if (recipe == null) return null;

        ItemStack result = recipe.getResult().clone();
        List<ItemStack> ingredients = new ArrayList<>();
        for (ItemStack ingredient : recipe.getIngredients()) {
            ingredients.add(ingredient == null ? null : ingredient.clone());
        }

        ItemStack fixedResult = strip(result, 0);
        boolean changed = fixedResult != null;
        if (changed) result = fixedResult;
        if (stripList(ingredients, 0)) changed = true;
        if (!changed) return recipe;

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

    /** Все тайл-энтити (сундуки, бочки, шалкеры, печи, книжные полки...) и все сущности чанка. */
    public boolean stripChunk(Chunk chunk) {
        if (chunk == null || !chunk.isLoaded()) return false;
        if (!settings().worldEnabled(chunk.getWorld())) return false;

        boolean changed = false;

        for (BlockState state : chunk.getTileEntities(false)) {
            if (!(state instanceof Container container)) continue;
            try {
                changed |= stripInventory(container.getInventory(), 0);
            } catch (RuntimeException ignored) {
                // блок мог исчезнуть между итерациями
            }
        }

        for (Entity entity : chunk.getEntities()) {
            try {
                changed |= stripEntity(entity);
            } catch (RuntimeException ignored) {
                // сущность могла умереть или выгрузиться
            }
        }

        plugin.stats().addChunk();
        return changed;
    }
}
