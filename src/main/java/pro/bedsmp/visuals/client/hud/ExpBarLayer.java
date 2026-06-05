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

/** Уровень и прогресс опыта. */
@Environment(EnvType.CLIENT)
public class ExpBarLayer {

    private static final int W = 90;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.expDisplay.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        int   level    = mc.player.experienceLevel;
        float progress = mc.player.experienceProgress;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.expDisplay.anchor.resolveX(cfg.expDisplay.offsetX, (int)(W * scale));
        int y = cfg.expDisplay.anchor.resolveY(cfg.expDisplay.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int green = ColorUtils.withAlpha(0xFF44FF44, opacity);
        RenderUtils.drawText(gfx, "✦ Ур." + level, 5, 3,
                ColorUtils.withAlpha(0xFFFFFFFF, opacity));
        RenderUtils.drawProgressBar(gfx, 45, 5, 40, 4, progress,
                ColorUtils.withAlpha(0xFF333333, opacity), green);

        gfx.pose().popMatrix();
    }
}
