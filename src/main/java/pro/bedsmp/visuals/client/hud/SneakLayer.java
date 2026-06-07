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

/** Индикатор приседания: показывает, что игрок крадётся, и длительность. */
@Environment(EnvType.CLIENT)
public class SneakLayer {

    private static final int W = 100;
    private static final int H = 13;

    private static long sneakStartTick = -1;

    public static void tick(Minecraft mc) {
        if (mc.player == null) return;
        boolean sneaking = mc.player.isCrouching();
        if (sneaking && sneakStartTick < 0) {
            sneakStartTick = mc.level != null ? mc.level.getGameTime() : 0;
        } else if (!sneaking) {
            sneakStartTick = -1;
        }
    }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.sneakIndicator.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || !mc.player.isCrouching()) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.sneakIndicator.anchor.resolveX(cfg.sneakIndicator.offsetX, (int)(W * scale));
        int y = cfg.sneakIndicator.anchor.resolveY(cfg.sneakIndicator.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        long dur = (mc.level != null && sneakStartTick >= 0) ? (mc.level.getGameTime() - sneakStartTick) / 20 : 0;
        RenderUtils.drawText(gfx, String.format("SNEAK  %ds", dur), 5, 3,
                ColorUtils.withAlpha(0xFFAABBFF, opacity));
        gfx.pose().popMatrix();
    }
}
