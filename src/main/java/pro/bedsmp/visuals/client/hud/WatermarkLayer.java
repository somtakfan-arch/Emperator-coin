package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.DeltaTracker;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Логотип сервера/мода в углу. */
@Environment(EnvType.CLIENT)
public class WatermarkLayer {

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.watermark.enabled || !cfg.hudVisible) return;

        float scale = cfg.globalScale;
        float opacity = cfg.globalOpacity * cfg.watermark.opacity;

        String text = cfg.watermark.text + " VISUALS";
        int w = RenderUtils.textWidth(text) + 8;
        int h = RenderUtils.fontHeight() + 4;

        int x = cfg.watermark.anchor.resolveX(cfg.watermark.offsetX, (int)(w * scale));
        int y = cfg.watermark.anchor.resolveY(cfg.watermark.offsetY, (int)(h * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.7f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, w, h, 3, bg);

        // Акцент-полоска слева
        RenderUtils.fillRect(gfx, 0, 0, 2, h, ColorUtils.withAlpha(ThemeRegistry.accent(), opacity));

        RenderUtils.drawText(gfx, text, 4, 2, ColorUtils.withAlpha(ThemeRegistry.accent(), opacity));

        gfx.pose().popMatrix();
    }
}
