package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.DeltaTracker;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.world.level.biome.Biome;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Координаты XYZ, направление и биом. */
@Environment(EnvType.CLIENT)
public class CoordinatesLayer {

    private static final int W = 140;
    private static final int H = 26;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.coordinates.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;

        float scale = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.coordinates.anchor.resolveX(cfg.coordinates.offsetX, (int)(W * scale));
        int y = cfg.coordinates.anchor.resolveY(cfg.coordinates.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int text = ColorUtils.withAlpha(ThemeRegistry.text(), opacity);
        int accent = ColorUtils.withAlpha(ThemeRegistry.accent(), opacity);

        double px = mc.player.getX();
        double py = mc.player.getY();
        double pz = mc.player.getZ();

        String coordLine = String.format("X%.0f Y%.0f Z%.0f", px, py, pz);
        RenderUtils.drawText(gfx, coordLine, 4, 2, text);

        // Направление
        if (cfg.coordinates.showDirection) {
            String dir = getDirection(mc.player.getYRot());
            RenderUtils.drawText(gfx, dir, 4, 2 + RenderUtils.fontHeight() + 1, accent);
        }

        // Биом
        if (cfg.coordinates.showBiome) {
            BlockPos pos = mc.player.blockPosition();
            Holder<Biome> biome = mc.level.getBiome(pos);
            String biomeName = biome.unwrapKey()
                    .map(k -> k.identifier().getPath())
                    .orElse("?");
            // Обрезать длинные названия
            if (biomeName.length() > 18) biomeName = biomeName.substring(0, 15) + "...";
            int bw = RenderUtils.textWidth(biomeName);
            RenderUtils.drawText(gfx, biomeName, W - bw - 4, 2, accent);
        }

        gfx.pose().popMatrix();
    }

    private static String getDirection(float yaw) {
        float y = ((yaw % 360) + 360) % 360;
        if (y < 22.5 || y >= 337.5) return "С ↑";
        else if (y < 67.5) return "СВ ↗";
        else if (y < 112.5) return "В →";
        else if (y < 157.5) return "ЮВ ↘";
        else if (y < 202.5) return "Ю ↓";
        else if (y < 247.5) return "ЮЗ ↙";
        else if (y < 292.5) return "З ←";
        else return "СЗ ↖";
    }
}
