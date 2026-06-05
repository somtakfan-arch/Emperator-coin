package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.CrossbowItem;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Количество стрел в инвентаре (показывает при луке/арбалете в руке). */
@Environment(EnvType.CLIENT)
public class ArrowCountLayer {

    private static final int W = 90;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.arrowCount.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        ItemStack main = mc.player.getMainHandItem();
        boolean holdingRanged = main.getItem() instanceof BowItem
                || main.getItem() instanceof CrossbowItem;
        if (!holdingRanged) return;

        int arrows = 0;
        var inv = mc.player.getInventory();
        for (int i = 0; i < inv.getContainerSize(); i++) {
            var s = inv.getItem(i);
            if (s.is(Items.ARROW) || s.is(Items.SPECTRAL_ARROW) || s.is(Items.TIPPED_ARROW)) {
                arrows += s.getCount();
            }
        }

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.arrowCount.anchor.resolveX(cfg.arrowCount.offsetX, (int)(W * scale));
        int y = cfg.arrowCount.anchor.resolveY(cfg.arrowCount.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col = arrows == 0
                ? ColorUtils.withAlpha(0xFFFF4444, opacity)
                : arrows < 10
                ? ColorUtils.withAlpha(0xFFFFAA00, opacity)
                : ColorUtils.withAlpha(0xFFFFFFFF, opacity);

        RenderUtils.drawText(gfx, "→ Стрелы: " + arrows, 5, 3, col);

        gfx.pose().popMatrix();
    }
}
