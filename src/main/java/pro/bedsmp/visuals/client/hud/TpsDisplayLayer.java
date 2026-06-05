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

/**
 * Расчётный TPS сервера по частоте тиков уровня.
 * Клиентская оценка — ненадёжна при лаге, но полезна как индикатор.
 */
@Environment(EnvType.CLIENT)
public class TpsDisplayLayer {

    private static final int W = 85;
    private static final int H = 13;

    private static long prevLevelTime = -1;
    private static long prevRealTime  = -1;
    private static float estimatedTps = 20f;

    // Вызывается каждый CLIENT-тик
    public static void onTick(Minecraft mc) {
        if (mc.level == null) { prevLevelTime = -1; return; }
        long levelTime = mc.level.getGameTime();
        long realTime  = System.currentTimeMillis();
        if (prevLevelTime > 0 && prevRealTime > 0) {
            long dtLevel = levelTime - prevLevelTime;
            long dtReal  = realTime  - prevRealTime;
            if (dtReal > 0 && dtLevel > 0) {
                float tps = dtLevel * 1000f / dtReal;
                estimatedTps = estimatedTps * 0.9f + Math.min(20f, tps) * 0.1f; // скользящее среднее
            }
        }
        prevLevelTime = levelTime;
        prevRealTime  = realTime;
    }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.tpsDisplay.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.tpsDisplay.anchor.resolveX(cfg.tpsDisplay.offsetX, (int)(W * scale));
        int y = cfg.tpsDisplay.anchor.resolveY(cfg.tpsDisplay.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col = estimatedTps >= 19f
                ? ColorUtils.withAlpha(0xFF44FF44, opacity)
                : estimatedTps >= 15f
                ? ColorUtils.withAlpha(0xFFFFAA00, opacity)
                : ColorUtils.withAlpha(0xFFFF4444, opacity);

        RenderUtils.drawText(gfx, String.format("TPS: %.1f", estimatedTps), 5, 3, col);

        gfx.pose().popMatrix();
    }
}
