package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.effect.MobEffects;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Уровень зелья прыжка и остаток времени. */
@Environment(EnvType.CLIENT)
public class JumpBoostLayer {

    private static final int W = 110;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.jumpBoostDisplay.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        var eff = mc.player.getEffect(MobEffects.JUMP_BOOST);
        if (eff == null) return;

        int lvl = eff.getAmplifier() + 1;
        int secs = eff.getDuration() / 20;
        int min  = secs / 60;
        int sec  = secs % 60;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.jumpBoostDisplay.anchor.resolveX(cfg.jumpBoostDisplay.offsetX, (int)(W * scale));
        int y = cfg.jumpBoostDisplay.anchor.resolveY(cfg.jumpBoostDisplay.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx, String.format("↑ JMP %d  %d:%02d", lvl, min, sec), 5, 3,
                ColorUtils.withAlpha(0xFF88FFAA, opacity));
        gfx.pose().popMatrix();
    }
}
