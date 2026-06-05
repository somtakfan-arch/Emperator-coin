package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.multiplayer.ClientLevel;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Количество игроков рядом в заданном радиусе. */
@Environment(EnvType.CLIENT)
public class NearbyPlayersLayer {

    private static final int W = 100;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.nearbyPlayers.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;

        ClientLevel level = mc.level;
        int radius = cfg.nearbyPlayers.radius;
        long count = level.players().stream()
                .filter(p -> p != mc.player && mc.player.distanceTo(p) <= radius)
                .count();

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.nearbyPlayers.anchor.resolveX(cfg.nearbyPlayers.offsetX, (int)(W * scale));
        int y = cfg.nearbyPlayers.anchor.resolveY(cfg.nearbyPlayers.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col = count > 0
                ? ColorUtils.withAlpha(0xFFFF8888, opacity)
                : ColorUtils.withAlpha(0xFF88FF88, opacity);

        RenderUtils.drawText(gfx, String.format("👥 Рядом: %d", count), 5, 3, col);

        gfx.pose().popMatrix();
    }
}
