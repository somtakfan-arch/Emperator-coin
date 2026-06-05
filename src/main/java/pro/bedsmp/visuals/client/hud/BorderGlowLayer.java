package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.util.ColorUtils;

/** Красное свечение по краям экрана, усиливающееся при низком HP. */
@Environment(EnvType.CLIENT)
public class BorderGlowLayer {

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.borderGlow.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        float hp     = mc.player.getHealth();
        float maxHp  = mc.player.getMaxHealth();
        if (maxHp <= 0) return;

        float frac     = hp / maxHp;
        float threshold = 0.5f;
        if (frac >= threshold) return;

        float intensity = (threshold - frac) / threshold;
        float alpha = intensity * cfg.globalOpacity * 0.7f;
        if (alpha < 0.02f) return;

        int col = ColorUtils.withAlpha(cfg.borderGlow.color, alpha);

        int sw = mc.getWindow().getGuiScaledWidth();
        int sh = mc.getWindow().getGuiScaledHeight();
        int bw = (int)(24 * intensity) + 4;

        gfx.fill(0, 0,        sw, bw,        col);
        gfx.fill(0, sh - bw,  sw, sh,        col);
        gfx.fill(0, bw,       bw, sh - bw,   col);
        gfx.fill(sw - bw, bw, sw, sh - bw,   col);
    }
}
