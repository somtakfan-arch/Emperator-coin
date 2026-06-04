package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.Camera;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.phys.Vec3;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.state.TargetTracker;
import pro.bedsmp.visuals.client.util.ColorUtils;
import pro.bedsmp.visuals.client.util.MathUtils;
import pro.bedsmp.visuals.client.util.RenderUtils;

import java.util.ArrayList;
import java.util.List;

/** Цифры урона, всплывающие над целью. */
@Environment(EnvType.CLIENT)
public class DamageNumbersLayer {

    private record FloatingNumber(float damage, boolean isCrit,
                                  long spawnTick, float offsetX) {}

    private static final List<FloatingNumber> numbers = new ArrayList<>();

    /** Добавить новое число (вызывается из CombatEventHandler). */
    public static void addDamage(float damage, boolean isCrit) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.damageNumbers.enabled) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return;

        long tick = mc.level.getGameTime();
        float ox = (float)(Math.random() - 0.5) * 20;
        numbers.add(new FloatingNumber(damage, isCrit, tick, ox));
    }

    public static void render(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.damageNumbers.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null || mc.player == null || mc.gameRenderer == null) return;
        if (TargetTracker.get().getTarget() == null) return;

        long currentTick = mc.level.getGameTime();

        // Очистка устаревших
        numbers.removeIf(n -> currentTick - n.spawnTick() > cfg.damageNumbers.durationTicks);

        var target = TargetTracker.get().getTarget();
        if (target == null) return;

        // Проецировать позицию над целью в экранные координаты
        Vec3 worldPos = target.position().add(0, target.getBbHeight() + 0.5, 0);
        double[] screenPos = worldToScreen(worldPos, mc);
        if (screenPos == null) return;

        for (FloatingNumber num : numbers) {
            long age = currentTick - num.spawnTick();
            float progress = MathUtils.progress((int) age, cfg.damageNumbers.durationTicks);
            float alpha = 1f - MathUtils.easeIn(progress);
            float rise = MathUtils.easeOut(progress) * 25f;

            if (alpha <= 0f) continue;

            // Пропускаем не-крит с нулевым уроном (урон неизвестен на клиенте)
            if (!num.isCrit() && num.damage() <= 0f) continue;

            int color = num.isCrit() ? cfg.damageNumbers.critColor : cfg.damageNumbers.color;
            color = ColorUtils.withAlpha(color, alpha * cfg.globalOpacity);

            String text = num.isCrit()
                    ? (num.damage() > 0f ? String.format("%.1f CRIT!", num.damage()) : "CRIT!")
                    : String.format("%.1f", num.damage());

            float scale = num.isCrit() ? cfg.damageNumbers.fontSize * 1.3f : cfg.damageNumbers.fontSize;
            int tx = (int)(screenPos[0] + num.offsetX() - RenderUtils.textWidth(text) * scale / 2);
            int ty = (int)(screenPos[1] - rise);

            gfx.pose().pushMatrix();
            gfx.pose().translate(tx, ty);
            gfx.pose().scale(scale, scale);
            RenderUtils.drawText(gfx, text, 0, 0, color);
            gfx.pose().popMatrix();
        }
    }

    private static double[] worldToScreen(Vec3 worldPos, Minecraft mc) {
        try {
            Camera camera = mc.gameRenderer.getMainCamera();
            int sw = mc.getWindow().getGuiScaledWidth();
            int sh = mc.getWindow().getGuiScaledHeight();

            Vec3 camPos = camera.position();
            Vec3 rel = worldPos.subtract(camPos);

            float yaw = camera.yRot();
            float pitch = camera.xRot();

            float cosYaw = (float)Math.cos(Math.toRadians(-yaw));
            float sinYaw = (float)Math.sin(Math.toRadians(-yaw));
            float cosPitch = (float)Math.cos(Math.toRadians(-pitch));
            float sinPitch = (float)Math.sin(Math.toRadians(-pitch));

            float lx = (float)rel.x;
            float ly = (float)rel.y;
            float lz = (float)rel.z;

            float vx = lx * cosYaw - lz * sinYaw;
            float vz = lx * sinYaw + lz * cosYaw;
            float vy = ly * cosPitch - vz * sinPitch;
            float vd = ly * sinPitch + vz * cosPitch;

            if (vd <= 0) return null;

            double fov = mc.options.fov().get();
            double fovFactor = 1.0 / Math.tan(Math.toRadians(fov / 2.0));
            double aspect = (double) sw / sh;

            double nx = (vx / vd) * fovFactor / aspect;
            double ny = -(vy / vd) * fovFactor;

            double screenX = (nx + 1.0) * sw / 2.0;
            double screenY = (ny + 1.0) * sh / 2.0;

            return new double[]{screenX, screenY};
        } catch (Exception e) {
            return null;
        }
    }
}
