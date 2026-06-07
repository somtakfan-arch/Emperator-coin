package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.entity.LivingEntity;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.state.TargetTracker;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Оставшиеся i-фреймы (invincibility ticks) у текущей цели. */
@Environment(EnvType.CLIENT)
public class IFramesLayer {

    private static final int W = 100;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.iFrames.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        LivingEntity target = TargetTracker.get().getTarget();
        if (target == null || !target.isAlive()) return;

        int frames = target.invulnerableTime;
        if (frames <= 0) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.iFrames.anchor.resolveX(cfg.iFrames.offsetX, (int)(W * scale));
        int y = cfg.iFrames.anchor.resolveY(cfg.iFrames.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        float frac = frames / 10f; // max 10 ticks of invuln
        int col = frac > 0.5f
                ? ColorUtils.withAlpha(0xFFFF4444, opacity)
                : ColorUtils.withAlpha(0xFFFFAA00, opacity);
        RenderUtils.drawText(gfx, "I-FRAME: " + frames + "t", 5, 3, col);
        gfx.pose().popMatrix();
    }
}
