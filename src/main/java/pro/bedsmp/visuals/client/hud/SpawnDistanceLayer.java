package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Расстояние до мирового спауна (или возрождения). */
@Environment(EnvType.CLIENT)
public class SpawnDistanceLayer {

    private static final int W = 130;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.spawnDistance.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || mc.player == null) return;

        // Distance from world origin (0, 0) — approximates spawn for most servers
        double dx = mc.player.getX();
        double dz = mc.player.getZ();
        double dist = Math.sqrt(dx * dx + dz * dz);

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.spawnDistance.anchor.resolveX(cfg.spawnDistance.offsetX, (int)(W * scale));
        int y = cfg.spawnDistance.anchor.resolveY(cfg.spawnDistance.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx, String.format("⌂ СПАУН: %.0fm", dist), 5, 3,
                ColorUtils.withAlpha(0xFF88DDAA, opacity));
        gfx.pose().popMatrix();
    }
}
