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

/** Рекорд максимального пережитого падения в сессии. */
@Environment(EnvType.CLIENT)
public class MaxFallLayer {

    private static final int W = 120;
    private static final int H = 13;

    private static float maxFall = 0f;

    public static void recordFall(float dist) {
        if (dist > maxFall) maxFall = dist;
    }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.maxFall.enabled || !cfg.hudVisible) return;
        if (maxFall < 3f) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.maxFall.anchor.resolveX(cfg.maxFall.offsetX, (int)(W * scale));
        int y = cfg.maxFall.anchor.resolveY(cfg.maxFall.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx, String.format("MAX FALL: %.0fm", maxFall), 5, 3,
                ColorUtils.withAlpha(0xFFAAFF88, opacity));
        gfx.pose().popMatrix();
    }
}
