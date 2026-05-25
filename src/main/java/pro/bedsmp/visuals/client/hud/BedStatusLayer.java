package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.DeltaTracker;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.KeyBindings;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Статус кроватей игрока (3 слота: цела/уничтожена). */
@Environment(EnvType.CLIENT)
public class BedStatusLayer {

    private static final int SLOT_SIZE = 18;
    private static final int SLOT_GAP = 4;
    private static final int SLOTS = 3;
    private static final int W = SLOTS * SLOT_SIZE + (SLOTS - 1) * SLOT_GAP + 8;
    private static final int H = SLOT_SIZE + 14;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.bedStatus.enabled || !cfg.hudVisible) return;

        float scale = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.bedStatus.anchor.resolveX(cfg.bedStatus.offsetX, (int)(W * scale));
        int y = cfg.bedStatus.anchor.resolveY(cfg.bedStatus.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        // Заголовок
        String title = "КРОВАТИ";
        int tw = RenderUtils.textWidth(title);
        RenderUtils.drawText(gfx, title,
                (W - tw) / 2, 2,
                ColorUtils.withAlpha(ThemeRegistry.accent(), opacity));

        // Слоты
        for (int i = 0; i < SLOTS; i++) {
            int sx = 4 + i * (SLOT_SIZE + SLOT_GAP);
            int sy = 12;
            boolean alive = cfg.bedStatus.bedAlive[i];

            int slotBg = alive
                    ? ColorUtils.withAlpha(ThemeRegistry.success(), opacity * 0.3f)
                    : ColorUtils.withAlpha(ThemeRegistry.danger(), opacity * 0.2f);
            int slotBorder = alive
                    ? ColorUtils.withAlpha(ThemeRegistry.success(), opacity)
                    : ColorUtils.withAlpha(ThemeRegistry.danger(), opacity);

            RenderUtils.drawOutlineRect(gfx, sx, sy, SLOT_SIZE, SLOT_SIZE,
                    slotBg, slotBorder, 1);

            // Символ кровати
            String symbol = alive ? "▣" : "✕";
            int sw = RenderUtils.textWidth(symbol);
            int sh = RenderUtils.fontHeight();
            RenderUtils.drawText(gfx, symbol,
                    sx + (SLOT_SIZE - sw) / 2,
                    sy + (SLOT_SIZE - sh) / 2,
                    slotBorder);
        }

        gfx.pose().popMatrix();
    }

    /** Переключить статус кровати по индексу (ручной режим). */
    public static void cycleSlot(int index) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null) return;
        if (index >= 0 && index < cfg.bedStatus.bedAlive.length) {
            cfg.bedStatus.bedAlive[index] = !cfg.bedStatus.bedAlive[index];
            pro.bedsmp.visuals.config.ConfigManager.save(cfg);
        }
    }
}
