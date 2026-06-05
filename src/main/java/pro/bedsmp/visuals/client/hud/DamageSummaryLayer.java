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

/** Нанесённый и полученный урон за сессию. */
@Environment(EnvType.CLIENT)
public class DamageSummaryLayer {

    private static final int W = 115;
    private static final int H = 13;

    private static float damageDealt    = 0f;
    private static float damageReceived = 0f;

    public static void recordDealt(float d)    { damageDealt    += Math.max(0f, d); }
    public static void recordReceived(float d) { damageReceived += Math.max(0f, d); }
    public static void reset() { damageDealt = 0; damageReceived = 0; }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.damageSummary.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.damageSummary.anchor.resolveX(cfg.damageSummary.offsetX, (int)(W * scale));
        int y = cfg.damageSummary.anchor.resolveY(cfg.damageSummary.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        String text = String.format("▲%.0f / ▼%.0f dmg", damageDealt, damageReceived);
        RenderUtils.drawText(gfx, text, 5, 3, ColorUtils.withAlpha(0xFFFFFFFF, opacity));

        gfx.pose().popMatrix();
    }
}
