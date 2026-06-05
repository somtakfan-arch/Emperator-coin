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

/** Индикатор W-tap (сброс спринта для увеличения нокбэка). */
@Environment(EnvType.CLIENT)
public class WTapIndicatorLayer {

    private static final int W = 75;
    private static final int H = 13;

    private static boolean prevSprinting = false;
    private static long    sprintStopTick = -1;
    private static long    flashTick      = -1;

    public static void tick(Minecraft mc) {
        if (mc.player == null || mc.level == null) return;
        boolean sprinting = mc.player.isSprinting();
        long now = mc.level.getGameTime();
        if (prevSprinting && !sprinting) {
            sprintStopTick = now;
        }
        if (!prevSprinting && sprinting && sprintStopTick > 0 && now - sprintStopTick <= 3) {
            // Успешный W-tap: спринт остановился, потом снова включился быстро
            flashTick = now;
        }
        prevSprinting = sprinting;
    }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.wTapIndicator.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;

        long now = mc.level.getGameTime();
        if (flashTick < 0 || now - flashTick >= 8) return;

        float alpha = (1f - (now - flashTick) / 8f) * cfg.globalOpacity;
        float scale = cfg.globalScale;

        int x = cfg.wTapIndicator.anchor.resolveX(cfg.wTapIndicator.offsetX, (int)(W * scale));
        int y = cfg.wTapIndicator.anchor.resolveY(cfg.wTapIndicator.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), alpha * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx, "W-TAP! ✓", 5, 3, ColorUtils.withAlpha(0xFF44FF44, alpha));

        gfx.pose().popMatrix();
    }
}
