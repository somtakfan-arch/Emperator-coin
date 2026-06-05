package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.PotionItem;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Компактный счётчик тотемов, яблок, жемчуга и зелий. */
@Environment(EnvType.CLIENT)
public class InventoryCountLayer {

    private static final int W = 140;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.inventoryCount.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        int totems = 0, gapples = 0, pearls = 0, potions = 0;
        var inv = mc.player.getInventory();
        for (int i = 0; i < inv.getContainerSize(); i++) {
            var s = inv.getItem(i);
            if (s.is(Items.TOTEM_OF_UNDYING))                                        totems  += s.getCount();
            if (s.is(Items.GOLDEN_APPLE) || s.is(Items.ENCHANTED_GOLDEN_APPLE))      gapples += s.getCount();
            if (s.is(Items.ENDER_PEARL))                                             pearls  += s.getCount();
            if (s.getItem() instanceof PotionItem)                                   potions += s.getCount();
        }
        if (mc.player.getOffhandItem().is(Items.TOTEM_OF_UNDYING)) totems++;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.inventoryCount.anchor.resolveX(cfg.inventoryCount.offsetX, (int)(W * scale));
        int y = cfg.inventoryCount.anchor.resolveY(cfg.inventoryCount.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        String text = String.format("Т:%d Я:%d П:%d З:%d", totems, gapples, pearls, potions);
        RenderUtils.drawText(gfx, text, 5, 3, ColorUtils.withAlpha(0xFFCCCCCC, opacity));

        gfx.pose().popMatrix();
    }
}
