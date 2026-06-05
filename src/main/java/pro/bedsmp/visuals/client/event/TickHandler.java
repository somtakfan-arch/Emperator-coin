package pro.bedsmp.visuals.client.event;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.LivingEntity;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.hud.TpsDisplayLayer;
import pro.bedsmp.visuals.client.hud.WTapIndicatorLayer;
import pro.bedsmp.visuals.client.particle.HitParticleRenderer;
import pro.bedsmp.visuals.client.state.CombatState;
import pro.bedsmp.visuals.client.state.KillFeedState;
import pro.bedsmp.visuals.client.state.TargetTracker;

import java.util.ArrayDeque;

/** Клиентский тик: таймеры, CPS, очистка устаревших данных. */
@Environment(EnvType.CLIENT)
public class TickHandler {

    // CPS: метки тиков, в которые были клики (храним последние ~секунды = 20 тиков)
    private static final ArrayDeque<Long> leftClickTimes = new ArrayDeque<>();
    private static final ArrayDeque<Long> rightClickTimes = new ArrayDeque<>();

    private static boolean prevLmb = false;
    private static boolean prevRmb = false;

    public static int cpsLeft = 0;
    public static int cpsRight = 0;

    public static void register() {
        ClientTickEvents.END_CLIENT_TICK.register(TickHandler::onTick);
    }

    private static void onTick(Minecraft mc) {
        if (mc.level == null || mc.player == null) return;

        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null) return;

        long tick = mc.level.getGameTime();

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

        // Вспомогательные тики новых слоёв
        WTapIndicatorLayer.tick(mc);
        TpsDisplayLayer.onTick(mc);

        // CPS через KeyMapping — edge detection нажатий кнопок мыши
        if (mc.isWindowActive()) {
            boolean lmb = mc.options.keyAttack.isDown();
            boolean rmb = mc.options.keyUse.isDown();
            if (lmb && !prevLmb) registerLeftClick();
            if (rmb && !prevRmb) registerRightClick();
            prevLmb = lmb;
            prevRmb = rmb;
        }

        // Удалить метки старше 20 тиков и обновить отображаемые значения
        while (!leftClickTimes.isEmpty() && tick - leftClickTimes.peekFirst() >= 20) leftClickTimes.pollFirst();
        while (!rightClickTimes.isEmpty() && tick - rightClickTimes.peekFirst() >= 20) rightClickTimes.pollFirst();
        cpsLeft = leftClickTimes.size();
        cpsRight = rightClickTimes.size();
    }

    public static void registerLeftClick() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return;
        leftClickTimes.addLast(mc.level.getGameTime());
    }

    public static void registerRightClick() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return;
        rightClickTimes.addLast(mc.level.getGameTime());
    }
}
