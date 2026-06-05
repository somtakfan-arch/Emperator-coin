package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Прочность брони — все четыре слота. */
@Environment(EnvType.CLIENT)
public class ArmorDurabilityLayer {

    private static final int W = 120;
    private static final int H = 26;

    private static final EquipmentSlot[] SLOTS  = {
        EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET
    };
    private static final String[] LABELS = { "Ш", "Г", "Н", "Б" };

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.armorDurability.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        boolean any = false;
        for (EquipmentSlot slot : SLOTS) {
            ItemStack s = mc.player.getItemBySlot(slot);
            if (!s.isEmpty() && s.getMaxDamage() > 0) { any = true; break; }
        }
        if (!any) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.armorDurability.anchor.resolveX(cfg.armorDurability.offsetX, (int)(W * scale));
        int y = cfg.armorDurability.anchor.resolveY(cfg.armorDurability.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.fillRect(gfx, 0, 0, 2, H, ColorUtils.withAlpha(ThemeRegistry.accent(), opacity));

        int fh = RenderUtils.fontHeight() + 2;
        for (int i = 0; i < SLOTS.length; i++) {
            ItemStack s  = mc.player.getItemBySlot(SLOTS[i]);
            int px = 5 + (i % 2) * 57;
            int py = 3 + (i / 2) * fh;

            if (s.isEmpty() || s.getMaxDamage() == 0) {
                RenderUtils.drawText(gfx, LABELS[i] + ": -", px, py,
                        ColorUtils.withAlpha(0xFF666666, opacity));
                continue;
            }

            float frac = 1f - (float) s.getDamageValue() / s.getMaxDamage();
            int col = frac > 0.5f
                    ? ColorUtils.withAlpha(0xFF44FF44, opacity)
                    : frac > 0.2f
                    ? ColorUtils.withAlpha(0xFFFFAA00, opacity)
                    : ColorUtils.withAlpha(0xFFFF4444, opacity);

            RenderUtils.drawText(gfx, String.format("%s:%d%%", LABELS[i], (int)(frac * 100)), px, py, col);
        }

        gfx.pose().popMatrix();
    }
}
