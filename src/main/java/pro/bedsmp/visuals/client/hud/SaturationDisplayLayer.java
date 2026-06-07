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

/** Визуальный индикатор сытости/насыщения. */
@Environment(EnvType.CLIENT)
public class SaturationDisplayLayer {

    private static final int W = 110;
    private static final int H = 18;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.saturationDisplay.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        var food = mc.player.getFoodData();
        int hunger = food.getFoodLevel();
        float sat  = food.getSaturationLevel();
        float maxSat = 20f;
        float frac = Math.min(1f, sat / maxSat);

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.saturationDisplay.anchor.resolveX(cfg.saturationDisplay.offsetX, (int)(W * scale));
        int y = cfg.saturationDisplay.anchor.resolveY(cfg.saturationDisplay.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int fh = RenderUtils.fontHeight();
        RenderUtils.drawText(gfx, String.format("Еда:%d  Нас:%.1f", hunger, sat), 4, 2,
                ColorUtils.withAlpha(0xFFFFCC44, opacity));

        // Saturation bar
        int barW = W - 8;
        int barCol = sat > 10 ? ColorUtils.withAlpha(0xFFFFDD44, opacity * 0.8f)
                : sat > 4   ? ColorUtils.withAlpha(0xFFFFAA00, opacity * 0.8f)
                :              ColorUtils.withAlpha(0xFFFF4444, opacity * 0.8f);
        RenderUtils.fillRect(gfx, 4, 2 + fh + 1, 4 + barW, 2 + fh + 4, ColorUtils.withAlpha(0xFF333333, opacity * 0.5f));
        RenderUtils.fillRect(gfx, 4, 2 + fh + 1, 4 + (int)(barW * frac), 2 + fh + 4, barCol);
        gfx.pose().popMatrix();
    }
}
