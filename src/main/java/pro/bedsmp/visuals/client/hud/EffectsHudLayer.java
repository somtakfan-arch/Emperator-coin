package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.DeltaTracker;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.LivingEntity;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.state.TargetTracker;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

import java.util.Collection;

/** Компактная панель активных эффектов цели (видимых клиенту). */
@Environment(EnvType.CLIENT)
public class EffectsHudLayer {

    private static final int ICON_SIZE = 14;
    private static final int GAP = 2;
    private static final int MAX_EFFECTS = 6;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.effectsHud.enabled || !cfg.hudVisible) return;

        LivingEntity target = cfg.effectsHud.targetEffects ? TargetTracker.get().getTarget() : null;
        if (target == null) return;

        Collection<MobEffectInstance> effects = target.getActiveEffects();
        if (effects.isEmpty()) return;

        float scale = cfg.globalScale;
        float opacity = cfg.globalOpacity;
        int count = Math.min(effects.size(), MAX_EFFECTS);
        int totalW = count * (ICON_SIZE + GAP) - GAP + 4;
        int totalH = ICON_SIZE + 4;

        int x = cfg.effectsHud.anchor.resolveX(cfg.effectsHud.offsetX, (int)(totalW * scale));
        int y = cfg.effectsHud.anchor.resolveY(cfg.effectsHud.offsetY, (int)(totalH * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, totalW, totalH, 3, bg);

        int slot = 0;
        for (MobEffectInstance effect : effects) {
            if (slot >= MAX_EFFECTS) break;
            int sx = 2 + slot * (ICON_SIZE + GAP);
            int sy = 2;

            // Цвет по типу эффекта
            boolean beneficial = effect.getEffect().value().isBeneficial();
            int borderColor = beneficial
                    ? ColorUtils.withAlpha(ThemeRegistry.success(), opacity)
                    : ColorUtils.withAlpha(ThemeRegistry.danger(), opacity);

            RenderUtils.drawOutlineRect(gfx, sx, sy, ICON_SIZE, ICON_SIZE,
                    0, borderColor, 1);

            // Первая буква названия эффекта
            String name = effect.getEffect().value().getDescriptionId();
            String letter = name.length() > 0
                    ? String.valueOf(Character.toUpperCase(name.charAt(name.lastIndexOf('.') + 1)))
                    : "?";
            int lw = RenderUtils.textWidth(letter);
            RenderUtils.drawText(gfx, letter,
                    sx + (ICON_SIZE - lw) / 2,
                    sy + (ICON_SIZE - RenderUtils.fontHeight()) / 2,
                    borderColor);

            slot++;
        }

        gfx.pose().popMatrix();
    }
}
