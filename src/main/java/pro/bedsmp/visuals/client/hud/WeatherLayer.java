package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.multiplayer.ClientLevel;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Текущая погода: ясно / дождь / гроза. */
@Environment(EnvType.CLIENT)
public class WeatherLayer {

    private static final int W = 90;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.weatherDisplay.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        ClientLevel level = mc.level;
        if (level == null || mc.player == null) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        String label;
        int col;
        if (level.isThundering()) {
            label = "⚡ ГРОЗА";
            col   = ColorUtils.withAlpha(0xFFFFFF44, opacity);
        } else if (level.isRaining()) {
            label = "☁ ДОЖДЬ";
            col   = ColorUtils.withAlpha(0xFF88AAFF, opacity);
        } else {
            label = "☀ ЯСНО";
            col   = ColorUtils.withAlpha(0xFFFFDD44, opacity);
        }

        int x = cfg.weatherDisplay.anchor.resolveX(cfg.weatherDisplay.offsetX, (int)(W * scale));
        int y = cfg.weatherDisplay.anchor.resolveY(cfg.weatherDisplay.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx, label, 5, 3, col);
        gfx.pose().popMatrix();
    }
}
