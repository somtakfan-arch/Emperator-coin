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

/** Статус тотема в оффхенде и количество в инвентаре. */
@Environment(EnvType.CLIENT)
public class TotemStatusLayer {

    private static final int W = 120;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.totemStatus.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        boolean equipped = mc.player.getOffhandItem().is(Items.TOTEM_OF_UNDYING);
        int count = 0;
        var inv = mc.player.getInventory();
        for (int i = 0; i < inv.getContainerSize(); i++) {
            var s = inv.getItem(i);
            if (s.is(Items.TOTEM_OF_UNDYING)) count += s.getCount();
        }
        if (equipped) count++;

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.totemStatus.anchor.resolveX(cfg.totemStatus.offsetX, (int)(W * scale));
        int y = cfg.totemStatus.anchor.resolveY(cfg.totemStatus.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);

        int col = equipped
                ? ColorUtils.withAlpha(0xFF44FF44, opacity)
                : ColorUtils.withAlpha(0xFFFF4444, opacity);

        String status = equipped ? "ВКЛ" : "ВЫКЛ";
        RenderUtils.drawText(gfx, String.format("🛡 Тотем: %s (x%d)", status, count), 5, 3, col);

        gfx.pose().popMatrix();
    }
}
