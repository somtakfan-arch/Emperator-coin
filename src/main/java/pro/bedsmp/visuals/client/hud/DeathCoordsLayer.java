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

/** Координаты последней смерти игрока. */
@Environment(EnvType.CLIENT)
public class DeathCoordsLayer {

    private static final int W = 150;
    private static final int H = 13;

    private static int deathX = Integer.MIN_VALUE;
    private static int deathY = Integer.MIN_VALUE;
    private static int deathZ = Integer.MIN_VALUE;

    public static void onDeath(int x, int y, int z) {
        deathX = x; deathY = y; deathZ = z;
    }

    public static boolean hasDeath() { return deathX != Integer.MIN_VALUE; }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.deathCoords.enabled || !cfg.hudVisible) return;
        if (!hasDeath()) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.deathCoords.anchor.resolveX(cfg.deathCoords.offsetX, (int)(W * scale));
        int y = cfg.deathCoords.anchor.resolveY(cfg.deathCoords.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx,
                String.format("☠ %d, %d, %d", deathX, deathY, deathZ),
                5, 3, ColorUtils.withAlpha(0xFFFF4444, opacity));
        gfx.pose().popMatrix();
    }
}
