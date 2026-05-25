package pro.bedsmp.visuals.client.world;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderContext;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderEvents;
import net.minecraft.client.Minecraft;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.particle.HitParticleRenderer;

/**
 * Регистрирует World Render Events для 3D-эффектов.
 * Fabric API 1.21.11: WorldRenderEvents в пакете .world.
 */
@Environment(EnvType.CLIENT)
public class WorldRenderManager {

    public static void register() {
        // Рендер после сущностей — для партиклов
        WorldRenderEvents.AFTER_ENTITIES.register(context -> {
            var cfg = BedSMPVisualsClient.CONFIG;
            if (cfg == null) return;

            if (cfg.hitParticles.enabled) {
                var consumers = context.consumers();
                if (consumers != null) {
                    Minecraft mc = Minecraft.getInstance();
                    float partialTick = mc.getDeltaTracker().getGameTimeDeltaPartialTick(false);
                    HitParticleRenderer.get().render(
                            context.matrices(),
                            consumers,
                            partialTick,
                            mc.gameRenderer.getMainCamera().position()
                    );
                }
            }
        });

        // Рендер в конце основного прохода — для траекторий и подсветки
        WorldRenderEvents.END_MAIN.register(context -> {
            var cfg = BedSMPVisualsClient.CONFIG;
            if (cfg == null) return;

            if (cfg.trajectory.enabled) {
                TrajectoryRenderer.render(context);
            }

            if (cfg.bedHighlight.enabled) {
                BedHighlightRenderer.render(context);
            }
        });
    }
}
