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

/** Текущая серия убийств. */
@Environment(EnvType.CLIENT)
public class KillStreakLayer {

    private static final int W = 90;
    private static final int H = 13;

    private static int streak = 0;

    public static void onKill()  { streak++; }
    public static void onDeath() { streak = 0; }
    public static int getStreak() { return streak; }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.killStreak.enabled || !cfg.hudVisible) return;
        if (streak <= 0) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.killStreak.anchor.resolveX(cfg.killStreak.offsetX, (int)(W * scale));
        int y = cfg.killStreak.anchor.resolveY(cfg.killStreak.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col;
        if (streak >= 10)     col = ColorUtils.withAlpha(0xFFFF4444, opacity);
        else if (streak >= 5) col = ColorUtils.withAlpha(0xFFFF8800, opacity);
        else if (streak >= 3) col = ColorUtils.withAlpha(0xFFFFDD00, opacity);
        else                  col = ColorUtils.withAlpha(0xFF44FF44, opacity);

        RenderUtils.drawText(gfx, "🔥 Серия: " + streak, 5, 3, col);

        gfx.pose().popMatrix();
    }
}
