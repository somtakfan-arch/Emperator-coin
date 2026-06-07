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

/** Счётчик времени без движения — антиАФК предупреждение. */
@Environment(EnvType.CLIENT)
public class AntiAfkLayer {

    private static final int W        = 120;
    private static final int H        = 13;
    private static final int WARN_SEC = 120; // 2 минуты

    private static double lastX, lastY, lastZ;
    private static long   stillSince = 0;

    public static void tick(Minecraft mc) {
        if (mc.player == null || mc.level == null) return;
        double x = mc.player.getX(), y = mc.player.getY(), z = mc.player.getZ();
        double d2 = (x - lastX) * (x - lastX) + (z - lastZ) * (z - lastZ) + (y - lastY) * (y - lastY);
        if (d2 > 0.01) {
            lastX = x; lastY = y; lastZ = z;
            stillSince = mc.level.getGameTime();
        }
    }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.antiAfk.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || mc.player == null) return;

        long idle = (mc.level.getGameTime() - stillSince) / 20;
        if (idle < 10) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.antiAfk.anchor.resolveX(cfg.antiAfk.offsetX, (int)(W * scale));
        int y = cfg.antiAfk.anchor.resolveY(cfg.antiAfk.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col = idle >= WARN_SEC
                ? ColorUtils.withAlpha(0xFFFF4444, opacity)
                : ColorUtils.withAlpha(0xFFFFAA00, opacity);
        long m = idle / 60, s = idle % 60;
        RenderUtils.drawText(gfx, String.format("АФК: %d:%02d", m, s), 5, 3, col);
        gfx.pose().popMatrix();
    }
}
