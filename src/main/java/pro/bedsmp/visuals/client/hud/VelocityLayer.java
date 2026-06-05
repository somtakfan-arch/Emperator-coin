package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.phys.Vec3;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Компоненты скорости (блок/тик → блок/сек). */
@Environment(EnvType.CLIENT)
public class VelocityLayer {

    private static final int W = 120;
    private static final int H = 26;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.velocityDisplay.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        Vec3 vel = mc.player.getDeltaMovement();
        double vx = vel.x * 20;
        double vy = vel.y * 20;
        double vz = vel.z * 20;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.velocityDisplay.anchor.resolveX(cfg.velocityDisplay.offsetX, (int)(W * scale));
        int y = cfg.velocityDisplay.anchor.resolveY(cfg.velocityDisplay.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col = ColorUtils.withAlpha(0xFFCCCCCC, opacity);
        RenderUtils.drawText(gfx, String.format("X:%.2f Z:%.2f", vx, vz), 5, 3, col);
        RenderUtils.drawText(gfx, String.format("Y:%.2f", vy), 5, 3 + RenderUtils.fontHeight() + 2,
                vy < -0.5 ? ColorUtils.withAlpha(0xFFFF8888, opacity) : col);

        gfx.pose().popMatrix();
    }
}
