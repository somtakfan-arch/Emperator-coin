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

/** Уровень сытости и насыщения. */
@Environment(EnvType.CLIENT)
public class FoodSatLayer {

    private static final int W = 110;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.foodDisplay.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        int food       = mc.player.getFoodData().getFoodLevel();
        float sat      = mc.player.getFoodData().getSaturationLevel();

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.foodDisplay.anchor.resolveX(cfg.foodDisplay.offsetX, (int)(W * scale));
        int y = cfg.foodDisplay.anchor.resolveY(cfg.foodDisplay.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col = food < 6
                ? ColorUtils.withAlpha(0xFFFF4444, opacity)
                : food < 13
                ? ColorUtils.withAlpha(0xFFFFAA00, opacity)
                : ColorUtils.withAlpha(0xFF44FF44, opacity);

        RenderUtils.drawText(gfx, String.format("🍖 %d/20  ✦ %.1f", food, sat), 5, 3, col);

        gfx.pose().popMatrix();
    }
}
