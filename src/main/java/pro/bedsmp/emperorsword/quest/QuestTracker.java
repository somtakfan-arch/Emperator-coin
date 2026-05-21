package pro.bedsmp.emperorsword.quest;

import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import pro.bedsmp.emperorsword.sword.SwordData;
import pro.bedsmp.emperorsword.sword.SwordManager;

import java.util.UUID;

/**
 * Отслеживает прогресс квестов игроков.
 * Вызывается из листенеров при каждом игровом событии.
 *
 * Прогресс учитывается ТОЛЬКО если меч есть в основном инвентаре игрока.
 * Оффхенд намеренно не считается.
 */
public class QuestTracker {

    private final SwordManager swordManager;
    private final SwordData swordData;

    public QuestTracker(SwordManager swordManager) {
        this.swordManager = swordManager;
        this.swordData = swordManager.getSwordData();
    }

    /**
     * Основной метод: прибавляет прогресс квеста и проверяет апгрейд.
     *
     * @param player игрок
     * @param type   тип квеста
     * @param amount количество для прибавления
     */
    public void track(Player player, QuestType type, long amount) {
        ItemStack sword = swordManager.findSwordInInventory(player);
        if (sword == null) return;

        // Проверяем привязку: если меч чужой — прогресс не идёт
        if (isOtherPlayersSword(sword, player.getUniqueId())) return;

        // Прибавляем прогресс
        swordData.addProgress(sword, type, amount);

        // Проверяем, не пора ли апгрейдиться
        swordManager.checkAndUpgrade(player, sword);
    }

    /**
     * Удобный метод для прибавления 1 единицы прогресса.
     */
    public void track(Player player, QuestType type) {
        track(player, type, 1L);
    }

    /**
     * Проверяет, принадлежит ли меч другому игроку.
     * Если привязка отключена в конфиге — всегда false.
     */
    private boolean isOtherPlayersSword(ItemStack sword, UUID playerUuid) {
        UUID owner = swordData.getOwner(sword);
        if (owner == null) return false; // без владельца — свободный
        return !owner.equals(playerUuid);
    }
}
