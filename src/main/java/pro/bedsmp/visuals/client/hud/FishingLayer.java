package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.entity.projectile.FishingHook;
import net.minecraft.world.item.FishingRodItem;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Статус поплавка при рыбалке: в воде / на воздухе, расстояние. */
@Environment(EnvType.CLIENT)
public class FishingLayer {

    private static final int W = 130;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.fishingIndicator.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        // Только при удочке в руке
        boolean hasRod = mc.player.getMainHandItem().getItem() instanceof FishingRodItem
                || mc.player.getOffhandItem().getItem() instanceof FishingRodItem;
        if (!hasRod) return;

        FishingHook hook = mc.player.fishing;
        if (hook == null) return;

        float dist = (float) mc.player.distanceTo(hook);
        boolean inWater = hook.isInWater();

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.fishingIndicator.anchor.resolveX(cfg.fishingIndicator.offsetX, (int)(W * scale));
        int y = cfg.fishingIndicator.anchor.resolveY(cfg.fishingIndicator.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col = inWater ? ColorUtils.withAlpha(0xFF44BBFF, opacity) : ColorUtils.withAlpha(0xFFFFAA44, opacity);
        String st = inWater ? "В ВОДЕ" : "В ВОЗДУХЕ";
        RenderUtils.drawText(gfx, String.format("🎣 %s %.1fm", st, dist), 5, 3, col);
        gfx.pose().popMatrix();
    }
}
