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

    /** HUD-рендер: угловые скобки вокруг прицела при попадании. */
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
            float progress = Math.min(1f, age / (float) cfg.hitParticles.lifetime);
            float alpha = (1f - progress) * cfg.globalOpacity;
            if (alpha <= 0.02f) continue;

            int baseColor = flash.isCrit() ? cfg.critEffects.particleColor : cfg.hitParticles.color;
            int color = ColorUtils.withAlpha(baseColor, alpha);

            int startR = flash.isCrit() ? 6 : 4;
            int endR   = flash.isCrit() ? 22 : 16;
            int r = (int) (startR + (endR - startR) * progress);
            int bLen = Math.max(3, r / 3);
            int t = Math.max(1, 2 - (int) (progress * 1.5f));

            // Угловые скобки: 4 угла × 2 линии каждый
            // Верхний левый
            gfx.fill(cx - r,          cy - r,          cx - r + bLen, cy - r + t,    color);
            gfx.fill(cx - r,          cy - r,          cx - r + t,    cy - r + bLen, color);
            // Верхний правый
            gfx.fill(cx + r - bLen,   cy - r,          cx + r,        cy - r + t,    color);
            gfx.fill(cx + r - t,      cy - r,          cx + r,        cy - r + bLen, color);
            // Нижний левый
            gfx.fill(cx - r,          cy + r - t,      cx - r + bLen, cy + r,        color);
            gfx.fill(cx - r,          cy + r - bLen,   cx - r + t,    cy + r,        color);
            // Нижний правый
            gfx.fill(cx + r - bLen,   cy + r - t,      cx + r,        cy + r,        color);
            gfx.fill(cx + r - t,      cy + r - bLen,   cx + r,        cy + r,        color);
        }
    }

    public void clear() { flashes.clear(); }

    public List<?> getParticles() { return flashes; }
}
