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

/** Сколько секунд прошло с последнего убийства. */
@Environment(EnvType.CLIENT)
public class KillTimerLayer {

    private static final int W = 110;
    private static final int H = 13;

    private static long lastKillTick = -1;

    public static void onKill() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level != null) lastKillTick = mc.level.getGameTime();
    }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.killTimer.enabled || !cfg.hudVisible) return;
        if (lastKillTick < 0) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || mc.player == null) return;

        long elapsed = (mc.level.getGameTime() - lastKillTick) / 20;
        if (elapsed > 300) return; // Hide after 5 minutes

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.killTimer.anchor.resolveX(cfg.killTimer.offsetX, (int)(W * scale));
        int y = cfg.killTimer.anchor.resolveY(cfg.killTimer.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col = elapsed < 30
                ? ColorUtils.withAlpha(0xFF44FF44, opacity)
                : ColorUtils.withAlpha(0xFFAAAAAA, opacity);
        long m = elapsed / 60, s = elapsed % 60;
        RenderUtils.drawText(gfx, String.format("KILL: %d:%02d", m, s), 5, 3, col);
        gfx.pose().popMatrix();
    }
}
