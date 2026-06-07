package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.util.ColorUtils;

/** Эпичная волна-шокволна при ударе булавой. */
@Environment(EnvType.CLIENT)
public class MaceHitEffectLayer {

    private static final int DURATION = 45;

    // Per-ring: [maxRadius, startTick, endTick, baseColor]
    private static final int[][] RINGS = {
        { 110, 0,  30, 0xFFFF8800 },  // огонь-оранжевый
        { 130, 6,  36, 0xFF00EEFF },  // электро-голубой
        { 90,  12, 40, 0xFFFFFFFF },  // белое эхо
    };

    private static long hitTick = -1;
    private static final int[] sparkleAngles = new int[14];
    private static final int[] sparkleDistFrac = new int[14]; // 0-100

    static {
        for (int i = 0; i < 14; i++) {
            sparkleAngles[i]    = (int)(Math.random() * 360);
            sparkleDistFrac[i]  = 40 + (int)(Math.random() * 55);
        }
    }

    public static void onMaceHit() {
        hitTick = -1; // will be set on first render tick
        hitTick = Long.MIN_VALUE; // sentinel: newly triggered
        for (int i = 0; i < 14; i++) {
            sparkleAngles[i]   = (int)(Math.random() * 360);
            sparkleDistFrac[i] = 40 + (int)(Math.random() * 55);
        }
    }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.maceHitEffect.enabled) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return;

        long now = mc.level.getGameTime();

        // Инициализируем hitTick при первом рендере после триггера
        if (hitTick == Long.MIN_VALUE) {
            hitTick = now;
        }
        if (hitTick < 0) return;

        int elapsed = (int)(now - hitTick);
        if (elapsed > DURATION) {
            hitTick = -1;
            return;
        }

        int w = mc.getWindow().getGuiScaledWidth();
        int h = mc.getWindow().getGuiScaledHeight();
        int cx = w / 2;
        int cy = h / 2;

        float opacity = cfg.globalOpacity;

        // Кратковременная вспышка экрана (первые 4 тика)
        if (elapsed < 4) {
            float flashAlpha = (1f - elapsed / 4f) * 0.35f * opacity;
            int flashColor = ColorUtils.withAlpha(0xFFFF8800, flashAlpha);
            gfx.fill(0, 0, w, h, flashColor);
        }

        // Три расширяющихся кольца
        for (int[] ring : RINGS) {
            int maxR    = ring[0];
            int rStart  = ring[1];
            int rEnd    = ring[2];
            int baseCol = ring[3];

            if (elapsed < rStart || elapsed > rEnd) continue;

            float t = (float)(elapsed - rStart) / (rEnd - rStart); // 0→1
            int r = (int)(maxR * t);

            // Затухание: быстро нарастает, медленно гаснет
            float alpha;
            if (t < 0.15f) alpha = t / 0.15f;
            else           alpha = 1f - (t - 0.15f) / 0.85f;
            alpha *= opacity;

            int color = ColorUtils.withAlpha(baseCol, alpha);
            drawRing(gfx, cx, cy, r, 2, color);
        }

        // Sparkle-точки (разлетаются от центра)
        for (int i = 0; i < 14; i++) {
            double rad   = Math.toRadians(sparkleAngles[i]);
            float t      = (float)elapsed / DURATION;
            if (t < 0.1f) continue;

            float dist   = sparkleDistFrac[i] * t * 1.4f;
            int sx = cx + (int)(dist * Math.cos(rad));
            int sy = cy + (int)(dist * Math.sin(rad));

            float alpha = (1f - t) * opacity;
            // Чередуем оранжевый/голубой
            int sc = (i % 2 == 0) ? ColorUtils.withAlpha(0xFFFF8800, alpha) : ColorUtils.withAlpha(0xFF00EEFF, alpha);
            int sz = i % 3 == 0 ? 2 : 1;
            gfx.fill(sx - sz, sy - sz, sx + sz, sy + sz, sc);
        }

        // Внутренняя яркая вспышка (первые 10 тиков)
        if (elapsed < 10) {
            float t    = (float)elapsed / 10f;
            float a    = (1f - t) * 0.6f * opacity;
            int inner  = (int)(30 * t);
            drawRing(gfx, cx, cy, inner, 4, ColorUtils.withAlpha(0xFFFFFFFF, a));
        }
    }

    private static void drawRing(GuiGraphics gfx, int cx, int cy, int r, int dotSize, int color) {
        if (r <= 0) return;
        double circumference = 2 * Math.PI * r;
        double step = Math.max(1.5, 360.0 * dotSize / circumference);
        for (double angle = 0; angle < 360; angle += step) {
            double rad = Math.toRadians(angle);
            int px = cx + (int)(r * Math.cos(rad));
            int py = cy + (int)(r * Math.sin(rad));
            gfx.fill(px - dotSize, py - dotSize, px + dotSize, py + dotSize, color);
        }
    }
}
