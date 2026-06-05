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

/** Визуальный индикатор нажатых клавиш движения (WASD). */
@Environment(EnvType.CLIENT)
public class StrafingLayer {

    private static final int W  = 44;
    private static final int H  = 30;
    private static final int KS = 12; // размер клавиши

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.strafingDisplay.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        boolean w = mc.options.keyUp.isDown();
        boolean a = mc.options.keyLeft.isDown();
        boolean s = mc.options.keyDown.isDown();
        boolean d = mc.options.keyRight.isDown();

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.strafingDisplay.anchor.resolveX(cfg.strafingDisplay.offsetX, (int)(W * scale));
        int y = cfg.strafingDisplay.anchor.resolveY(cfg.strafingDisplay.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        drawKey(gfx, 16, 2,  "W", w, opacity);
        drawKey(gfx, 2,  16, "A", a, opacity);
        drawKey(gfx, 16, 16, "S", s, opacity);
        drawKey(gfx, 30, 16, "D", d, opacity);

        gfx.pose().popMatrix();
    }

    private static void drawKey(GuiGraphics gfx, int x, int y, String label,
                                 boolean pressed, float opacity) {
        int bg  = pressed
                ? ColorUtils.withAlpha(0xFF44FF44, opacity * 0.9f)
                : ColorUtils.withAlpha(0xFF333333, opacity * 0.7f);
        int txt = pressed
                ? ColorUtils.withAlpha(0xFF000000, opacity)
                : ColorUtils.withAlpha(0xFF888888, opacity);
        RenderUtils.fillRect(gfx, x, y, KS, KS, bg);
        RenderUtils.drawText(gfx, label, x + 2, y + 2, txt);
    }
}
