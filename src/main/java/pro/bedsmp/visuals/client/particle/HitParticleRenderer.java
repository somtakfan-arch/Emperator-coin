package pro.bedsmp.visuals.client.particle;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.phys.Vec3;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.util.ColorUtils;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Random;

/** Рендерит и симулирует частицы попаданий в мировом пространстве. */
@Environment(EnvType.CLIENT)
public class HitParticleRenderer {

    private static HitParticleRenderer INSTANCE;

    public static HitParticleRenderer get() {
        if (INSTANCE == null) INSTANCE = new HitParticleRenderer();
        return INSTANCE;
    }

    private static final int MAX_PARTICLES = 200;
    private final List<HitParticle> particles = new ArrayList<>();
    private final Random random = new Random();

    public void spawnHit(LivingEntity target, float damage, boolean isCrit) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.hitParticles.enabled) return;

        int count = cfg.hitParticles.count;
        int color = isCrit ? cfg.critEffects.particleColor : cfg.hitParticles.color;
        float speed = cfg.hitParticles.speed;
        float size = cfg.hitParticles.size * (isCrit ? 1.5f : 1.0f);
        int lifetime = cfg.hitParticles.lifetime;
        boolean gravity = cfg.hitParticles.gravity;

        double ox = target.getX();
        double oy = target.getY() + target.getBbHeight() * 0.5;
        double oz = target.getZ();

        for (int i = 0; i < count && particles.size() < MAX_PARTICLES; i++) {
            double vx = (random.nextDouble() - 0.5) * speed * 2;
            double vy = random.nextDouble() * speed + 0.05;
            double vz = (random.nextDouble() - 0.5) * speed * 2;
            particles.add(new HitParticle(ox, oy, oz, vx, vy, vz,
                    color, size, lifetime, gravity, isCrit));
        }
    }

    public void tick() {
        Iterator<HitParticle> it = particles.iterator();
        while (it.hasNext()) {
            HitParticle p = it.next();
            p.tick();
            if (p.isDead()) it.remove();
        }
    }

    public void render(PoseStack poseStack, MultiBufferSource consumers,
                       float partialTick, Vec3 cameraPos) {
        if (particles.isEmpty()) return;
        try {
            VertexConsumer consumer = consumers.getBuffer(RenderTypes.LINES);
            var pose = poseStack.last();

            for (HitParticle p : particles) {
                float alpha = p.alpha();
                if (alpha <= 0f) continue;

                int color = ColorUtils.withAlpha(p.color, alpha);
                int a = ColorUtils.alpha(color);
                int r = ColorUtils.red(color);
                int g = ColorUtils.green(color);
                int b = ColorUtils.blue(color);

                float rx = (float)(p.x - cameraPos.x);
                float ry = (float)(p.y - cameraPos.y);
                float rz = (float)(p.z - cameraPos.z);

                float hs = p.size * 0.05f;

                consumer.addVertex(pose, rx - hs, ry, rz).setColor(r, g, b, a).setNormal(pose, 1, 0, 0);
                consumer.addVertex(pose, rx + hs, ry, rz).setColor(r, g, b, a).setNormal(pose, 1, 0, 0);
                consumer.addVertex(pose, rx, ry - hs, rz).setColor(r, g, b, a).setNormal(pose, 0, 1, 0);
                consumer.addVertex(pose, rx, ry + hs, rz).setColor(r, g, b, a).setNormal(pose, 0, 1, 0);
            }
        } catch (Exception e) {
            pro.bedsmp.visuals.BedSMPVisualsClient.LOGGER.error("Particle render error: {}", e.getMessage());
        }
    }

    public void clear() { particles.clear(); }

    public List<HitParticle> getParticles() { return particles; }
}
