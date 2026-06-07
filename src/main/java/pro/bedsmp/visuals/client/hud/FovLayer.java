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

/** Текущее значение FOV (с учётом бега и зума). */
@Environment(EnvType.CLIENT)
public class FovLayer {

    private static final int W = 70;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.fovDisplay.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        double baseFov = mc.options.fov().get();

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.fovDisplay.anchor.resolveX(cfg.fovDisplay.offsetX, (int)(W * scale));
        int y = cfg.fovDisplay.anchor.resolveY(cfg.fovDisplay.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx, String.format("FOV: %d", (int)baseFov), 5, 3,
                ColorUtils.withAlpha(0xFFCCCCCC, opacity));
        gfx.pose().popMatrix();
    }
}
