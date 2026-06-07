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

/** Средний урон за удар (DPH) за текущую сессию. */
@Environment(EnvType.CLIENT)
public class DphLayer {

    private static final int W = 100;
    private static final int H = 13;

    private static float totalDmg = 0;
    private static int   totalHits = 0;

    public static void recordHit(float dmg) {
        totalDmg  += dmg;
        totalHits += 1;
    }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.dph.enabled || !cfg.hudVisible) return;
        if (totalHits == 0) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        float dph = totalDmg / totalHits;
        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.dph.anchor.resolveX(cfg.dph.offsetX, (int)(W * scale));
        int y = cfg.dph.anchor.resolveY(cfg.dph.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx, String.format("DPH: %.1f  (%dx)", dph, totalHits), 5, 3,
                ColorUtils.withAlpha(0xFFFF8844, opacity));
        gfx.pose().popMatrix();
    }
}
