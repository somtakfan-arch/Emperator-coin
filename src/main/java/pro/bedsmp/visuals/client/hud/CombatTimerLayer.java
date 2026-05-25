package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.DeltaTracker;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.state.CombatState;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Таймер боя: показывает, сколько осталось до выхода из режима PvP. */
@Environment(EnvType.CLIENT)
public class CombatTimerLayer {

    private static final int W = 90;
    private static final int H = 16;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.combatTimer.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return;

        CombatState combat = CombatState.get();
        long currentTick = mc.level.getGameTime();
        boolean inCombat = combat.isInCombat();

        long ticksSinceLast = currentTick - combat.getLastCombatTick();
        int timeoutTicks = cfg.combatTimer.combatTimeoutTicks;
        long remaining = Math.max(0, timeoutTicks - ticksSinceLast);

        float scale = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.combatTimer.anchor.resolveX(cfg.combatTimer.offsetX, (int)(W * scale));
        int y = cfg.combatTimer.anchor.resolveY(cfg.combatTimer.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bgColor = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bgColor);

        int statusColor;
        String label;

        if (inCombat) {
            statusColor = ColorUtils.withAlpha(cfg.combatTimer.colorInCombat, opacity);
            float secs = remaining / 20f;
            label = String.format("⚔ ВОЙ %.1fс", secs);
        } else {
            statusColor = ColorUtils.withAlpha(cfg.combatTimer.colorSafe, opacity);
            label = "✓ БЕЗОПАСНО";
        }

        int tw = RenderUtils.textWidth(label);
        RenderUtils.drawText(gfx, label, (W - tw) / 2, (H - RenderUtils.fontHeight()) / 2,
                statusColor);

        gfx.pose().popMatrix();
    }
}
