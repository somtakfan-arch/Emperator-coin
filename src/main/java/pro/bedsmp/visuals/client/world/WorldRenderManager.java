package pro.bedsmp.visuals.client.world;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderEvents;
import net.minecraft.client.Minecraft;

import pro.bedsmp.visuals.BedSMPVisualsClient;

@Environment(EnvType.CLIENT)
public class WorldRenderManager {

    public static void register() {
        // BedHighlight — ESP-подобная функция, выключена по умолчанию.
        // Trajectory перенесена в HUD-рендер (2D проекция) во избежание GL-краша.
        WorldRenderEvents.AFTER_ENTITIES.register(context -> {
            var cfg = BedSMPVisualsClient.CONFIG;
            if (cfg == null) return;

            var consumers = context.consumers();
            if (consumers == null) return;

            Minecraft mc = Minecraft.getInstance();
            if (mc.level == null || mc.player == null) return;

            if (cfg.bedHighlight.enabled) {
                BedHighlightRenderer.render(context);
            }
        });
    }
}
