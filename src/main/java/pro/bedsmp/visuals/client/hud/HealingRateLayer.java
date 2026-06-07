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

/** Скорость естественной регенерации HP (hp/сек). */
@Environment(EnvType.CLIENT)
public class HealingRateLayer {

    private static final int W = 120;
    private static final int H = 13;

    private static float prevHp = -1;
    private static long  prevTick = -1;
    private static float healRate = 0;

    public static void tick(Minecraft mc) {
        if (mc.player == null || mc.level == null) return;
        float hp   = mc.player.getHealth();
        long tick  = mc.level.getGameTime();

        if (prevHp >= 0 && tick > prevTick) {
            float delta = hp - prevHp;
            if (delta > 0) {
                float rate = delta / ((tick - prevTick) / 20f);
                healRate = healRate * 0.7f + rate * 0.3f; // EMA
            } else {
                healRate = healRate * 0.9f;
            }
        }
        prevHp   = hp;
        prevTick = tick;
    }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.healingRateDisplay.enabled || !cfg.hudVisible) return;
        if (healRate < 0.01f) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.healingRateDisplay.anchor.resolveX(cfg.healingRateDisplay.offsetX, (int)(W * scale));
        int y = cfg.healingRateDisplay.anchor.resolveY(cfg.healingRateDisplay.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx, String.format("+ %.2f ♥/с", healRate), 5, 3,
                ColorUtils.withAlpha(0xFFFF6688, opacity));
        gfx.pose().popMatrix();
    }
}
