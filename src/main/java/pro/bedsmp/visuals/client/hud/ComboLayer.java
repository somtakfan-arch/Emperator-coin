package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.DeltaTracker;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.state.CombatState;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Счётчик серии попаданий (комбо). */
@Environment(EnvType.CLIENT)
public class ComboLayer {

    private static final int W = 80;
    private static final int H = 14;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.comboCounter.enabled || !cfg.hudVisible) return;

        CombatState combat = CombatState.get();
        int combo = combat.getCombo();
        if (combo < 2) return;  // Не показывать при 0 или 1

        float scale = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.comboCounter.anchor.resolveX(cfg.comboCounter.offsetX, (int)(W * scale));
        int y = cfg.comboCounter.anchor.resolveY(cfg.comboCounter.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        // Цвет зависит от длины комбо
        int comboColor;
        if (combo >= 10) comboColor = ColorUtils.withAlpha(0xFFFF4444, opacity);
        else if (combo >= 5) comboColor = ColorUtils.withAlpha(0xFFFFAA00, opacity);
        else comboColor = ColorUtils.withAlpha(ThemeRegistry.accent(), opacity);

        String text = combo + "x КОМБО";
        if (cfg.comboCounter.showMaxCombo) {
            text += " (макс " + combat.getMaxComboThisFight() + ")";
        }
        int tw = RenderUtils.textWidth(text);
        if (tw > W - 4) text = combo + "x";
        tw = RenderUtils.textWidth(text);
        RenderUtils.drawText(gfx, text, (W - tw) / 2, (H - RenderUtils.fontHeight()) / 2, comboColor);

        gfx.pose().popMatrix();
    }
}
