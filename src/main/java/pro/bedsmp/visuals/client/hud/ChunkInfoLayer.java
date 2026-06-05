package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.core.BlockPos;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Координаты чанка игрока. */
@Environment(EnvType.CLIENT)
public class ChunkInfoLayer {

    private static final int W = 110;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.chunkInfo.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        BlockPos pos    = mc.player.blockPosition();
        int chunkX = pos.getX() >> 4;
        int chunkZ = pos.getZ() >> 4;
        int section = pos.getY() >> 4;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.chunkInfo.anchor.resolveX(cfg.chunkInfo.offsetX, (int)(W * scale));
        int y = cfg.chunkInfo.anchor.resolveY(cfg.chunkInfo.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        RenderUtils.drawText(gfx,
                String.format("Чанк: %d,%d (Y:%d)", chunkX, chunkZ, section),
                5, 3, ColorUtils.withAlpha(0xFFCCCCCC, opacity));

        gfx.pose().popMatrix();
    }
}
