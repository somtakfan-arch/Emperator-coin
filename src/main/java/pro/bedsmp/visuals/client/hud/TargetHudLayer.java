package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.DeltaTracker;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.state.TargetTracker;
import pro.bedsmp.visuals.client.theme.ThemeRegistry;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.HudAnchor;
import pro.bedsmp.visuals.client.util.RenderUtils;

/** Панель текущей цели: ник, HP-бар, броня, дистанция. */
@Environment(EnvType.CLIENT)
public class TargetHudLayer {

    private static final int W = 160;
    private static final int H = 36;
    private static final int PADDING = 4;

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.targetHud.enabled || !cfg.hudVisible) return;

        LivingEntity target = TargetTracker.get().getTarget();
        if (target == null) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;

        float opacity = cfg.globalOpacity;
        float scale = cfg.globalScale;

        int x = cfg.targetHud.anchor.resolveX(cfg.targetHud.offsetX, (int)(W * scale));
        int y = cfg.targetHud.anchor.resolveY(cfg.targetHud.offsetY, (int)(H * scale));

        gfx.pose().pushMatrix();
        gfx.pose().translate(x, y);
        gfx.pose().scale(scale, scale);

        int bgColor = ColorUtils.withAlpha(ThemeRegistry.bg(), opacity);
        int accentColor = ColorUtils.withAlpha(ThemeRegistry.accent(), opacity);
        int textColor = ColorUtils.withAlpha(ThemeRegistry.text(), opacity);

        // Фон
        RenderUtils.fillRoundedRect(gfx, 0, 0, W, H, 3, bgColor);
        // Акцент-полоска сверху
        RenderUtils.fillRect(gfx, 0, 0, W, 2, accentColor);

        // Ник
        String name = target.getName().getString();
        RenderUtils.drawText(gfx, name, PADDING, PADDING, textColor);

        // HP-бар
        float maxHp = target.getMaxHealth();
        float hp = target.getHealth();
        float fraction = maxHp > 0 ? hp / maxHp : 0f;
        int barColor = ColorUtils.withAlpha(ColorUtils.healthBarColor(fraction), opacity);
        int barBg = ColorUtils.withAlpha(0xFF333333, opacity);

        int barY = PADDING + RenderUtils.fontHeight() + 2;
        RenderUtils.drawProgressBar(gfx, PADDING, barY, W - PADDING * 2, 5,
                fraction, barBg, barColor);

        // HP число
        String hpText = String.format("%.1f/%.0f", hp, maxHp);
        int hpTextX = PADDING;
        int hpTextY = barY + 7;
        RenderUtils.drawText(gfx, hpText, hpTextX, hpTextY, textColor);

        // Дистанция
        if (cfg.targetHud.showDistance) {
            double dist = mc.player.distanceTo(target);
            String distText = String.format("%.1fm", dist);
            int dw = RenderUtils.textWidth(distText);
            RenderUtils.drawText(gfx, distText, W - dw - PADDING, hpTextY,
                    ColorUtils.withAlpha(0xFFAAAAAA, opacity));
        }

        // Броня
        if (cfg.targetHud.showArmor && target instanceof Player p) {
            int armor = p.getArmorValue();
            String armorText = "✰ " + armor;
            int aw = RenderUtils.textWidth(armorText);
            RenderUtils.drawText(gfx, armorText, W - aw - PADDING, PADDING,
                    ColorUtils.withAlpha(0xFF88AAFF, opacity));
        }

        gfx.pose().popMatrix();
    }
}
