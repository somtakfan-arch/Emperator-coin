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

/** Текущая горизонтальная скорость в блоках/сек. */
@Environment(EnvType.CLIENT)
public class SpeedLayer {

    private static final int W = 85;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.speedDisplay.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        double speed = mc.player.getDeltaMovement().horizontalDistance() * 20.0;
        if (speed < 0.01) return; // стоим — не показываем

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.speedDisplay.anchor.resolveX(cfg.speedDisplay.offsetX, (int)(W * scale));
        int y = cfg.speedDisplay.anchor.resolveY(cfg.speedDisplay.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col;
        if (speed > 5.5)      col = ColorUtils.withAlpha(0xFF44FF44, opacity); // спринт
        else if (speed > 4.0) col = ColorUtils.withAlpha(0xFFFFAA00, opacity); // быстро
        else                  col = ColorUtils.withAlpha(0xFFAAAAAA, opacity);  // шаг

        RenderUtils.drawText(gfx, String.format("⚡ %.2f б/с", speed), 5, 3, col);

        gfx.pose().popMatrix();
    }
}
