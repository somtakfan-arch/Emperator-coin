package com.bedsmp.thornsward;

import org.bukkit.Material;
import org.bukkit.Tag;
import org.bukkit.block.Block;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.inventory.ItemStack;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public final class AmethystAxeListener implements Listener {

    private final ThornsWardPlugin plugin;
    private final AmethystAxeItem item;

    /**
     * UUID игроков, которые прямо сейчас выполняют цепочку обрубки.
     * Предотвращает рекурсивный вход через BlockBreakEvent при вызове
     * block.breakNaturally() для каждого последующего бревна.
     */
    private final Set<UUID> breaking = new HashSet<>();

    public AmethystAxeListener(ThornsWardPlugin plugin, AmethystAxeItem item) {
        this.plugin = plugin;
        this.item = item;
    }

    @EventHandler(priority = EventPriority.HIGHEST, ignoreCancelled = true)
    public void onBlockBreak(BlockBreakEvent event) {
        Player player = event.getPlayer();

        if (breaking.contains(player.getUniqueId())) {
            return;
        }

        Block block = event.getBlock();
        if (!Tag.LOGS.isTagged(block.getType())) {
            return;
        }

        ItemStack tool = player.getInventory().getItemInMainHand();
        if (!item.isAmethystAxe(tool)) {
            return;
        }

        int maxBlocks = plugin.getConfig().getInt("amethyst-axe.max-blocks", 150);
        List<Block> logs = findConnectedLogs(block, maxBlocks);
        // Первый блок разрушается самим событием — убираем из списка.
        logs.remove(block);

        if (logs.isEmpty()) {
            return;
        }

        breaking.add(player.getUniqueId());
        try {
            for (Block log : logs) {
                // Получаем актуальный инструмент перед каждым ударом
                ItemStack hand = player.getInventory().getItemInMainHand();
                if (hand == null || hand.getType() == Material.AIR) {
                    break; // топор сломался
                }

                log.breakNaturally(hand);

                // Снимаем прочность с учётом Небьющегося (Unbreaking)
                ItemStack after = player.damageItemStack(hand, 1);
                player.getInventory().setItemInMainHand(after);

                if (after == null || after.getType() == Material.AIR) {
                    break; // топор сломался на этом ударе
                }
            }
        } finally {
            breaking.remove(player.getUniqueId());
        }
    }

    /**
     * BFS по 26-соседям (полный куб 3×3×3 вокруг каждого блока).
     * 26-связность нужна для ломаных стволов акации, тёмного дуба,
     * диагональных ветвей джунглей — у них брёвна соединяются по ребру/углу.
     */
    private List<Block> findConnectedLogs(Block start, int limit) {
        List<Block> result = new ArrayList<>();
        Set<Long> visited = new HashSet<>();
        Deque<Block> queue = new ArrayDeque<>();

        visited.add(packPos(start));
        result.add(start);
        queue.add(start);

        while (!queue.isEmpty() && result.size() < limit) {
            Block current = queue.poll();

            for (int dx = -1; dx <= 1; dx++) {
                for (int dy = -1; dy <= 1; dy++) {
                    for (int dz = -1; dz <= 1; dz++) {
                        if (dx == 0 && dy == 0 && dz == 0) continue;

                        Block neighbor = current.getRelative(dx, dy, dz);
                        long key = packPos(neighbor);

                        if (!visited.contains(key) && Tag.LOGS.isTagged(neighbor.getType())) {
                            visited.add(key);
                            result.add(neighbor);
                            queue.add(neighbor);

                            if (result.size() >= limit) {
                                return result;
                            }
                        }
                    }
                }
            }
        }
        return result;
    }

    /**
     * Упаковка координат блока в long для быстрого сравнения в HashSet.
     * Диапазон X/Z: ±8 388 608 (26 бит), Y: ±2048 (12 бит) — достаточно.
     */
    private long packPos(Block b) {
        return ((long) b.getX() & 0x3FFFFFFL) << 38
                | ((long) b.getY() & 0xFFFL) << 26
                | ((long) b.getZ() & 0x3FFFFFFL);
    }
}
