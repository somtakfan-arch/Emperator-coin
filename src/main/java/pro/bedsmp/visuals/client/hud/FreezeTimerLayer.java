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

/** Прогресс заморозки в порошковом снеге. */
@Environment(EnvType.CLIENT)
public class FreezeTimerLayer {

    private static final int W = 95;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.freezeTimer.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        int ticks = mc.player.getTicksFrozen();
        if (ticks <= 0) return;

        float progress = Math.min(1f, ticks / 140f);
        int pct = (int)(progress * 100);

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.freezeTimer.anchor.resolveX(cfg.freezeTimer.offsetX, (int)(W * scale));
        int y = cfg.freezeTimer.anchor.resolveY(cfg.freezeTimer.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col = ColorUtils.withAlpha(0xFF88DDFF, opacity);
        RenderUtils.drawText(gfx, String.format("❄ Заморозка: %d%%", pct), 5, 3, col);

        gfx.pose().popMatrix();
    }
}
