package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.util.ColorUtils;

/** Экранная красная подсветка при получении урона (альтернативная). */
@Environment(EnvType.CLIENT)
public class HurtTimeLayer {

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.hurtTimeDisplay.enabled) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        int hurtTime = mc.player.hurtTime;
        if (hurtTime <= 0) return;

        float frac  = hurtTime / 10f;
        float alpha = frac * frac * 0.4f * cfg.globalOpacity;
        if (alpha < 0.01f) return;

        int w = mc.getWindow().getGuiScaledWidth();
        int h = mc.getWindow().getGuiScaledHeight();
        int col = ColorUtils.withAlpha(0xFFFF2222, alpha);

        // Vignette-style: 4 edges
        int edge = (int)(h * 0.2f);
        gfx.fill(0, 0,       w, edge,     col);
        gfx.fill(0, h-edge,  w, h,        col);
        gfx.fill(0, edge,    edge,   h-edge, col);
        gfx.fill(w-edge, edge, w, h-edge,  col);
    }
}
