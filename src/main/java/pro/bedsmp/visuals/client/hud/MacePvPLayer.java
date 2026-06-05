package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.item.Items;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Индикатор булавы: высота и предполагаемый урон при смэше. */
@Environment(EnvType.CLIENT)
public class MacePvPLayer {

    private static final int W = 100;
    private static final int H = 26;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.macePvp.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;

        // Показываем только когда в руке булава
        if (!mc.player.getMainHandItem().is(Items.MACE)) return;

        float fall = (float) mc.player.fallDistance;
        double heightAboveGround = getHeightAboveGround(mc);

        // Не показываем если почти на земле и не падаем
        if (fall < cfg.macePvp.minFallHeight && heightAboveGround < cfg.macePvp.minFallHeight) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.macePvp.anchor.resolveX(cfg.macePvp.offsetX, (int)(W * scale));
        int y = cfg.macePvp.anchor.resolveY(cfg.macePvp.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        // Акцент-полоска
        float estimatedDamage = estimateSmashDamage(fall > 0 ? fall : (float) heightAboveGround);
        int accentColor = damageColor(estimatedDamage, opacity);
        RenderUtils.fillRect(gfx, 0, 0, 2, H, accentColor);

        // Строка 1: высота/падение
        float displayHeight = fall > 0.1f ? fall : (float) heightAboveGround;
        String heightText = String.format("⚒ %.1fм", displayHeight);
        RenderUtils.drawText(gfx, heightText, 5, 3, ColorUtils.withAlpha(0xFFFFFFFF, opacity));

        // Строка 2: урон
        String dmgText = String.format("~%.0f dmg", estimatedDamage);
        RenderUtils.drawText(gfx, dmgText, 5, 3 + RenderUtils.fontHeight() + 2,
                ColorUtils.withAlpha(accentColor, opacity));

        gfx.pose().popMatrix();
    }

    /**
     * Приблизительный урон от смэша в Minecraft 1.21 (без зачарований):
     * первые 3 блока × 4, следующие 3 × 2, остальные × 1.
     */
    private static float estimateSmashDamage(float fallDist) {
        if (fallDist <= 0) return 0;
        float t1 = Math.min(fallDist, 3f);
        float t2 = Math.max(0, Math.min(fallDist - 3f, 3f));
        float t3 = Math.max(0, fallDist - 6f);
        return t1 * 4f + t2 * 2f + t3 * 1f;
    }

    /** Ищет ближайший блок под игроком (до 30 блоков вниз). */
    private static double getHeightAboveGround(Minecraft mc) {
        BlockPos pos = mc.player.blockPosition();
        for (int dy = 0; dy <= 30; dy++) {
            BlockPos checkPos = pos.below(dy);
            if (mc.level.getBlockState(checkPos).isFaceSturdy(mc.level, checkPos, Direction.UP)) {
                return mc.player.getY() - (pos.getY() - dy + 1);
            }
        }
        return 0;
    }

    private static int damageColor(float dmg, float opacity) {
        if (dmg >= 20) return ColorUtils.withAlpha(0xFFFF4444, opacity);
        if (dmg >= 10) return ColorUtils.withAlpha(0xFFFFAA00, opacity);
        return ColorUtils.withAlpha(0xFF44FF44, opacity);
    }
}
