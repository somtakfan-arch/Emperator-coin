package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.level.Level;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Измерение + конвертер координат нижний мир ↔ верхний мир. */
@Environment(EnvType.CLIENT)
public class DimensionLayer {

    private static final int W = 160;
    private static final int H = 22;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.dimensionDisplay.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || mc.player == null) return;

        var dim = mc.level.dimension();
        boolean isNether   = dim.equals(Level.NETHER);
        boolean isEnd      = dim.equals(Level.END);

        String dimName;
        int dimCol;
        if (isNether)    { dimName = "НИЖНИЙ МИР"; dimCol = 0xFFFF6644; }
        else if (isEnd)  { dimName = "КРАЙ";        dimCol = 0xFFAA88FF; }
        else             { dimName = "ВЕРХНИЙ МИР"; dimCol = 0xFF44DDAA; }

        int px = (int)mc.player.getX();
        int pz = (int)mc.player.getZ();

        String conv;
        if (isNether) {
            conv = String.format("→ OW: %d, %d", px * 8, pz * 8);
        } else if (!isEnd) {
            conv = String.format("→ NW: %d, %d", px / 8, pz / 8);
        } else {
            conv = "";
        }

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;
        int fh = RenderUtils.fontHeight() + 1;
        int h  = conv.isEmpty() ? fh + 4 : fh * 2 + 4;

        int x = cfg.dimensionDisplay.anchor.resolveX(cfg.dimensionDisplay.offsetX, (int)(W * scale));
        int y = cfg.dimensionDisplay.anchor.resolveY(cfg.dimensionDisplay.offsetY, (int)(h * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, h, 3, bg);
        RenderUtils.drawText(gfx, dimName, 5, 2, ColorUtils.withAlpha(dimCol, opacity));
        if (!conv.isEmpty()) {
            RenderUtils.drawText(gfx, conv, 5, 2 + fh, ColorUtils.withAlpha(0xFFAAAAAA, opacity));
        }
        gfx.pose().popMatrix();
    }
}
