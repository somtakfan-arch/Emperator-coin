package pro.bedsmp.visuals;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import pro.bedsmp.visuals.config.ConfigManager;
import pro.bedsmp.visuals.config.ModConfig;
import pro.bedsmp.visuals.client.event.CombatEventHandler;
import pro.bedsmp.visuals.client.event.TickHandler;
import pro.bedsmp.visuals.client.event.ClientLifecycle;
import pro.bedsmp.visuals.client.hud.HudManager;
import pro.bedsmp.visuals.client.world.WorldRenderManager;
import pro.bedsmp.visuals.client.sound.SoundCueManager;

@Environment(EnvType.CLIENT)
public class BedSMPVisualsClient implements ClientModInitializer {

    public static final String MOD_ID = "bedsmpvisuals";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    // Singleton конфига — доступен отовсюду
    public static ModConfig CONFIG;

    @Override
    public void onInitializeClient() {
        CONFIG = ConfigManager.load();

        KeyBindings.register();

        HudManager.register();
        WorldRenderManager.register();
        CombatEventHandler.register();
        TickHandler.register();
        ClientLifecycle.register();
        SoundCueManager.register();

        long activeCount = countActiveFeatures();
        LOGGER.info("BedSMP VISUALS v{} загружен. Активных функций: {}", getVersion(), activeCount);
    }

    private long countActiveFeatures() {
        if (CONFIG == null) return 0;
        int count = 0;
        if (CONFIG.hitParticles.enabled) count++;
        if (CONFIG.targetHud.enabled) count++;
        if (CONFIG.damageNumbers.enabled) count++;
        if (CONFIG.critEffects.enabled) count++;
        if (CONFIG.trajectory.enabled) count++;
        if (CONFIG.bedStatus.enabled) count++;
        if (CONFIG.combatTimer.enabled) count++;
        if (CONFIG.totemCounter.enabled) count++;
        if (CONFIG.killFeed.enabled) count++;
        if (CONFIG.lowHpVignette.enabled) count++;
        if (CONFIG.cpsCounter.enabled) count++;
        if (CONFIG.comboCounter.enabled) count++;
        if (CONFIG.reachDisplay.enabled) count++;
        if (CONFIG.effectsHud.enabled) count++;
        if (CONFIG.armorHud.enabled) count++;
        if (CONFIG.pingFps.enabled) count++;
        if (CONFIG.coordinates.enabled) count++;
        if (CONFIG.watermark.enabled) count++;
        if (CONFIG.sessionStats.enabled) count++;
        return count;
    }

    private String getVersion() {
        return net.fabricmc.loader.api.FabricLoader.getInstance()
                .getModContainer(MOD_ID)
                .map(c -> c.getMetadata().getVersion().getFriendlyString())
                .orElse("?");
    }
}
