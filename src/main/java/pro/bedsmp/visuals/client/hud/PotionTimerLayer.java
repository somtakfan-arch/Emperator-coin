package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.effect.MobEffectInstance;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Список активных эффектов зелий с таймерами обратного отсчёта. */
@Environment(EnvType.CLIENT)
public class PotionTimerLayer {

    private static final int W  = 120;
    private static final int LH = 11; // высота строки

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.potionTimers.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        List<MobEffectInstance> effects = new ArrayList<>(mc.player.getActiveEffects());
        if (effects.isEmpty()) return;

        effects.sort(Comparator.comparingInt(MobEffectInstance::getDuration).reversed());

        int maxShow = Math.min(5, effects.size());
        int H = maxShow * LH + 4;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.potionTimers.anchor.resolveX(cfg.potionTimers.offsetX, (int)(W * scale));
        int y = cfg.potionTimers.anchor.resolveY(cfg.potionTimers.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int accent = ColorUtils.withAlpha(ThemeRegistry.accent(), opacity);
        RenderUtils.fillRect(gfx, 0, 0, 2, H, accent);

        for (int i = 0; i < maxShow; i++) {
            MobEffectInstance eff = effects.get(i);
            int durationSec = eff.getDuration() / 20;
            int minutes     = durationSec / 60;
            int seconds     = durationSec % 60;

            // Имя эффекта через ключ локализации
            String rawKey = eff.getEffect().value().getDescriptionId();
            String name   = rawKey.contains(".")
                    ? rawKey.substring(rawKey.lastIndexOf('.') + 1)
                    : rawKey;
            // Капитализируем первую букву
            if (!name.isEmpty()) name = Character.toUpperCase(name.charAt(0)) + name.substring(1);

            int amplifier = eff.getAmplifier();
            String lvl = amplifier > 0 ? " " + (amplifier + 1) : "";

            String line = eff.getDuration() >= 20 * 3600
                    ? name + lvl + " ∞"
                    : String.format("%s%s %d:%02d", name, lvl, minutes, seconds);

            // Позитивные эффекты — зелёные, негативные — красные
            boolean positive = !eff.getEffect().value().isBeneficial() == false;
            int col = positive
                    ? ColorUtils.withAlpha(0xFF88FF88, opacity)
                    : ColorUtils.withAlpha(0xFFFF8888, opacity);

            RenderUtils.drawText(gfx, line, 5, 3 + i * LH, col);
        }

        gfx.pose().popMatrix();
    }
}
