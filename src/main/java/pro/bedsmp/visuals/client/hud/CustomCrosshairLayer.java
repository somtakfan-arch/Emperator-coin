package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.util.ColorUtils;

/**
 * Пользовательский прицел: DOT, CROSS, CIRCLE, GAP.
 * Накладывается поверх стандартного — не заменяет его (ванильный можно отключить в настройках).
 */
@Environment(EnvType.CLIENT)
public class CustomCrosshairLayer {

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.customCrosshair.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;
        if (mc.options.getCameraType().isFirstPerson() == false) return;

        int sw = mc.getWindow().getGuiScaledWidth();
        int sh = mc.getWindow().getGuiScaledHeight();
        int cx = sw / 2;
        int cy = sh / 2;

        float opacity = cfg.globalOpacity;
        int color = ColorUtils.withAlpha(cfg.customCrosshair.color, opacity);

        int gap  = cfg.customCrosshair.gap;
        int size = cfg.customCrosshair.size;
        int t    = cfg.customCrosshair.thickness;

        // Если прицел динамический — расширяем при движении/стрельбе
        if (cfg.customCrosshair.dynamicExpand && !mc.player.onGround()) {
            gap += 3;
        }

        switch (cfg.customCrosshair.style) {
            case "DOT" -> gfx.fill(cx - 1, cy - 1, cx + 1, cy + 1, color);

            case "CIRCLE" -> {
                int r = gap + size / 2;
                for (int i = 0; i < 360; i += 10) {
                    double rad = Math.toRadians(i);
                    int px = (int)(cx + r * Math.cos(rad));
                    int py = (int)(cy + r * Math.sin(rad));
                    gfx.fill(px - 1, py - 1, px + 1, py + 1, color);
                }
            }

            case "GAP" -> {
                // Крестик с промежутком
                gfx.fill(cx - gap - size, cy - t / 2, cx - gap,        cy + t / 2 + 1, color);
                gfx.fill(cx + gap,        cy - t / 2, cx + gap + size, cy + t / 2 + 1, color);
                gfx.fill(cx - t / 2, cy - gap - size, cx + t / 2 + 1, cy - gap,        color);
                gfx.fill(cx - t / 2, cy + gap,        cx + t / 2 + 1, cy + gap + size, color);
            }

            default -> {
                // CROSS — обычный крест
                gfx.fill(cx - size, cy - t / 2, cx + size + 1, cy + t / 2 + 1, color);
                gfx.fill(cx - t / 2, cy - size, cx + t / 2 + 1, cy + size + 1, color);
            }
        }
    }
}
