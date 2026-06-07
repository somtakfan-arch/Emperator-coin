package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.world.level.biome.Biome;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Текущий биом. */
@Environment(EnvType.CLIENT)
public class BiomeLayer {

    private static final int W = 130;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.biomeDisplay.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || mc.player == null) return;

        BlockPos pos = mc.player.blockPosition();
        Holder<Biome> biomeHolder = mc.level.getBiome(pos);
        // ResourceKey.toString() gives "ResourceKey[.../ namespace:path]" — extract after last ':'
        String name = biomeHolder.unwrapKey().map(k -> {
            String s = k.toString();
            int ci = s.lastIndexOf(':');
            if (ci >= 0) s = s.substring(ci + 1).replace("]", "");
            return s.replace('_', ' ');
        }).orElse("неизвестно");
        if (!name.isEmpty()) name = Character.toUpperCase(name.charAt(0)) + name.substring(1);

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.biomeDisplay.anchor.resolveX(cfg.biomeDisplay.offsetX, (int)(W * scale));
        int y = cfg.biomeDisplay.anchor.resolveY(cfg.biomeDisplay.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx, "Биом: " + name, 5, 3,
                ColorUtils.withAlpha(0xFF88DDAA, opacity));
        gfx.pose().popMatrix();
    }
}
