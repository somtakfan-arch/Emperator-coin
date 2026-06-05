package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.level.LightLayer;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Уровень освещённости (блочный свет). Красный — возможен спавн мобов. */
@Environment(EnvType.CLIENT)
public class LightLevelLayer {

    private static final int W = 90;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.lightLevel.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;

        int blockLight = mc.level.getBrightness(LightLayer.BLOCK, mc.player.blockPosition());
        int skyLight   = mc.level.getBrightness(LightLayer.SKY,   mc.player.blockPosition());

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.lightLevel.anchor.resolveX(cfg.lightLevel.offsetX, (int)(W * scale));
        int y = cfg.lightLevel.anchor.resolveY(cfg.lightLevel.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col = blockLight < 8
                ? ColorUtils.withAlpha(0xFFFF4444, opacity)  // спавн мобов
                : blockLight < 12
                ? ColorUtils.withAlpha(0xFFFFAA00, opacity)
                : ColorUtils.withAlpha(0xFF44FF44, opacity);

        RenderUtils.drawText(gfx, String.format("☀ Св: %d  (%d)", blockLight, skyLight),
                5, 3, col);

        gfx.pose().popMatrix();
    }
}
