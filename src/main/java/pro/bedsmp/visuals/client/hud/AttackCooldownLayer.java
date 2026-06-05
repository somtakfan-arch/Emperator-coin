package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Полоска перезарядки атаки под прицелом. */
@Environment(EnvType.CLIENT)
public class AttackCooldownLayer {

    private static final int W = 80;
    private static final int H = 4;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.attackCooldown.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        float cooldown = mc.player.getAttackStrengthScale(0f);
        if (cooldown >= 0.999f) return; // полностью заряжено — не показываем

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.attackCooldown.anchor.resolveX(cfg.attackCooldown.offsetX, (int)(W * scale));
        int y = cfg.attackCooldown.anchor.resolveY(cfg.attackCooldown.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg  = ColorUtils.withAlpha(0xFF222222, opacity * 0.9f);
        int bar = cooldown < 0.5f
                ? ColorUtils.withAlpha(0xFFFF4444, opacity)
                : ColorUtils.withAlpha(0xFF44FF44, opacity);

        RenderUtils.drawProgressBar(gfx, 0, 0, W, H, cooldown, bg, bar);

        gfx.pose().popMatrix();
    }
}
