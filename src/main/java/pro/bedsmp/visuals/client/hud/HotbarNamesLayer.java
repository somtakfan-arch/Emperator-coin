package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.item.ItemStack;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Названия предметов хотбара над слотами. */
@Environment(EnvType.CLIENT)
public class HotbarNamesLayer {

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.hotbarNames.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        int sw = mc.getWindow().getGuiScaledWidth();
        int sh = mc.getWindow().getGuiScaledHeight();

        float opacity = cfg.globalOpacity;
        int fh = RenderUtils.fontHeight();

        // Хотбар — 9 слотов, центрированных по экрану
        int hotbarW  = 182;
        int slotSize = 20;
        int startX   = (sw - hotbarW) / 2 + 1;
        int baseY    = sh - 23 - fh - 1;

        var inv = mc.player.getInventory();
        ItemStack selectedItem = inv.getSelectedItem();
        int selected = -1;
        for (int si = 0; si < 9; si++) {
            if (inv.getItem(si) == selectedItem) { selected = si; break; }
        }

        for (int i = 0; i < 9; i++) {
            ItemStack s = inv.getItem(i);
            if (s.isEmpty()) continue;

            String name = s.getHoverName().getString();
            if (name.length() > 10) name = name.substring(0, 9) + "…";

            int slotCX = startX + i * slotSize + slotSize / 2;
            int tw     = RenderUtils.textWidth(name);
            int tx     = slotCX - tw / 2;
            int ty     = baseY;

            int col = i == selected
                    ? ColorUtils.withAlpha(0xFFFFFFFF, opacity)
                    : ColorUtils.withAlpha(0xFFAAAAAA, opacity * 0.7f);

            RenderUtils.drawText(gfx, name, tx, ty, col);
        }
    }
}
