package pro.bedsmp.visuals.client.state;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.world.entity.LivingEntity;

import java.util.UUID;

/** Текущее состояние боя: цель, комбо, таймер. */
@Environment(EnvType.CLIENT)
public class CombatState {

    private static CombatState INSTANCE;

    public static CombatState get() {
        if (INSTANCE == null) INSTANCE = new CombatState();
        return INSTANCE;
    }

    // Тик, когда последний раз ударили (или получили удар)
    private long lastCombatTick = -1;
    // Были ли мы в бою на прошлом тике
    private boolean inCombat = false;
    // Текущий комбо-счётчик
    private int combo = 0;
    private int maxComboThisFight = 0;
    // Тик последнего удара по цели
    private long lastHitTick = -1;
    // UUID текущей цели
    private UUID currentTargetId = null;
    // Тик последнего удара по текущей цели (для тайм-аута комбо)
    private long lastComboHitTick = -1;

    public boolean isInCombat() { return inCombat; }

    public void markCombat(long currentTick) {
        lastCombatTick = currentTick;
        inCombat = true;
    }

    public void tickUpdate(long currentTick, int timeoutTicks) {
        if (inCombat && (currentTick - lastCombatTick) > timeoutTicks) {
            inCombat = false;
        }
    }

    public long getCombatStartTick() { return lastCombatTick; }
    public long getLastCombatTick() { return lastCombatTick; }

    public int getCombo() { return combo; }
    public int getMaxComboThisFight() { return maxComboThisFight; }

    public void incrementCombo(UUID targetId, long tick, int timeoutTicks) {
        if (currentTargetId == null || !currentTargetId.equals(targetId)) {
            combo = 1;
            currentTargetId = targetId;
        } else if (tick - lastComboHitTick > timeoutTicks) {
            combo = 1;
        } else {
            combo++;
        }
        lastComboHitTick = tick;
        if (combo > maxComboThisFight) maxComboThisFight = combo;
    }

    public void breakCombo() {
        combo = 0;
        currentTargetId = null;
    }

    public UUID getCurrentTargetId() { return currentTargetId; }

    public void reset() {
        inCombat = false;
        lastCombatTick = -1;
        combo = 0;
        maxComboThisFight = 0;
        currentTargetId = null;
        lastComboHitTick = -1;
        lastHitTick = -1;
    }
}
