package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.DeltaTracker;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.event.TickHandler;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Счётчик кликов в секунду (ЛКМ и ПКМ). */
@Environment(EnvType.CLIENT)
public class CpsLayer {

    private static final int W = 80;
    private static final int H = 14;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.cpsCounter.enabled || !cfg.hudVisible) return;

        float scale = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.cpsCounter.anchor.resolveX(cfg.cpsCounter.offsetX, (int)(W * scale));
        int y = cfg.cpsCounter.anchor.resolveY(cfg.cpsCounter.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int accent = ColorUtils.withAlpha(ThemeRegistry.accent(), opacity);
        int text = ColorUtils.withAlpha(ThemeRegistry.text(), opacity);

        String label;
        if (cfg.cpsCounter.showBoth) {
            label = String.format("Л %d  П %d cps", TickHandler.cpsLeft, TickHandler.cpsRight);
        } else {
            label = String.format("%d cps", TickHandler.cpsLeft);
        }

        int tw = RenderUtils.textWidth(label);
        RenderUtils.drawText(gfx, label, (W - tw) / 2, (H - RenderUtils.fontHeight()) / 2, accent);

        gfx.pose().popMatrix();
    }
}
