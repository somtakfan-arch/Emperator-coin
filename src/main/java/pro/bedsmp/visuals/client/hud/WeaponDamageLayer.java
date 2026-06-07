package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.ItemStack;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Базовый урон оружия в руке. */
@Environment(EnvType.CLIENT)
public class WeaponDamageLayer {

    private static final int W = 100;
    private static final int H = 13;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.weaponDamage.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        ItemStack held = mc.player.getMainHandItem();
        if (held.isEmpty()) return;

        double dmg = mc.player.getAttributeValue(Attributes.ATTACK_DAMAGE);
        if (dmg <= 1.0) return; // Базовый урон голой рукой — не показываем

        float scale   = cfg.globalScale;
        float opacity = cfg.globalOpacity;

        int x = cfg.weaponDamage.anchor.resolveX(cfg.weaponDamage.offsetX, (int)(W * scale));
        int y = cfg.weaponDamage.anchor.resolveY(cfg.weaponDamage.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bg = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity * 0.8f);
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bg);
        RenderUtils.drawText(gfx, String.format("⚔ %.1f ♥", dmg), 5, 3,
                ColorUtils.withAlpha(0xFFFF6666, opacity));
        gfx.pose().popMatrix();
    }
}
