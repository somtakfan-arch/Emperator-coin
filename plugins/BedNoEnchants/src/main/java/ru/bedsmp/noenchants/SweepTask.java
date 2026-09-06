package ru.bedsmp.noenchants;

import org.bukkit.Chunk;
import org.bukkit.World;
import org.bukkit.entity.Player;
import org.bukkit.scheduler.BukkitTask;

import java.util.ArrayDeque;
import java.util.HashSet;
import java.util.Set;

/**
 * Фоновая зачистка: раскладывает загруженные чанки по очереди и обрабатывает
 * их порциями, чтобы не ронять TPS. Чанки также попадают сюда при загрузке.
 */
public final class SweepTask {

    private final BedNoEnchants plugin;
    private final ArrayDeque<Chunk> queue = new ArrayDeque<>();
    private final Set<Long> queuedKeys = new HashSet<>();

    private BukkitTask workerTask;
    private BukkitTask refillTask;

    public SweepTask(BedNoEnchants plugin) {
        this.plugin = plugin;
    }

    public void start() {
        stop();
        Settings settings = plugin.settings();
        if (!settings.enabled() || !settings.sweepEnabled()) return;

        workerTask = plugin.getServer().getScheduler().runTaskTimer(plugin, this::processBatch, 20L, 1L);
        refillTask = plugin.getServer().getScheduler().runTaskTimer(plugin, this::refill,
                settings.sweepIntervalTicks(), settings.sweepIntervalTicks());
    }

    public void stop() {
        if (workerTask != null) {
            workerTask.cancel();
            workerTask = null;
        }
        if (refillTask != null) {
            refillTask.cancel();
            refillTask = null;
        }
        queue.clear();
        queuedKeys.clear();
    }

    public void enqueue(Chunk chunk) {
        if (chunk == null) return;
        long key = key(chunk);
        if (queuedKeys.add(key)) {
            queue.addLast(chunk);
        }
    }

    private static long key(Chunk chunk) {
        long coords = (((long) chunk.getX()) << 32) ^ (chunk.getZ() & 0xffffffffL);
        return coords * 31L + chunk.getWorld().getUID().hashCode();
    }

    /** Ставит в очередь все загруженные чанки всех разрешённых миров. */
    public int refill() {
        int added = 0;
        for (World world : plugin.getServer().getWorlds()) {
            if (!plugin.settings().worldEnabled(world)) continue;
            for (Chunk chunk : world.getLoadedChunks()) {
                int before = queue.size();
                enqueue(chunk);
                if (queue.size() > before) added++;
            }
        }
        if (plugin.settings().sweepPlayers()) {
            for (Player player : plugin.getServer().getOnlinePlayers()) {
                plugin.stripper().stripPlayer(player);
            }
        }
        return added;
    }

    private void processBatch() {
        if (!plugin.settings().enabled()) return;
        int budget = plugin.settings().chunksPerTick();
        while (budget-- > 0) {
            Chunk chunk = queue.pollFirst();
            if (chunk == null) return;
            queuedKeys.remove(key(chunk));
            try {
                plugin.stripper().stripChunk(chunk);
            } catch (RuntimeException ex) {
                plugin.getLogger().warning("Ошибка при очистке чанка "
                        + chunk.getX() + ";" + chunk.getZ() + ": " + ex.getMessage());
            }
        }
    }

    /**
     * Немедленная полная зачистка: все загруженные чанки всех миров + все игроки.
     * Используется при запуске плагина и по команде /noenchants scan.
     *
     * @return количество обработанных чанков
     */
    public int scanNow() {
        int chunks = 0;
        for (World world : plugin.getServer().getWorlds()) {
            if (!plugin.settings().worldEnabled(world)) continue;
            for (Chunk chunk : world.getLoadedChunks()) {
                try {
                    plugin.stripper().stripChunk(chunk);
                    chunks++;
                } catch (RuntimeException ex) {
                    plugin.getLogger().warning("Ошибка при очистке чанка: " + ex.getMessage());
                }
            }
        }
        for (Player player : plugin.getServer().getOnlinePlayers()) {
            plugin.stripper().stripPlayer(player);
        }
        return chunks;
    }

    public int queueSize() {
        return queue.size();
    }
}
