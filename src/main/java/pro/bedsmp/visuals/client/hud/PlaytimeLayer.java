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

/** Время в сессии. */
@Environment(EnvType.CLIENT)
public class PlaytimeLayer {

    private static final int W = 100;
    private static final int H = 13;

    private static long sessionStartMs = -1;

    public static void reset() { sessionStartMs = -1; }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.playtime.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        if (sessionStartMs < 0) sessionStartMs = System.currentTimeMillis();

        long elapsed = (System.currentTimeMillis() - sessionStartMs) / 1000L;
        long hours   = elapsed / 3600;
        long minutes = (elapsed % 3600) / 60;
        long seconds = elapsed % 60;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.playtime.anchor.resolveX(cfg.playtime.offsetX, (int)(W * scale));
        int y = cfg.playtime.anchor.resolveY(cfg.playtime.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        RenderUtils.drawText(gfx,
                String.format("⏱ %02d:%02d:%02d", hours, minutes, seconds),
                5, 3, ColorUtils.withAlpha(0xFFCCCCCC, opacity));

        gfx.pose().popMatrix();
    }
}
