package pro.bedsmp.visuals.client.event;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.LivingEntity;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.particle.HitParticleRenderer;
import pro.bedsmp.visuals.client.state.CombatState;
import pro.bedsmp.visuals.client.state.KillFeedState;
import pro.bedsmp.visuals.client.state.TargetTracker;

/** Клиентский тик: таймеры, очистка устаревших данных. */
@Environment(EnvType.CLIENT)
public class TickHandler {

    // CPS-счётчики: тики кликов за последнюю секунду
    public static final int[] leftClickTicks = new int[20];
    public static final int[] rightClickTicks = new int[20];
    private static int tickIndex = 0;

    public static int cpsLeft = 0;
    public static int cpsRight = 0;

    public static void register() {
        ClientTickEvents.END_CLIENT_TICK.register(TickHandler::onTick);
    }

    private static void onTick(Minecraft client) {
        if (client.level == null || client.player == null) return;

        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null) return;

        long tick = client.level.getGameTime();

        // Обновление таймера боя
        CombatState combat = CombatState.get();
        combat.tickUpdate(tick, cfg.combatTimer.combatTimeoutTicks);
        if (combat.isInCombat()) {
            cfg.sessionStats.combatTimeTicks++;
        }

        // Обновление максимального комбо
        int combo = combat.getCombo();
        if (combo > cfg.sessionStats.maxCombo) {
            cfg.sessionStats.maxCombo = combo;
        }

        // Обновление HP цели
        LivingEntity target = TargetTracker.get().getTarget();
        if (target != null) {
            TargetTracker.get().updateHealth(target, tick);
        }

        // Очистка устаревших kill feed записей
        if (cfg.killFeed.enabled) {
            KillFeedState.get().purge(tick, cfg.killFeed.entryLifeTicks);
        }

        // Тик партиклов
        HitParticleRenderer.get().tick();

        // CPS: сдвиг скользящего окна
        int slotIndex = (int)(tick % 20);
        leftClickTicks[slotIndex] = 0;
        rightClickTicks[slotIndex] = 0;
        cpsLeft = sumArray(leftClickTicks);
        cpsRight = sumArray(rightClickTicks);
    }

    public static void registerLeftClick() {
        if (Minecraft.getInstance().level == null) return;
        long tick = Minecraft.getInstance().level.getGameTime();
        leftClickTicks[(int)(tick % 20)]++;
    }

    public static void registerRightClick() {
        if (Minecraft.getInstance().level == null) return;
        long tick = Minecraft.getInstance().level.getGameTime();
        rightClickTicks[(int)(tick % 20)]++;
    }

    private static int sumArray(int[] arr) {
        int s = 0;
        for (int v : arr) s += v;
        return s;
    }
}
