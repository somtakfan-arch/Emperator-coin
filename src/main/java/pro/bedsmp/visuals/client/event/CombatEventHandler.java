package pro.bedsmp.visuals.client.event;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.fabricmc.fabric.api.client.message.v1.ClientReceiveMessageEvents;
import net.minecraft.client.Minecraft;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.EntityHitResult;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.hud.CombatLogLayer;
import pro.bedsmp.visuals.client.hud.DamageNumbersLayer;
import pro.bedsmp.visuals.client.hud.DamageSummaryLayer;
import pro.bedsmp.visuals.client.hud.DphLayer;
import pro.bedsmp.visuals.client.hud.DpsLayer;
import pro.bedsmp.visuals.client.hud.HitFlashLayer;
import pro.bedsmp.visuals.client.hud.KillStreakLayer;
import pro.bedsmp.visuals.client.hud.KillTimerLayer;
import pro.bedsmp.visuals.client.hud.MaceChainLayer;
import pro.bedsmp.visuals.client.hud.MaceHitEffectLayer;
import net.minecraft.world.item.Items;
import pro.bedsmp.visuals.client.particle.HitParticleRenderer;
import pro.bedsmp.visuals.client.state.CombatState;
import pro.bedsmp.visuals.client.state.KillFeedState;
import pro.bedsmp.visuals.client.state.TargetTracker;
import pro.bedsmp.visuals.client.sound.SoundCueManager;

import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

/**
 * Ловит события удара по сущности и разбирает сообщения чата
 * для автодетекта статуса кроватей.
 */
@Environment(EnvType.CLIENT)
public class CombatEventHandler {

    // Вызывается из Mixin при атаке игрока
    public static float lastDamageDealt = 0f;
    public static boolean lastWasCrit = false;

    public static void register() {
        // Парсинг чата для авто-режима статуса кровати
        ClientReceiveMessageEvents.GAME.register((message, overlay) -> {
            if (overlay) return;
            var cfg = BedSMPVisualsClient.CONFIG;
            if (cfg == null || !cfg.bedStatus.enabled) return;
            if (!"AUTO_HINT".equals(cfg.bedStatus.mode)) return;
            tryParseBedDestroyed(message.getString(), cfg);
        });
    }

    /** Вызывается из ClientPlayerInteractionMixin при успешном ударе. */
    public static void onHitEntity(LivingEntity target, float damage, boolean isCrit) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || mc.player == null) return;

        long tick = mc.level.getGameTime();
        var combat = CombatState.get();
        var tracker = TargetTracker.get();

        combat.markCombat(tick);
        combat.incrementCombo(target.getUUID(), tick,
                cfg.comboCounter.comboTimeoutTicks);
        tracker.setTarget(target, tick, cfg.targetHud.lockTicks);

        lastDamageDealt = damage;
        lastWasCrit = isCrit;

        // Спавн партиклов
        if (cfg.hitParticles.enabled) {
            HitParticleRenderer.get().spawnHit(target, damage, isCrit);
        }

        // Числа урона / crit-индикатор
        if (cfg.damageNumbers.enabled) {
            DamageNumbersLayer.addDamage(damage, isCrit);
        }

        // Вспышка экрана при попадании
        if (cfg.hitFlash.enabled) {
            HitFlashLayer.onHit(isCrit);
        }

        // Счётчик урона за сессию
        if (cfg.damageSummary.enabled) {
            DamageSummaryLayer.recordDealt(damage);
        }

        // DPS / DPH / Combat log
        DpsLayer.recordHit(damage);
        DphLayer.recordHit(damage);
        CombatLogLayer.addHit(damage, isCrit);

        // Эпичная волна булавы
        boolean holdingMace = mc.player.getMainHandItem().is(Items.MACE);
        if (cfg.maceHitEffect.enabled && holdingMace) {
            MaceHitEffectLayer.onMaceHit();
            MaceChainLayer.onMaceHit();
        }

        // Звуки
        if (cfg.hitSoundCues.enabled) {
            SoundCueManager.onHit(isCrit);
        }
    }

    /** Вызывается из Mixin при срабатывании тотема у сущности. */
    public static void onTotemPop(LivingEntity entity) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return;

        TargetTracker tracker = TargetTracker.get();
        if (tracker.getTarget() != null && tracker.getTarget().getUUID().equals(entity.getUUID())) {
            tracker.incrementTotemPops();
        }

        if (cfg.hitSoundCues.enabled && cfg.hitSoundCues.totemSound) {
            SoundCueManager.onTotemPop();
        }

        BedSMPVisualsClient.CONFIG.sessionStats.totemsPopped++;
    }

    /** Вызывается при убийстве сущности игроком. */
    public static void onKill(String killerName, String victimName, String weapon) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return;

        long tick = mc.level.getGameTime();

        if (cfg.killFeed.enabled) {
            KillFeedState.get().add(killerName, victimName, weapon, tick,
                    cfg.killFeed.maxLines);
        }

        // Проверяем, убил ли наш игрок
        if (mc.player != null && killerName.equals(mc.player.getName().getString())) {
            cfg.sessionStats.kills++;
            KillStreakLayer.onKill();
            KillTimerLayer.onKill();
            if (cfg.hitSoundCues.enabled && cfg.hitSoundCues.killSound) {
                SoundCueManager.onKill();
            }
        }
    }

    /** Парсинг сообщения чата для определения уничтожения кровати. */
    private static void tryParseBedDestroyed(String text, pro.bedsmp.visuals.config.ModConfig cfg) {
        try {
            Pattern pattern = Pattern.compile(cfg.bedStatus.chatRegex);
            if (pattern.matcher(text).find()) {
                // Отмечаем первую неразрушенную кровать как уничтоженную
                for (int i = 0; i < cfg.bedStatus.bedAlive.length; i++) {
                    if (cfg.bedStatus.bedAlive[i]) {
                        cfg.bedStatus.bedAlive[i] = false;
                        break;
                    }
                }
            }
        } catch (PatternSyntaxException e) {
            // Кривой regex не роняет мод
            BedSMPVisualsClient.LOGGER.warn("Некорректный regex для кровати: {}", e.getMessage());
        }
    }
}
