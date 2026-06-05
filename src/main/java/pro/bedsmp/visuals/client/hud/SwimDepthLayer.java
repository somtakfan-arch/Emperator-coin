package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Глубина погружения под воду. */
@Environment(EnvType.CLIENT)
public class SwimDepthLayer {

    private static final int W = 100;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.swimDepth.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;
        if (!mc.player.isUnderWater()) return;

        double depth = mc.level.getSeaLevel() - mc.player.getY();
        if (depth < 0) depth = 0;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.swimDepth.anchor.resolveX(cfg.swimDepth.offsetX, (int)(W * scale));
        int y = cfg.swimDepth.anchor.resolveY(cfg.swimDepth.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col = depth > 30
                ? ColorUtils.withAlpha(0xFF4488FF, opacity)
                : ColorUtils.withAlpha(0xFF88BBFF, opacity);

        RenderUtils.drawText(gfx, String.format("🌊 Глубина: %.1fм", depth), 5, 3, col);

        gfx.pose().popMatrix();
    }
}
