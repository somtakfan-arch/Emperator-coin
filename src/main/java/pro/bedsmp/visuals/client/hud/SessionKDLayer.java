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

/** Расширенная панель статистики сессии: убийства, смерти, K/D. */
@Environment(EnvType.CLIENT)
public class SessionKDLayer {

    private static final int W = 120;
    private static final int H = 26;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.sessionKD.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        int kills  = cfg.sessionStats.kills;
        int deaths = cfg.sessionStats.deaths;
        float kd   = deaths > 0 ? (float) kills / deaths : kills;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.sessionKD.anchor.resolveX(cfg.sessionKD.offsetX, (int)(W * scale));
        int y = cfg.sessionKD.anchor.resolveY(cfg.sessionKD.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.fillRect(gfx, 0, 0, 2, H, ColorUtils.withAlpha(ThemeRegistry.accent(), opacity));

        int fh = RenderUtils.fontHeight() + 2;
        RenderUtils.drawText(gfx,
                String.format("K: %d  D: %d", kills, deaths),
                5, 3, ColorUtils.withAlpha(0xFFFFFFFF, opacity));
        RenderUtils.drawText(gfx,
                String.format("K/D: %.2f  Tot: %d", kd, cfg.sessionStats.totemsPopped),
                5, 3 + fh,
                kd >= 1f
                        ? ColorUtils.withAlpha(0xFF44FF44, opacity)
                        : ColorUtils.withAlpha(0xFFFF8888, opacity));

        gfx.pose().popMatrix();
    }
}
