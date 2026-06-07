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
import java.util.Deque;

/** Мини-лог последних 5 ударов: урон, крит, время. */
@Environment(EnvType.CLIENT)
public class CombatLogLayer {

    private static final int W  = 120;
    private static final int MAX = 5;

    private record Entry(float dmg, boolean crit, long tick) {}
    private static final Deque<Entry> LOG = new ArrayDeque<>();

    public static void addHit(float dmg, boolean crit) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return;
        if (LOG.size() >= MAX) LOG.pollFirst();
        LOG.addLast(new Entry(dmg, crit, mc.level.getGameTime()));
    }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.combatLog.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || mc.player == null || LOG.isEmpty()) return;

        int fh   = RenderUtils.fontHeight() + 1;
        int h    = fh * LOG.size() + 4;
        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.combatLog.anchor.resolveX(cfg.combatLog.offsetX, (int)(W * scale));
        int y = cfg.combatLog.anchor.resolveY(cfg.combatLog.offsetY, (int)(h  * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, h, 3, bg);

        long now = mc.level.getGameTime();
        int row  = 0;
        for (Entry e : LOG) {
            float age  = (now - e.tick) / 20f; // seconds
            float fade = Math.max(0f, 1f - age / 15f);
            int col = e.crit
                    ? ColorUtils.withAlpha(0xFFFFAA00, opacity * fade)
                    : ColorUtils.withAlpha(0xFFDDDDDD, opacity * fade);
            String s = e.crit
                    ? String.format("✦ %.1f  (%.0fs)", e.dmg, age)
                    : String.format("  %.1f  (%.0fs)", e.dmg, age);
            RenderUtils.drawText(gfx, s, 4, 2 + row * fh, col);
            row++;
        }
        gfx.pose().popMatrix();
    }
}
