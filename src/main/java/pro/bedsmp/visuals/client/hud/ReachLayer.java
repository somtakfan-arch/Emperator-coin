package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.DeltaTracker;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.state.TargetTracker;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Дистанция до цели в момент удара. */
@Environment(EnvType.CLIENT)
public class ReachLayer {

    private static float lastReach = 0f;
    private static long lastReachTick = -1;

    /** Запомнить дистанцию при ударе (из Mixin). */
    public static void recordReach(float reach) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.reachDisplay.enabled) return;
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return;
        lastReach = reach;
        lastReachTick = mc.level.getGameTime();
    }

    private static final int W = 70;
    private static final int H = 14;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.reachDisplay.enabled || !cfg.hudVisible) return;
        if (lastReachTick < 0) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return;

        long currentTick = mc.level.getGameTime();
        if (currentTick - lastReachTick > cfg.reachDisplay.displayTicks) return;

        float scale = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.reachDisplay.anchor.resolveX(cfg.reachDisplay.offsetX, (int)(W * scale));
        int y = cfg.reachDisplay.anchor.resolveY(cfg.reachDisplay.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        String text = String.format("⇔ %.2fб", lastReach);
        int tw = RenderUtils.textWidth(text);
        RenderUtils.drawText(gfx, text, (W - tw) / 2, (H - RenderUtils.fontHeight()) / 2,
                ColorUtils.withAlpha(ThemeRegistry.accent(), opacity));

        gfx.pose().popMatrix();
    }
}
