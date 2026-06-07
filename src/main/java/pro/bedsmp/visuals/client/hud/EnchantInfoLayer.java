package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.core.Holder;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.ItemEnchantments;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

import java.util.ArrayList;
import java.util.List;

/** Зачарования предмета в руке — компактный список. */
@Environment(EnvType.CLIENT)
public class EnchantInfoLayer {

    private static final int W = 140;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.enchantInfo.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        ItemStack held = mc.player.getMainHandItem();
        if (held.isEmpty()) return;

        ItemEnchantments enc = held.getEnchantments();
        if (enc.isEmpty()) return;

        List<String> lines = new ArrayList<>();
        enc.entrySet().forEach(e -> {
            Holder<Enchantment> h = e.getKey();
            int lvl = e.getIntValue();
            String name = h.value().description().getString();
            if (name.length() > 16) name = name.substring(0, 15);
            lines.add(name + " " + lvl);
        });
        if (lines.isEmpty()) return;

        int fh = RenderUtils.fontHeight() + 1;
        int h  = fh * lines.size() + 4;
        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.enchantInfo.anchor.resolveX(cfg.enchantInfo.offsetX, (int)(W * scale));
        int y = cfg.enchantInfo.anchor.resolveY(cfg.enchantInfo.offsetY, (int)(h * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, h, 3, bg);
        for (int i = 0; i < lines.size(); i++) {
            RenderUtils.drawText(gfx, lines.get(i), 4, 2 + i * fh,
                    ColorUtils.withAlpha(0xFFBBAAFF, opacity));
        }
        gfx.pose().popMatrix();
    }
}
