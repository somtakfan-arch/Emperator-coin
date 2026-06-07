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

/** Пройденное расстояние за сессию (в блоках). */
@Environment(EnvType.CLIENT)
public class MovementDistanceLayer {

    private static final int W = 130;
    private static final int H = 13;

    private static double totalDist = 0;
    private static double lastX = Double.NaN, lastY = Double.NaN, lastZ = Double.NaN;

    public static void tick(Minecraft mc) {
        if (mc.player == null) return;
        double x = mc.player.getX(), y = mc.player.getY(), z = mc.player.getZ();
        if (!Double.isNaN(lastX)) {
            double d = Math.sqrt((x-lastX)*(x-lastX) + (y-lastY)*(y-lastY) + (z-lastZ)*(z-lastZ));
            if (d < 50) totalDist += d; // Guard against teleport
        }
        lastX = x; lastY = y; lastZ = z;
    }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.movementDistance.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.movementDistance.anchor.resolveX(cfg.movementDistance.offsetX, (int)(W * scale));
        int y = cfg.movementDistance.anchor.resolveY(cfg.movementDistance.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx, String.format("ПУТЬ: %.0fm", totalDist), 5, 3,
                ColorUtils.withAlpha(0xFF88CCFF, opacity));
        gfx.pose().popMatrix();
    }
}
