package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.util.ColorUtils;

/** Вспышка краёв экрана при нанесении удара. */
@Environment(EnvType.CLIENT)
public class HitFlashLayer {

    private static long lastHitTick = -1;
    private static boolean lastHitCrit = false;

    public static void onHit(boolean isCrit) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level != null) {
            lastHitTick = mc.level.getGameTime();
            lastHitCrit = isCrit;
        }
    }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.hitFlash.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || lastHitTick < 0) return;

        long age = mc.level.getGameTime() - lastHitTick;
        int lifetime = 6;
        if (age >= lifetime) return;

        float alpha = (1f - (float)age / lifetime) * cfg.globalOpacity * 0.6f;
        int baseCol = lastHitCrit ? 0xFFFF8800 : 0xFFFF2222;
        int col = ColorUtils.withAlpha(baseCol, alpha);

        int sw = mc.getWindow().getGuiScaledWidth();
        int sh = mc.getWindow().getGuiScaledHeight();
        int bw = 8; // ширина полосы по краям

        // 4 края экрана
        gfx.fill(0, 0,      sw, bw,       col);
        gfx.fill(0, sh - bw, sw, sh,       col);
        gfx.fill(0, bw,      bw, sh - bw,  col);
        gfx.fill(sw - bw, bw, sw, sh - bw, col);
    }
}
