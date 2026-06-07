package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.CameraType;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Индикатор режима камеры: F1 / F3 / сзади. */
@Environment(EnvType.CLIENT)
public class PerspectiveLayer {

    private static final int W = 80;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.perspectiveIndicator.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        CameraType cam = mc.options.getCameraType();
        if (cam == CameraType.FIRST_PERSON) return; // Не показываем в первом лице

        String label;
        int col;
        if (cam == CameraType.THIRD_PERSON_BACK) {
            label = "3РД СПИНА";
            col   = 0xFFAADDFF;
        } else {
            label = "3РД ПЕРЕД";
            col   = 0xFFFFAADD;
        }

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.perspectiveIndicator.anchor.resolveX(cfg.perspectiveIndicator.offsetX, (int)(W * scale));
        int y = cfg.perspectiveIndicator.anchor.resolveY(cfg.perspectiveIndicator.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx, label, 5, 3, ColorUtils.withAlpha(col, opacity));
        gfx.pose().popMatrix();
    }
}
