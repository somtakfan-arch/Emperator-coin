package pro.bedsmp.visuals.client.world;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderEvents;
import net.minecraft.client.Minecraft;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.particle.HitParticleRenderer;

@Environment(EnvType.CLIENT)
public class WorldRenderManager {

    public static void register() {
        WorldRenderEvents.END_MAIN.register(context -> {
            var cfg = BedSMPVisualsClient.CONFIG;
            if (cfg == null) return;

            var consumers = context.consumers();
            if (consumers == null) return;

            Minecraft mc = Minecraft.getInstance();
            if (mc.level == null || mc.player == null) return;

            if (cfg.hitParticles.enabled) {
                float partialTick = mc.getDeltaTracker().getGameTimeDeltaPartialTick(false);
                HitParticleRenderer.get().render(
                        context.matrices(),
                        consumers,
                        partialTick,
                        mc.gameRenderer.getMainCamera().position()
                );
            }

            if (cfg.trajectory.enabled) {
                TrajectoryRenderer.render(context);
            }

            if (cfg.bedHighlight.enabled) {
                BedHighlightRenderer.render(context);
            }
        });
    }
}
