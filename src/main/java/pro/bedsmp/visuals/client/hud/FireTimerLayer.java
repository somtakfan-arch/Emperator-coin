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

/** Оставшееся время горения игрока (тики/секунды). */
@Environment(EnvType.CLIENT)
public class FireTimerLayer {

    private static final int W = 100;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.fireTimer.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        int fireTicks = mc.player.getRemainingFireTicks();
        if (fireTicks <= 0) return;

        float secs = fireTicks / 20f;
        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.fireTimer.anchor.resolveX(cfg.fireTimer.offsetX, (int)(W * scale));
        int y = cfg.fireTimer.anchor.resolveY(cfg.fireTimer.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx, String.format("🔥 ОГОНЬ %.1fs", secs), 5, 3,
                ColorUtils.withAlpha(0xFFFF6600, opacity));
        gfx.pose().popMatrix();
    }
}
