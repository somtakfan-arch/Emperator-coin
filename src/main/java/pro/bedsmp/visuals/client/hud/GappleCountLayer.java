package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.item.Items;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Количество золотых яблок (обычных и зачарованных) в инвентаре. */
@Environment(EnvType.CLIENT)
public class GappleCountLayer {

    private static final int W = 120;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.gappleCount.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        int normal = 0, enchanted = 0;
        var inv = mc.player.getInventory();
        for (int i = 0; i < inv.getContainerSize(); i++) {
            var s = inv.getItem(i);
            if (s.is(Items.GOLDEN_APPLE))           normal    += s.getCount();
            if (s.is(Items.ENCHANTED_GOLDEN_APPLE)) enchanted += s.getCount();
        }
        if (normal + enchanted == 0) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.gappleCount.anchor.resolveX(cfg.gappleCount.offsetX, (int)(W * scale));
        int y = cfg.gappleCount.anchor.resolveY(cfg.gappleCount.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        String text = enchanted > 0
                ? String.format("🍎 %d  ✦ %d", normal, enchanted)
                : String.format("🍎 Яблок: %d", normal);
        int col = enchanted > 0
                ? ColorUtils.withAlpha(0xFFFF88FF, opacity)
                : ColorUtils.withAlpha(0xFFFFAA44, opacity);

        RenderUtils.drawText(gfx, text, 5, 3, col);

        gfx.pose().popMatrix();
    }
}
