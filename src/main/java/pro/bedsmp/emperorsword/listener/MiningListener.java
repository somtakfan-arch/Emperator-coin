package pro.bedsmp.emperorsword.listener;

import org.bukkit.Material;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.player.PlayerMoveEvent;
import pro.bedsmp.emperorsword.quest.QuestTracker;
import pro.bedsmp.emperorsword.quest.QuestType;

import java.util.EnumSet;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Листенер добычи алмазов и пройденного расстояния.
 */
public class MiningListener implements Listener {

    // Все варианты алмазной руды
    private static final Set<Material> DIAMOND_ORES = EnumSet.of(
            Material.DIAMOND_ORE,
            Material.DEEPSLATE_DIAMOND_ORE
    );

    private final QuestTracker tracker;
    /** Запоминаем последнее положение каждого игрока для подсчёта расстояния */
    private final Map<UUID, double[]> lastPositions = new HashMap<>();

    public MiningListener(QuestTracker tracker) {
        this.tracker = tracker;
    }

    /**
     * Добыча алмазной руды.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBlockBreak(BlockBreakEvent event) {
        if (!DIAMOND_ORES.contains(event.getBlock().getType())) return;
        tracker.track(event.getPlayer(), QuestType.DIAMONDS_MINED);
    }

    /**
     * Отслеживание пройденного расстояния.
     * Считаем горизонтальное расстояние (без вертикали) в метрах.
     * Обновляем каждые 5 блоков чтобы не спамить событиями.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onPlayerMove(PlayerMoveEvent event) {
        // Оптимизация: пропускаем если игрок просто повернул голову
        if (!event.hasChangedPosition()) return;

        Player player = event.getPlayer();
        UUID uuid = player.getUniqueId();

        double toX = event.getTo().getX();
        double toZ = event.getTo().getZ();

        double[] last = lastPositions.get(uuid);
        if (last == null) {
            lastPositions.put(uuid, new double[]{toX, toZ});
            return;
        }

        double dx = toX - last[0];
        double dz = toZ - last[1];
        double dist = Math.sqrt(dx * dx + dz * dz);

        // Накапливаем в целых метрах
        long meters = (long) dist;
        if (meters > 0) {
            last[0] = toX;
            last[1] = toZ;
            tracker.track(player, QuestType.DISTANCE_WALKED, meters);
        }
    }

    /** Очищает кэш позиции при выходе игрока */
    public void clearPlayer(UUID uuid) {
        lastPositions.remove(uuid);
    }
}
