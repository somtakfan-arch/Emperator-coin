package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Количество живых существ и игроков поблизости. */
@Environment(EnvType.CLIENT)
public class EntityCountLayer {

    private static final int W = 130;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.entityCount.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || mc.player == null) return;

        double r = cfg.entityCount.radius;
        int mobs = 0, players = 0;
        for (var e : mc.level.entitiesForRendering()) {
            if (e == mc.player) continue;
            if (!(e instanceof LivingEntity le) || !le.isAlive()) continue;
            if (mc.player.distanceToSqr(e) > r * r) continue;
            if (e instanceof Player) players++;
            else mobs++;
        }

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.entityCount.anchor.resolveX(cfg.entityCount.offsetX, (int)(W * scale));
        int y = cfg.entityCount.anchor.resolveY(cfg.entityCount.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx,
                String.format("Игр:%d  Мобы:%d", players, mobs), 5, 3,
                ColorUtils.withAlpha(0xFFCCCCCC, opacity));
        gfx.pose().popMatrix();
    }
}
