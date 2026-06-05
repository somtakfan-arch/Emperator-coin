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

/** Статус щита: активен/откат. */
@Environment(EnvType.CLIENT)
public class ShieldStatusLayer {

    private static final int W = 95;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.shieldStatus.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        boolean hasShield = mc.player.getMainHandItem().is(Items.SHIELD)
                || mc.player.getOffhandItem().is(Items.SHIELD);
        if (!hasShield) return;

        float cooldown = mc.player.getCooldowns().getCooldownPercent(new ItemStack(Items.SHIELD), 0f);

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.shieldStatus.anchor.resolveX(cfg.shieldStatus.offsetX, (int)(W * scale));
        int y = cfg.shieldStatus.anchor.resolveY(cfg.shieldStatus.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        if (cooldown > 0f) {
            int col = ColorUtils.withAlpha(0xFFFF4444, opacity);
            RenderUtils.drawText(gfx, String.format("🛡 Откат: %d%%", (int)(cooldown * 100)),
                    5, 3, col);
        } else {
            boolean blocking = mc.player.isBlocking();
            int col = blocking
                    ? ColorUtils.withAlpha(0xFF44FF44, opacity)
                    : ColorUtils.withAlpha(0xFFAAAAAA, opacity);
            RenderUtils.drawText(gfx, blocking ? "🛡 Блок" : "🛡 Готов", 5, 3, col);
        }

        gfx.pose().popMatrix();
    }
}
