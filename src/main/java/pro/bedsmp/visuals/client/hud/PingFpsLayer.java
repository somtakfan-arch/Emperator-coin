package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.client.DeltaTracker;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Пинг и FPS в углу. */
@Environment(EnvType.CLIENT)
public class PingFpsLayer {

    private static final int W = 70;
    private static final int H = 24;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.pingFps.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();

        float scale = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.pingFps.anchor.resolveX(cfg.pingFps.offsetX, (int)(W * scale));
        int y = cfg.pingFps.anchor.resolveY(cfg.pingFps.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        // FPS
        int fps = mc.getFps();
        String fpsText = fps + " FPS";
        int fpsColor = fps >= 60 ? cfg.pingFps.pingGoodColor : fps >= 30 ? cfg.pingFps.pingOkColor : cfg.pingFps.pingBadColor;
        RenderUtils.drawText(gfx, fpsText, 4, 2, ColorUtils.withAlpha(fpsColor, opacity));

        // Пинг
        int ping = 0;
        if (mc.player != null && mc.getConnection() != null) {
            PlayerInfo info = mc.getConnection().getPlayerInfo(mc.player.getUUID());
            if (info != null) ping = info.getLatency();
        }
        String pingText = ping + " мс";
        int pingColor;
        if (ping <= cfg.pingFps.pingGoodThreshold) pingColor = cfg.pingFps.pingGoodColor;
        else if (ping <= cfg.pingFps.pingOkThreshold) pingColor = cfg.pingFps.pingOkColor;
        else pingColor = cfg.pingFps.pingBadColor;

        RenderUtils.drawText(gfx, pingText, 4, 2 + RenderUtils.fontHeight() + 2,
                ColorUtils.withAlpha(pingColor, opacity));

        gfx.pose().popMatrix();
    }
}
