package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.DeltaTracker;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.state.KillFeedState;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.MathUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

import java.util.List;

/** Лента убийств в углу экрана. */
@Environment(EnvType.CLIENT)
public class KillFeedLayer {

    private static final int LINE_H = 12;
    private static final int ENTRY_W = 160;
    private static final int PADDING_X = 4;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.killFeed.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return;

        long currentTick = mc.level.getGameTime();
        List<KillFeedState.Entry> entries = KillFeedState.get().getEntries();
        if (entries.isEmpty()) return;

        float scale = cfg.globalScale;
        float opacity = cfg.globalOpacity;
        int totalH = entries.size() * LINE_H;

        int x = cfg.killFeed.anchor.resolveX(cfg.killFeed.offsetX, (int)(ENTRY_W * scale));
        int y = cfg.killFeed.anchor.resolveY(cfg.killFeed.offsetY, (int)(totalH * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int rowY = 0;
        for (KillFeedState.Entry entry : entries) {
            long age = currentTick - entry.addedTick;
            float lifeProgress = MathUtils.progress((int) age, cfg.killFeed.entryLifeTicks);

            // Fade in
            float alpha;
            if (age < cfg.killFeed.fadeInTicks) {
                alpha = MathUtils.easeOut(MathUtils.progress((int) age, cfg.killFeed.fadeInTicks));
            } else if (lifeProgress > 0.8f) {
                // Fade out в последние 20%
                float fadeProgress = (lifeProgress - 0.8f) / 0.2f;
                alpha = 1f - fadeProgress;
            } else {
                alpha = 1f;
            }

            alpha *= opacity;

            int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), alpha * 0.7f);
            RenderUtils.fillRoundedRect(gfx, 0, rowY, ENTRY_W, LINE_H - 1, 2, bg);

            // Убийца (жёлтый) → (стрелка) → Жертва (красный)
            String text = entry.killer + " ⚔ " + entry.victim;
            Minecraft localMc = Minecraft.getInstance();
            boolean isOurKill = localMc.player != null &&
                    entry.killer.equals(localMc.player.getName().getString());
            boolean isOurDeath = localMc.player != null &&
                    entry.victim.equals(localMc.player.getName().getString());

            int killerColor = ColorUtils.withAlpha(
                    isOurKill ? ThemeRegistry.accent() : ThemeRegistry.text(), alpha);
            int victimColor = ColorUtils.withAlpha(
                    isOurDeath ? ThemeRegistry.danger() : 0xFFAAAAAA, alpha);

            String killerText = entry.killer;
            String sep = " ⚔ ";
            String victimText = entry.victim;

            int tx = PADDING_X;
            RenderUtils.drawText(gfx, killerText, tx, rowY + 2, killerColor);
            tx += RenderUtils.textWidth(killerText);
            RenderUtils.drawText(gfx, sep, tx, rowY + 2, ColorUtils.withAlpha(0xFFFFAA00, alpha));
            tx += RenderUtils.textWidth(sep);
            RenderUtils.drawText(gfx, victimText, tx, rowY + 2, victimColor);

            rowY += LINE_H;
        }

        gfx.pose().popMatrix();
    }
}
