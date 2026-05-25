package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.DeltaTracker;
import net.minecraft.world.entity.LivingEntity;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.state.TargetTracker;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Пульсирующая рамка экрана при низком HP цели или себя. */
@Environment(EnvType.CLIENT)
public class LowHpVignetteLayer {

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.lowHpVignette.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return;

        int sw = mc.getWindow().getGuiScaledWidth();
        int sh = mc.getWindow().getGuiScaledHeight();
        float timeSeconds = mc.level.getGameTime() / 20f;

        // Вигнет для цели
        LivingEntity target = TargetTracker.get().getTarget();
        if (target != null) {
            float fraction = target.getHealth() / target.getMaxHealth();
            if (fraction <= cfg.lowHpVignette.targetHpThreshold) {
                float pulse = ColorUtils.pulse(timeSeconds, cfg.lowHpVignette.pulseSpeed);
                float alpha = pulse * cfg.lowHpVignette.pulseStrength * cfg.globalOpacity;
                int color = ColorUtils.withAlpha(cfg.lowHpVignette.targetVignetteColor, alpha);
                drawVignette(gfx, sw, sh, color);
            }
        }

        // Вигнет для себя
        if (cfg.lowHpVignette.selfVignette && mc.player != null) {
            float fraction = mc.player.getHealth() / mc.player.getMaxHealth();
            if (fraction <= cfg.lowHpVignette.selfHpThreshold) {
                float pulse = ColorUtils.pulse(timeSeconds + 0.5f, cfg.lowHpVignette.pulseSpeed * 1.5f);
                float alpha = pulse * cfg.lowHpVignette.pulseStrength * cfg.globalOpacity;
                int color = ColorUtils.withAlpha(cfg.lowHpVignette.selfVignetteColor, alpha);
                drawVignette(gfx, sw, sh, color);
            }
        }
    }

    private static void drawVignette(GuiGraphics gfx, int sw, int sh, int color) {
        int thickness = sw / 12;
        // Четыре края
        RenderUtils.fillRect(gfx, 0, 0, sw, thickness, color);
        RenderUtils.fillRect(gfx, 0, sh - thickness, sw, thickness, color);
        RenderUtils.fillRect(gfx, 0, thickness, thickness, sh - thickness * 2, color);
        RenderUtils.fillRect(gfx, sw - thickness, thickness, thickness, sh - thickness * 2, color);
    }
}
