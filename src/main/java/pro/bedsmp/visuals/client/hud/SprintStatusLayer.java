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

/** Индикатор статуса спринта. */
@Environment(EnvType.CLIENT)
public class SprintStatusLayer {

    private static final int W = 90;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.sprintStatus.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.sprintStatus.anchor.resolveX(cfg.sprintStatus.offsetX, (int)(W * scale));
        int y = cfg.sprintStatus.anchor.resolveY(cfg.sprintStatus.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        boolean sprinting = mc.player.isSprinting();
        int col = sprinting
                ? ColorUtils.withAlpha(0xFF44FF44, opacity)
                : ColorUtils.withAlpha(0xFFAAAAAA, opacity);
        RenderUtils.drawText(gfx, sprinting ? "▶▶ Спринт" : "▶ Шаг", 5, 3, col);

        gfx.pose().popMatrix();
    }
}
