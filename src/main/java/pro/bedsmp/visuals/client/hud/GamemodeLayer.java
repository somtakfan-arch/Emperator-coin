package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.level.GameType;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Текущий режим игры (выживание / творчество / приключение / наблюдатель). */
@Environment(EnvType.CLIENT)
public class GamemodeLayer {

    private static final int W = 90;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.gamemodeDisplay.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.gameMode == null) return;

        GameType gm = mc.gameMode.getPlayerMode();
        if (gm == GameType.SURVIVAL) return; // Выживание — норма, не показываем

        String label;
        int col;
        switch (gm) {
            case CREATIVE   -> { label = "ТВОРЧЕСТВО"; col = 0xFF55FF55; }
            case ADVENTURE  -> { label = "ПРИКЛЮЧЕНИЕ"; col = 0xFFFFAA00; }
            case SPECTATOR  -> { label = "НАБЛЮДАТЕЛЬ"; col = 0xFF55FFFF; }
            default         -> { label = gm.getName().toUpperCase(); col = 0xFFCCCCCC; }
        }

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.gamemodeDisplay.anchor.resolveX(cfg.gamemodeDisplay.offsetX, (int)(W * scale));
        int y = cfg.gamemodeDisplay.anchor.resolveY(cfg.gamemodeDisplay.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx, label, 5, 3, ColorUtils.withAlpha(col, opacity));
        gfx.pose().popMatrix();
    }
}
