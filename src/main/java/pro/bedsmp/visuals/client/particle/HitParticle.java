package pro.bedsmp.visuals.client.particle;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;

/** Одна частица эффекта попадания. */
@Environment(EnvType.CLIENT)
public class HitParticle {

    public double x, y, z;
    public double vx, vy, vz;
    public int color;
    public float size;
    public int lifetime;
    public int age;
    public boolean gravity;
    public boolean isCrit;

    public HitParticle(double x, double y, double z,
                       double vx, double vy, double vz,
                       int color, float size, int lifetime, boolean gravity, boolean isCrit) {
        this.x = x; this.y = y; this.z = z;
        this.vx = vx; this.vy = vy; this.vz = vz;
        this.color = color;
        this.size = size;
        this.lifetime = lifetime;
        this.age = 0;
        this.gravity = gravity;
        this.isCrit = isCrit;
    }

    public boolean isDead() { return age >= lifetime; }

    /** Шаг симуляции — не в рендере, в тике. */
    public void tick() {
        x += vx;
        y += vy;
        z += vz;
        if (gravity) vy -= 0.008;
        vx *= 0.92;
        vz *= 0.92;
        age++;
    }

    /** Альфа на текущем тике (1→0). */
    public float alpha() {
        return 1f - (float) age / lifetime;
    }
}
