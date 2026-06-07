package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.item.Items;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Счётчик последовательных ударов булавой (mace smash chain). */
@Environment(EnvType.CLIENT)
public class MaceChainLayer {

    private static final int W = 120;
    private static final int H = 13;

    private static int chain    = 0;
    private static long lastHitTick = -1;
    private static final int TIMEOUT = 60; // 3 секунды

    public static void onMaceHit() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return;
        long now = mc.level.getGameTime();
        if (lastHitTick >= 0 && now - lastHitTick > TIMEOUT) chain = 0;
        chain++;
        lastHitTick = now;
    }

    public static void tick(Minecraft mc) {
        if (mc.level == null) return;
        if (lastHitTick >= 0 && mc.level.getGameTime() - lastHitTick > TIMEOUT) {
            chain = 0;
            lastHitTick = -1;
        }
    }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.maceChain.enabled || !cfg.hudVisible) return;
        if (chain <= 0) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;
        if (!mc.player.getMainHandItem().is(Items.MACE)) return;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.maceChain.anchor.resolveX(cfg.maceChain.offsetX, (int)(W * scale));
        int y = cfg.maceChain.anchor.resolveY(cfg.maceChain.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col = chain >= 5
                ? ColorUtils.withAlpha(0xFFFFDD00, opacity)
                : ColorUtils.withAlpha(0xFFFF8800, opacity);
        RenderUtils.drawText(gfx, String.format("🔨 CHAIN x%d", chain), 5, 3, col);
        gfx.pose().popMatrix();
    }
}
