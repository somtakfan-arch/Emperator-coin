package pro.bedsmp.visuals.client.event;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.minecraft.client.multiplayer.ClientPacketListener;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.particle.HitParticleRenderer;
import pro.bedsmp.visuals.client.state.CombatState;
import pro.bedsmp.visuals.client.state.KillFeedState;
import pro.bedsmp.visuals.client.state.TargetTracker;

/** Сброс состояния при входе/выходе из мира. */
@Environment(EnvType.CLIENT)
public class ClientLifecycle {

    public static void register() {
        ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> {
            BedSMPVisualsClient.LOGGER.info("Подключились к серверу, инициализация состояния...");
            resetState();
        });

        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> {
            BedSMPVisualsClient.LOGGER.info("Отключились от сервера, сброс состояния...");
            resetState();
        });
    }

    private static void resetState() {
        CombatState.get().reset();
        TargetTracker.get().clear();
        KillFeedState.get().clear();
        HitParticleRenderer.get().clear();

        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg != null) {
            // Сбрасываем транзиентные поля сессии
            cfg.sessionStats.kills = 0;
            cfg.sessionStats.deaths = 0;
            cfg.sessionStats.totemsPopped = 0;
            cfg.sessionStats.maxCombo = 0;
            cfg.sessionStats.combatTimeTicks = 0;
        }
    }
}
