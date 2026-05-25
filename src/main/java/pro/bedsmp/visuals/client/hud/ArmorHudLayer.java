package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.DeltaTracker;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Своя броня и прочность инструмента в руке. */
@Environment(EnvType.CLIENT)
public class ArmorHudLayer {

    private static final int W = 130;
    private static final int H = 18;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.armorHud.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        float scale = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.armorHud.anchor.resolveX(cfg.armorHud.offsetX, (int)(W * scale));
        int y = cfg.armorHud.anchor.resolveY(cfg.armorHud.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int textColor = ColorUtils.withAlpha(ThemeRegistry.text(), opacity);
        int warnColor = ColorUtils.withAlpha(cfg.armorHud.warnColor, opacity);

        // Броня: helmet, chestplate, leggings, boots
        EquipmentSlot[] slots = {
                EquipmentSlot.HEAD,
                EquipmentSlot.CHEST,
                EquipmentSlot.LEGS,
                EquipmentSlot.FEET
        };
        String[] labels = {"Ш", "Г", "Н", "С"};

        int slotW = (W - 8) / 4;
        for (int i = 0; i < slots.length; i++) {
            ItemStack item = mc.player.getItemBySlot(slots[i]);
            int sx = 4 + i * slotW;

            if (item.isEmpty()) {
                RenderUtils.drawText(gfx, labels[i] + "—", sx, (H - RenderUtils.fontHeight()) / 2,
                        ColorUtils.withAlpha(0xFF555555, opacity));
                continue;
            }

            int maxDur = item.getMaxDamage();
            int curDur = maxDur - item.getDamageValue();
            float fraction = maxDur > 0 ? (float) curDur / maxDur : 1f;

            int color = fraction <= cfg.armorHud.warnThreshold ? warnColor : textColor;
            String text = labels[i] + String.format("%.0f%%", fraction * 100);
            RenderUtils.drawText(gfx, text, sx, (H - RenderUtils.fontHeight()) / 2, color);
        }

        // Инструмент в руке
        ItemStack mainHand = mc.player.getMainHandItem();
        if (!mainHand.isEmpty() && mainHand.isDamageableItem()) {
            int maxDur = mainHand.getMaxDamage();
            int curDur = maxDur - mainHand.getDamageValue();
            float fraction = (float) curDur / maxDur;
            int color = fraction <= cfg.armorHud.warnThreshold ? warnColor : textColor;
            String text = "✦" + String.format("%.0f%%", fraction * 100);
            int tw = RenderUtils.textWidth(text);
            RenderUtils.drawText(gfx, text, W - tw - 4, (H - RenderUtils.fontHeight()) / 2, color);
        }

        gfx.pose().popMatrix();
    }
}
