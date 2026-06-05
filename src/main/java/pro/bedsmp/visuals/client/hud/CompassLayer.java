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

/** Компас со сторонами света. */
@Environment(EnvType.CLIENT)
public class CompassLayer {

    private static final int W  = 130;
    private static final int H  = 13;
    private static final String[] DIRS = { "С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ" };

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.compassDisplay.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        // yaw: 0=Юг, -90=Восток, 90=Запад, ±180=Север  →  нормируем в [0,360)
        float yaw     = ((mc.player.getYRot() % 360) + 360) % 360;
        // Индекс ближайшего направления из 8 (каждые 45°)
        int activeIdx = (int)((yaw + 22.5f) / 45f) % 8;
        // Смещение: С=0°, но MC yaw: 0°=Ю → idx 4 при yaw=0
        // Перемапливаем: С=idx(0,45…), ЮВ=idx(135…)
        // Minecraft 0°=Юг, 90°=Запад, -90°=Восток, 180°=Север
        // Конвертация: compass_idx = ((int)((yaw + 202.5) / 45)) % 8
        int idx = ((int)((yaw + 202.5f) / 45f)) % 8;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.compassDisplay.anchor.resolveX(cfg.compassDisplay.offsetX, (int)(W * scale));
        int y = cfg.compassDisplay.anchor.resolveY(cfg.compassDisplay.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        // Отображаем 7 направлений в ряд, текущее — выделено ярче
        int total = DIRS.length;
        int step = W / total;
        for (int i = 0; i < total; i++) {
            int di = (idx - 3 + i + total * 2) % total; // centred on current
            boolean current = (i == 3);
            int col = current
                    ? ColorUtils.withAlpha(0xFFFFDD00, opacity)
                    : ColorUtils.withAlpha(0xFF888888, opacity);
            int px = 2 + i * step + (step - RenderUtils.textWidth(DIRS[di])) / 2;
            RenderUtils.drawText(gfx, DIRS[di], px, 3, col);
        }
        // Центральная метка
        RenderUtils.drawText(gfx, "▼", W / 2 - 2, 1, ColorUtils.withAlpha(0xFFFFDD00, opacity));

        gfx.pose().popMatrix();
    }
}
