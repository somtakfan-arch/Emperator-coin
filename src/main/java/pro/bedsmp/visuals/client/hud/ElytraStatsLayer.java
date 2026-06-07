package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.Items;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Скорость и угол планирования при активной элитре. */
@Environment(EnvType.CLIENT)
public class ElytraStatsLayer {

    private static final int W = 130;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.elytraStats.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        if (!mc.player.isFallFlying()) return;
        if (!mc.player.getItemBySlot(EquipmentSlot.CHEST).is(Items.ELYTRA)) return;

        var vel  = mc.player.getDeltaMovement();
        float spd = (float)(Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z) * 20);
        float pitch = mc.player.getXRot(); // neg = up, pos = down

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.elytraStats.anchor.resolveX(cfg.elytraStats.offsetX, (int)(W * scale));
        int y = cfg.elytraStats.anchor.resolveY(cfg.elytraStats.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col = spd > 30 ? ColorUtils.withAlpha(0xFF44FF44, opacity) : ColorUtils.withAlpha(0xFFCCCCCC, opacity);
        RenderUtils.drawText(gfx, String.format("✈ %.1f m/s  %+.0f°", spd, pitch), 5, 3, col);
        gfx.pose().popMatrix();
    }
}
