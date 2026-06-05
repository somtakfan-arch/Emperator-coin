package pro.bedsmp.visuals.client.particle;

import com.mojang.blaze3d.vertex.PoseStack;
import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.util.ColorUtils;

import java.util.ArrayList;
import java.util.List;

/**
 * Визуальный эффект попаданий: угловые скобки вокруг прицела (HUD-пространство).
 * Ранее использовались 3D-частицы через RenderTypes.LINES, теперь — 2D HUD-эффект.
 */
@Environment(EnvType.CLIENT)
public class HitParticleRenderer {

    private static HitParticleRenderer INSTANCE;

    public static HitParticleRenderer get() {
        if (INSTANCE == null) INSTANCE = new HitParticleRenderer();
        return INSTANCE;
    }

    private record HitFlash(long spawnTick, boolean isCrit) {}

    private final List<HitFlash> flashes = new ArrayList<>();

    public void spawnHit(LivingEntity target, float damage, boolean isCrit) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.hitParticles.enabled) return;
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return;
        flashes.add(new HitFlash(mc.level.getGameTime(), isCrit));
    }

    public void tick() {
        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) { flashes.clear(); return; }
        long tick = mc.level.getGameTime();
        var cfg = BedSMPVisualsClient.CONFIG;
        int lifetime = cfg != null ? cfg.hitParticles.lifetime : 12;
        flashes.removeIf(f -> tick - f.spawnTick() >= lifetime);
    }

    /** Мировой рендер — не используется (эффект теперь в renderHud). */
    public void render(PoseStack poseStack, MultiBufferSource consumers,
                       float partialTick, Vec3 cameraPos) {
        // no-op: эффект отображается через renderHud()
    }

    /** HUD-рендер: FPS-стиль хит-маркер (4 расходящихся черты). */
    public void renderHud(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.hitParticles.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.level == null) return;
        long tick = mc.level.getGameTime();

        int sw = mc.getWindow().getGuiScaledWidth();
        int sh = mc.getWindow().getGuiScaledHeight();
        int cx = sw / 2;
        int cy = sh / 2;

        for (HitFlash flash : flashes) {
            float age = tick - flash.spawnTick();
            int lifetime = Math.max(1, cfg.hitParticles.lifetime);
            float progress = Math.min(1f, age / (float) lifetime);
            // Плавное появление (0-20%) и угасание (20-100%)
            float alpha = progress < 0.2f
                    ? (progress / 0.2f)
                    : (1f - (progress - 0.2f) / 0.8f);
            alpha *= cfg.globalOpacity;
            if (alpha <= 0.02f) continue;

            int baseColor = flash.isCrit() ? 0xFFFF8800 : 0xFFFFFFFF;
            int color = ColorUtils.withAlpha(baseColor, alpha);

            int startGap = flash.isCrit() ? 7 : 5;
            int endGap   = flash.isCrit() ? 20 : 16;
            int gap = (int)(startGap + (endGap - startGap) * progress);
            int len = flash.isCrit() ? 9 : 7;
            int thick = 2;

            // Верхняя черта
            gfx.fill(cx - 1,        cy - gap - len, cx + 1 + thick, cy - gap,        color);
            // Нижняя черта
            gfx.fill(cx - 1,        cy + gap,       cx + 1 + thick, cy + gap + len,  color);
            // Левая черта
            gfx.fill(cx - gap - len, cy - 1,        cx - gap,       cy + 1 + thick,  color);
            // Правая черта
            gfx.fill(cx + gap,       cy - 1,        cx + gap + len, cy + 1 + thick,  color);
        }
    }

    public void clear() { flashes.clear(); }

    public List<?> getParticles() { return flashes; }
}
