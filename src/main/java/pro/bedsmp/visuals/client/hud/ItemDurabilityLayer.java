package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.item.ItemStack;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Прочность предмета в руке. */
@Environment(EnvType.CLIENT)
public class ItemDurabilityLayer {

    private static final int W = 90;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.itemDurability.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        ItemStack stack = mc.player.getMainHandItem();
        if (stack.isEmpty() || stack.getMaxDamage() == 0) return;

        int maxDmg = stack.getMaxDamage();
        int curDmg = stack.getDamageValue();
        float frac = 1f - (float) curDmg / maxDmg;
        int pct    = (int)(frac * 100);

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.itemDurability.anchor.resolveX(cfg.itemDurability.offsetX, (int)(W * scale));
        int y = cfg.itemDurability.anchor.resolveY(cfg.itemDurability.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int barCol = frac > 0.5f
                ? ColorUtils.withAlpha(0xFF44FF44, opacity)
                : frac > 0.2f
                ? ColorUtils.withAlpha(0xFFFFAA00, opacity)
                : ColorUtils.withAlpha(0xFFFF4444, opacity);

        RenderUtils.drawText(gfx, String.format("🔧 %d%%", pct), 5, 3,
                ColorUtils.withAlpha(0xFFFFFFFF, opacity));
        RenderUtils.drawProgressBar(gfx, 60, 5, 26, 4, frac,
                ColorUtils.withAlpha(0xFF333333, opacity), barCol);

        gfx.pose().popMatrix();
    }
}
