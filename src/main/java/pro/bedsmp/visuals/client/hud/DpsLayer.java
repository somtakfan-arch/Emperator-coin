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

import java.util.ArrayDeque;

/** DPS — урон в секунду за скользящее окно 5 секунд. */
@Environment(EnvType.CLIENT)
public class DpsLayer {

    private static final int W       = 90;
    private static final int H       = 13;
    private static final int WINDOW  = 100; // 5 секунд в тиках

    private record Hit(float dmg, long tick) {}
    private static final ArrayDeque<Hit> HITS = new ArrayDeque<>();

    public static void recordHit(float dmg) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return;
        HITS.addLast(new Hit(dmg, mc.level.getGameTime()));
    }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.dps.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || mc.player == null) return;

        long now = mc.level.getGameTime();
        while (!HITS.isEmpty() && now - HITS.peekFirst().tick > WINDOW) HITS.pollFirst();

        float total = 0;
        for (Hit h : HITS) total += h.dmg;
        float dps   = total / (WINDOW / 20f);

        if (dps < 0.01f) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.dps.anchor.resolveX(cfg.dps.offsetX, (int)(W * scale));
        int y = cfg.dps.anchor.resolveY(cfg.dps.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx, String.format("DPS: %.1f", dps), 5, 3,
                ColorUtils.withAlpha(0xFFFF6644, opacity));
        gfx.pose().popMatrix();
    }
}
