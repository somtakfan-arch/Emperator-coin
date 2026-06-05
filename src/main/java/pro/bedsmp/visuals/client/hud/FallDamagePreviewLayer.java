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

/** Предпросмотр урона от падения. */
@Environment(EnvType.CLIENT)
public class FallDamagePreviewLayer {

    private static final int W = 95;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.fallDamagePreview.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        float fall = (float) mc.player.fallDistance;
        if (fall < 2f) return;

        float dmg = Math.max(0f, fall - 3f);
        if (dmg <= 0f) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.fallDamagePreview.anchor.resolveX(cfg.fallDamagePreview.offsetX, (int)(W * scale));
        int y = cfg.fallDamagePreview.anchor.resolveY(cfg.fallDamagePreview.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col = dmg >= 10
                ? ColorUtils.withAlpha(0xFFFF4444, opacity)
                : dmg >= 4
                ? ColorUtils.withAlpha(0xFFFFAA00, opacity)
                : ColorUtils.withAlpha(0xFF44FF44, opacity);

        RenderUtils.drawText(gfx, String.format("↓ Урон: ~%.0f♥", dmg), 5, 3, col);

        gfx.pose().popMatrix();
    }
}
