package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.DeltaTracker;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.state.TargetTracker;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Счётчик лопнувших тотемов у текущей цели. */
@Environment(EnvType.CLIENT)
public class TotemCounterLayer {

    private static final int W = 90;
    private static final int H = 16;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.totemCounter.enabled || !cfg.hudVisible) return;
        if (!TargetTracker.get().hasTarget()) return;

        int pops = TargetTracker.get().getTotemPops();
        float scale = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.totemCounter.anchor.resolveX(cfg.totemCounter.offsetX, (int)(W * scale));
        int y = cfg.totemCounter.anchor.resolveY(cfg.totemCounter.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int color = pops > 0
                ? ColorUtils.withAlpha(0xFFFFAA00, opacity)
                : ColorUtils.withAlpha(ThemeRegistry.text(), opacity);
        String text = "☯ Тотемы: " + pops;
        if (cfg.totemCounter.showSessionTotal) {
            text += " (сессия: " + cfg.sessionStats.totemsPopped + ")";
        }
        int tw = RenderUtils.textWidth(text);
        // Подстраховка: если текст не помещается
        if (tw > W - 4) {
            text = "☯ " + pops;
            tw = RenderUtils.textWidth(text);
        }
        RenderUtils.drawText(gfx, text, (W - tw) / 2, (H - RenderUtils.fontHeight()) / 2, color);

        gfx.pose().popMatrix();
    }
}
