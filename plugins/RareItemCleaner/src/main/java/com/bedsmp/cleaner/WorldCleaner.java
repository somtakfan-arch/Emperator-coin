package com.bedsmp.cleaner;

import org.bukkit.Bukkit;
import org.bukkit.Chunk;
import org.bukkit.Material;
import org.bukkit.World;
import org.bukkit.block.Block;
import org.bukkit.command.CommandSender;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Проходит только по УЖЕ СГЕНЕРИРОВАННЫМ регионам (читает имена .mca файлов),
 * подгружает чанки маленькими партиями через тик-планировщик, чтобы не заморозить сервер,
 * заменяет целевые блоки на воздух и выгружает чанк обратно.
 */
public class WorldCleaner {

    private static final Pattern REGION_PATTERN = Pattern.compile("r\\.(-?\\d+)\\.(-?\\d+)\\.mca");
    private static final int CHUNKS_PER_TICK = 4; // маленькими пачками, чтобы не лагать сервер

    private final RareItemCleaner plugin;

    public WorldCleaner(RareItemCleaner plugin) {
        this.plugin = plugin;
    }

    public void cleanAllWorlds(CommandSender sender) {
        for (World world : Bukkit.getWorlds()) {
            List<int[]> chunkCoords = collectGeneratedChunkRegions(world);
            sender.sendMessage("§7[" + world.getName() + "] Найдено регионов: §f" + chunkCoords.size()
                    + " §7(будет обработано ~" + (chunkCoords.size() * 1024) + " чанков макс.)");
            processWorld(world, chunkCoords, sender);
        }
    }

    /** Возвращает список координат регионов (rx, rz) на основе файлов на диске — без загрузки чего-либо. */
    private List<int[]> collectGeneratedChunkRegions(World world) {
        List<int[]> regions = new ArrayList<>();
        File regionDir = new File(world.getWorldFolder(), "region");
        File[] files = regionDir.listFiles();
        if (files == null) return regions;

        for (File f : files) {
            Matcher m = REGION_PATTERN.matcher(f.getName());
            if (m.matches()) {
                int rx = Integer.parseInt(m.group(1));
                int rz = Integer.parseInt(m.group(2));
                regions.add(new int[]{rx, rz});
            }
        }
        return regions;
    }

    private void processWorld(World world, List<int[]> regions, CommandSender sender) {
        // строим полный список чанков (32x32 на регион) для перебора
        List<int[]> chunkQueue = new ArrayList<>();
        for (int[] region : regions) {
            int baseX = region[0] * 32;
            int baseZ = region[1] * 32;
            for (int cx = baseX; cx < baseX + 32; cx++) {
                for (int cz = baseZ; cz < baseZ + 32; cz++) {
                    chunkQueue.add(new int[]{cx, cz});
                }
            }
        }

        int[] progress = {0};
        int[] removedCount = {0};
        long total = chunkQueue.size();

        Bukkit.getScheduler().runTaskTimer(plugin, task -> {
            int processedThisTick = 0;
            while (processedThisTick < CHUNKS_PER_TICK && progress[0] < chunkQueue.size()) {
                int[] coords = chunkQueue.get(progress[0]);
                progress[0]++;
                processedThisTick++;

                // пропускаем чанк, если по факту не сгенерирован (экономим I/O)
                if (!world.isChunkGenerated(coords[0], coords[1])) continue;

                Chunk chunk = world.getChunkAt(coords[0], coords[1]);
                removedCount[0] += stripChunk(chunk, world);
                // выгружаем сразу, чтобы не раздувать память на больших мирах
                chunk.unload(true);
            }

            if (progress[0] >= chunkQueue.size()) {
                task.cancel();
                sender.sendMessage("§a[" + world.getName() + "] Готово. Обработано чанков: §f" + total
                        + " §a, удалено блоков: §f" + removedCount[0]);
            } else if (progress[0] % 5000 < CHUNKS_PER_TICK) {
                sender.sendMessage("§7[" + world.getName() + "] Прогресс: " + progress[0] + "/" + total);
            }
        }, 0L, 1L);
    }

    private int stripChunk(Chunk chunk, World world) {
        int removed = 0;
        int minY = world.getMinHeight();
        int maxY = world.getMaxHeight();

        for (int x = 0; x < 16; x++) {
            for (int z = 0; z < 16; z++) {
                for (int y = minY; y < maxY; y++) {
                    Block block = chunk.getBlock(x, y, z);
                    Material type = block.getType();
                    if (type == Material.DRAGON_EGG || type == Material.NETHERITE_BLOCK) {
                        block.setType(Material.AIR, false);
                        removed++;
                    }
                }
            }
        }
        return removed;
    }
}
