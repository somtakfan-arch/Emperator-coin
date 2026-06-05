package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.boss.enderdragon.EndCrystal;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

import java.util.List;

/** Кристальное ПвП: счётчик кристаллов и мест для установки. */
@Environment(EnvType.CLIENT)
public class CrystalPvPLayer {

    private static final int W = 110;
    private static final int H = 26;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.crystalPvp.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;

        // Считаем ближайшие кристаллы
        List<EndCrystal> crystals = mc.level.getEntitiesOfClass(
                EndCrystal.class,
                mc.player.getBoundingBox().inflate(cfg.crystalPvp.scanRadius)
        );
        int count = crystals.size();

        // Ближайший кристалл
        double nearest = Double.MAX_VALUE;
        for (EndCrystal c : crystals) {
            double d = mc.player.distanceTo(c);
            if (d < nearest) nearest = d;
        }

        // Мест для установки (только если в руке кристалл и опция включена)
        int placementCount = 0;
        boolean holdingCrystal = mc.player.getMainHandItem().is(Items.END_CRYSTAL)
                || mc.player.getOffhandItem().is(Items.END_CRYSTAL);
        if (holdingCrystal && cfg.crystalPvp.showPlacementCount) {
            placementCount = countPlacementSpots(mc, cfg.crystalPvp.placementRadius);
        }

        // Ничего интересного — не показываем
        if (count == 0 && !holdingCrystal) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.crystalPvp.anchor.resolveX(cfg.crystalPvp.offsetX, (int)(W * scale));
        int y = cfg.crystalPvp.anchor.resolveY(cfg.crystalPvp.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int accent = ThemeRegistry.accent();
        RenderUtils.fillRect(gfx, 0, 0, 2, H, ColorUtils.withAlpha(accent, opacity));

        // Строка 1: счётчик кристаллов
        String line1 = count == 0
                ? "Crystals: нет"
                : String.format("Crystals: %d (%.1fm)", count, nearest);
        RenderUtils.drawText(gfx, line1, 5, 3, ColorUtils.withAlpha(0xFFFFFFFF, opacity));

        // Строка 2: места для установки (если в руке кристалл)
        String line2;
        if (holdingCrystal && cfg.crystalPvp.showPlacementCount) {
            int cpsR = pro.bedsmp.visuals.client.event.TickHandler.cpsRight;
            line2 = String.format("Spots: %d | RMB: %d", placementCount, cpsR);
        } else if (holdingCrystal) {
            int cpsR = pro.bedsmp.visuals.client.event.TickHandler.cpsRight;
            line2 = String.format("RMB CPS: %d", cpsR);
        } else {
            line2 = "";
        }

        if (!line2.isEmpty()) {
            RenderUtils.drawText(gfx, line2, 5, 3 + RenderUtils.fontHeight() + 2,
                    ColorUtils.withAlpha(accent, opacity));
        }

        gfx.pose().popMatrix();
    }

    /**
     * Считает количество позиций, куда можно поставить кристалл (обсидиан/бэдрок
     * с двумя свободными блоками над ним) в радиусе radius от игрока.
     */
    private static int countPlacementSpots(Minecraft mc, int radius) {
        int count = 0;
        BlockPos playerPos = mc.player.blockPosition();
        for (int dx = -radius; dx <= radius; dx++) {
            for (int dz = -radius; dz <= radius; dz++) {
                BlockPos base = playerPos.offset(dx, -1, dz);
                // Можно поставить на обсидиан или бэдрок
                var baseBlock = mc.level.getBlockState(base).getBlock();
                if (baseBlock != Blocks.OBSIDIAN && baseBlock != Blocks.CRYING_OBSIDIAN
                        && baseBlock != Blocks.BEDROCK) continue;
                // Нужны 2 свободных блока над
                BlockPos above1 = base.above();
                BlockPos above2 = base.above(2);
                if (!mc.level.getBlockState(above1).isAir()) continue;
                if (!mc.level.getBlockState(above2).isAir()) continue;
                count++;
            }
        }
        return count;
    }
}
