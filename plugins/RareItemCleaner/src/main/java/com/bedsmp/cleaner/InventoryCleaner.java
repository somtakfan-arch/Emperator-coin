package com.bedsmp.cleaner;

import de.tr7zw.changeme.nbtapi.NBTFile;
import de.tr7zw.changeme.nbtapi.NBTCompoundList;
import de.tr7zw.changeme.nbtapi.NBTListCompound;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;

import java.io.File;
import java.io.IOException;
import java.util.List;
import java.util.Set;

public class InventoryCleaner {

    // id как они хранятся в NBT (namespaced) и как в Material enum
    private static final Set<String> TARGET_IDS = Set.of(
            "minecraft:dragon_egg",
            "minecraft:netherite_block"
    );
    private static final Set<Material> TARGET_MATERIALS = Set.of(
            Material.DRAGON_EGG,
            Material.NETHERITE_BLOCK
    );

    private final RareItemCleaner plugin;

    public InventoryCleaner(RareItemCleaner plugin) {
        this.plugin = plugin;
    }

    public void cleanAll(CommandSender sender) {
        int online = cleanOnlinePlayers();
        sender.sendMessage("§7Онлайн-игроки обработаны, удалено предметов: §f" + online);

        // офлайн-сканирование файлов — тяжёлая I/O операция, уводим в отдельный поток
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            int offline = cleanOfflinePlayerData(sender);
            Bukkit.getScheduler().runTask(plugin, () ->
                    sender.sendMessage("§aГотово. Офлайн-файлов изменено: §f" + offline));
        });
    }

    private int cleanOnlinePlayers() {
        int removed = 0;
        for (Player player : Bukkit.getOnlinePlayers()) {
            removed += stripInventory(player.getInventory());
            removed += stripInventory(player.getEnderChest());
            player.updateInventory();
        }
        return removed;
    }

    private int stripInventory(Inventory inv) {
        int removed = 0;
        ItemStack[] contents = inv.getContents();
        for (int i = 0; i < contents.length; i++) {
            ItemStack item = contents[i];
            if (item != null && TARGET_MATERIALS.contains(item.getType())) {
                removed += item.getAmount();
                inv.setItem(i, null);
            }
        }
        return removed;
    }

    /**
     * Проходит по всем файлам world/playerdata/*.dat (в т.ч. игроков которые сейчас офлайн)
     * и вычищает предметы из корневого Inventory-тега и EnderItems-тега напрямую в NBT.
     * ВНИМАНИЕ: игроков, которые онлайн прямо сейчас, лучше пропускать —
     * их .dat файл не отражает актуальное состояние до выхода/сохранения.
     */
    private int cleanOfflinePlayerData(CommandSender sender) {
        int filesChanged = 0;
        Set<String> onlineUUIDs = Bukkit.getOnlinePlayers().stream()
                .map(p -> p.getUniqueId().toString())
                .collect(java.util.stream.Collectors.toSet());

        for (org.bukkit.World world : Bukkit.getWorlds()) {
            File playerDataDir = new File(world.getWorldFolder(), "playerdata");
            File[] files = playerDataDir.listFiles((dir, name) -> name.endsWith(".dat"));
            if (files == null) continue;

            for (File file : files) {
                String uuid = file.getName().replace(".dat", "");
                if (onlineUUIDs.contains(uuid)) continue; // онлайн уже почищен через Bukkit API

                try {
                    if (cleanSingleDatFile(file)) {
                        filesChanged++;
                    }
                } catch (Exception e) {
                    plugin.getLogger().warning("Не удалось обработать " + file.getName() + ": " + e.getMessage());
                }
            }
        }
        return filesChanged;
    }

    private boolean cleanSingleDatFile(File file) throws IOException {
        NBTFile nbt = new NBTFile(file);
        boolean changed = false;

        changed |= stripNbtList(nbt.getCompoundList("Inventory"));
        changed |= stripNbtList(nbt.getCompoundList("EnderItems"));

        if (changed) {
            nbt.save();
        }
        return changed;
    }

    private boolean stripNbtList(NBTCompoundList list) {
        if (list == null) return false;
        boolean changed = false;
        // идём с конца, чтобы безопасно удалять по индексу
        for (int i = list.size() - 1; i >= 0; i--) {
            NBTListCompound entry = list.get(i);
            String id = entry.getString("id");
            if (id != null && TARGET_IDS.contains(id)) {
                list.remove(i);
                changed = true;
            }
        }
        return changed;
    }
}
