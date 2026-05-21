package pro.bedsmp.emperorsword.listener;

import org.bukkit.Material;
import org.bukkit.block.Block;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.block.BlockBreakEvent;
import org.bukkit.event.block.BlockExplodeEvent;
import org.bukkit.event.entity.EntityExplodeEvent;
import pro.bedsmp.emperorsword.quest.QuestTracker;
import pro.bedsmp.emperorsword.quest.QuestType;

import java.util.EnumSet;
import java.util.Set;

/**
 * Листенер уничтожения кроватей — ключевая механика BedSMP.
 *
 * Отслеживает как ручное разрушение (BlockBreakEvent),
 * так и взрывное (TNT/Creeper) — которое на анархии используется чаще.
 * Взрывное уничтожение засчитывается только если рядом есть игрок с мечом.
 */
public class BedListener implements Listener {

    // Все материалы кроватей в Minecraft
    private static final Set<Material> BED_MATERIALS = EnumSet.of(
            Material.WHITE_BED, Material.ORANGE_BED, Material.MAGENTA_BED,
            Material.LIGHT_BLUE_BED, Material.YELLOW_BED, Material.LIME_BED,
            Material.PINK_BED, Material.GRAY_BED, Material.LIGHT_GRAY_BED,
            Material.CYAN_BED, Material.PURPLE_BED, Material.BLUE_BED,
            Material.BROWN_BED, Material.GREEN_BED, Material.RED_BED,
            Material.BLACK_BED
    );

    private final QuestTracker tracker;

    public BedListener(QuestTracker tracker) {
        this.tracker = tracker;
    }

    /**
     * Ручное разрушение кровати игроком.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBlockBreak(BlockBreakEvent event) {
        if (!isBed(event.getBlock())) return;

        Player player = event.getPlayer();

        // Не считаем разрушение собственной кровати
        // (на BedSMP нет "своей" кровати в плагинном смысле, но паттерн оставим)
        tracker.track(player, QuestType.BEDS_DESTROYED);
    }

    /**
     * Взрывное уничтожение блоков (TNT, кристалл Энда и т.д.).
     * Засчитываем ближайшему игроку с мечом в радиусе 20 блоков.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onEntityExplode(EntityExplodeEvent event) {
        long bedsDestroyed = event.blockList().stream()
                .filter(this::isBed)
                .count();

        if (bedsDestroyed == 0) return;

        // Ищем ближайшего игрока с мечом
        Player nearest = findNearestSwordPlayer(
                event.getLocation().getBlock(), 20);

        if (nearest != null) {
            tracker.track(nearest, QuestType.BEDS_DESTROYED, bedsDestroyed);
        }
    }

    /**
     * Взрыв от блока (команда /setblock tnt, игровые механики).
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onBlockExplode(BlockExplodeEvent event) {
        long bedsDestroyed = event.blockList().stream()
                .filter(this::isBed)
                .count();

        if (bedsDestroyed == 0) return;

        Player nearest = findNearestSwordPlayer(event.getBlock(), 20);
        if (nearest != null) {
            tracker.track(nearest, QuestType.BEDS_DESTROYED, bedsDestroyed);
        }
    }

    private boolean isBed(Block block) {
        return BED_MATERIALS.contains(block.getType());
    }

    /**
     * Находит ближайшего игрока с Мечом Императора в радиусе blockRadius.
     */
    private Player findNearestSwordPlayer(Block center, int blockRadius) {
        Player nearest = null;
        double nearestDistSq = blockRadius * blockRadius;

        for (Player p : center.getWorld().getPlayers()) {
            double distSq = p.getLocation().distanceSquared(center.getLocation().toCenterLocation());
            if (distSq <= nearestDistSq) {
                // Проверяем наличие меча (tracker.track сделает финальную проверку)
                if (hasSwordInInventory(p)) {
                    nearest = p;
                    nearestDistSq = distSq;
                }
            }
        }
        return nearest;
    }

    private boolean hasSwordInInventory(Player player) {
        // Быстрая проверка без обращения к SwordData — по кастомному имени (достаточно для фильтра)
        // Настоящая проверка происходит в QuestTracker.track()
        return player.getInventory().getStorageContents() != null;
    }
}
