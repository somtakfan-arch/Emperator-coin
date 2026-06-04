package pro.bedsmp.visuals.client.sound;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;

import pro.bedsmp.visuals.BedSMPVisualsClient;

/** Кастомные звуковые сигналы для боевых событий. */
@Environment(EnvType.CLIENT)
public class SoundCueManager {

    private SoundCueManager() {}

    public static void register() {
        // Звуки используют ванильные SoundEvents — регистрация не нужна
    }

    public static void onHit(boolean isCrit) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.hitSoundCues.enabled) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;

        float vol = cfg.hitSoundCues.volume;

        if (isCrit && cfg.hitSoundCues.critSound) {
            mc.level.playLocalSound(
                    mc.player.getX(), mc.player.getY(), mc.player.getZ(),
                    SoundEvents.PLAYER_ATTACK_CRIT,
                    SoundSource.PLAYERS,
                    vol, 1.2f, false
            );
        } else {
            mc.level.playLocalSound(
                    mc.player.getX(), mc.player.getY(), mc.player.getZ(),
                    SoundEvents.PLAYER_ATTACK_STRONG,
                    SoundSource.PLAYERS,
                    vol * 0.5f, 1.0f, false
            );
        }
    }

    public static void onTotemPop() {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.hitSoundCues.enabled || !cfg.hitSoundCues.totemSound) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;

        mc.level.playLocalSound(
                mc.player.getX(), mc.player.getY(), mc.player.getZ(),
                SoundEvents.TOTEM_USE,
                SoundSource.PLAYERS,
                cfg.hitSoundCues.volume, 0.8f, false
        );
    }

    public static void onKill() {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.hitSoundCues.enabled || !cfg.hitSoundCues.killSound) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;

        mc.level.playLocalSound(
                mc.player.getX(), mc.player.getY(), mc.player.getZ(),
                SoundEvents.EXPERIENCE_ORB_PICKUP,
                SoundSource.PLAYERS,
                cfg.hitSoundCues.volume, 0.6f, false
        );
    }

    public static void onDeath() {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.hitSoundCues.enabled || !cfg.hitSoundCues.deathSound) return;
        // Смерть игрока — ванильный звук уже есть, этот слот зарезервирован под кастом
    }
}
