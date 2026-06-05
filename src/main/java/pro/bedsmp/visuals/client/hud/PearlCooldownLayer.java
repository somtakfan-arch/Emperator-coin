package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Откат телепорта эндер-жемчуга. */
@Environment(EnvType.CLIENT)
public class PearlCooldownLayer {

    private static final int W = 95;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.pearlCooldown.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        float pct = mc.player.getCooldowns().getCooldownPercent(new ItemStack(Items.ENDER_PEARL), 0f);
        if (pct <= 0f) return; // нет отката

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.pearlCooldown.anchor.resolveX(cfg.pearlCooldown.offsetX, (int)(W * scale));
        int y = cfg.pearlCooldown.anchor.resolveY(cfg.pearlCooldown.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col = pct > 0.5f
                ? ColorUtils.withAlpha(0xFFFF4444, opacity)
                : ColorUtils.withAlpha(0xFFFFAA00, opacity);

        RenderUtils.drawText(gfx, String.format("◎ Жемчуг: %d%%", (int)(pct * 100)), 5, 3, col);

        gfx.pose().popMatrix();
    }
}
