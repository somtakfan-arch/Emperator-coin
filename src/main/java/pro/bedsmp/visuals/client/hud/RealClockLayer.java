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

import java.time.LocalTime;

/** Реальное время (часы:минуты). */
@Environment(EnvType.CLIENT)
public class RealClockLayer {

    private static final int W = 75;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.realClock.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        LocalTime now = LocalTime.now();
        String text = String.format("🕐 %02d:%02d", now.getHour(), now.getMinute());

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.realClock.anchor.resolveX(cfg.realClock.offsetX, (int)(W * scale));
        int y = cfg.realClock.anchor.resolveY(cfg.realClock.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx, text, 5, 3, ColorUtils.withAlpha(0xFFCCCCCC, opacity));

        gfx.pose().popMatrix();
    }
}
