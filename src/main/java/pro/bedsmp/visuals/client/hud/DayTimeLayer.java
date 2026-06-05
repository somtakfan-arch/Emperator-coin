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

/** Время суток и фаза луны. */
@Environment(EnvType.CLIENT)
public class DayTimeLayer {

    private static final int W = 100;
    private static final int H = 13;
    private static final String[] MOON = { "🌕", "🌖", "🌗", "🌘", "🌑", "🌒", "🌓", "🌔" };

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.dayTime.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;

        long daytime = mc.level.getDayTime() % 24000L;
        // 0 = рассвет (6:00), 6000 = полдень (12:00)
        int  hours   = (int)((daytime / 1000 + 6) % 24);
        int  minutes = (int)((daytime % 1000) * 60 / 1000);
        int  phase   = (int)((mc.level.getDayTime() / 24000L) % 8);
        String moon  = MOON[phase];

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.dayTime.anchor.resolveX(cfg.dayTime.offsetX, (int)(W * scale));
        int y = cfg.dayTime.anchor.resolveY(cfg.dayTime.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        boolean isDay = daytime < 12000;
        int col = isDay
                ? ColorUtils.withAlpha(0xFFFFDD44, opacity)
                : ColorUtils.withAlpha(0xFFAACCFF, opacity);

        RenderUtils.drawText(gfx,
                String.format("%s %02d:%02d", isDay ? "☀" : moon, hours, minutes),
                5, 3, col);

        gfx.pose().popMatrix();
    }
}
