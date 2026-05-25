package pro.bedsmp.visuals.client.state;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.LivingEntity;

/** Отслеживает текущую цель: HP, броня, дистанция. */
@Environment(EnvType.CLIENT)
public class TargetTracker {

    private static TargetTracker INSTANCE;

    public static TargetTracker get() {
        if (INSTANCE == null) INSTANCE = new TargetTracker();
        return INSTANCE;
    }

    private LivingEntity target = null;
    private long lockUntilTick = 0;

    // Предыдущее HP для индикатора изменения
    private float prevHealth = -1f;
    private float healthDelta = 0f;
    private long healthChangeTick = -1;

    // Кол-во лопнувших тотемов цели за бой
    private int totemPops = 0;

    public LivingEntity getTarget() {
        long tick = Minecraft.getInstance().level != null
                ? Minecraft.getInstance().level.getGameTime() : 0;
        if (target == null || !target.isAlive() || tick > lockUntilTick) {
            return null;
        }
        return target;
    }

    public void setTarget(LivingEntity entity, long currentTick, int lockTicks) {
        if (entity != target) {
            prevHealth = entity.getHealth();
            totemPops = 0;
        }
        target = entity;
        lockUntilTick = currentTick + lockTicks;
    }

    public void updateHealth(LivingEntity entity, long currentTick) {
        if (entity == null) return;
        float current = entity.getHealth();
        if (prevHealth >= 0f) {
            float delta = current - prevHealth;
            if (Math.abs(delta) > 0.01f) {
                healthDelta = delta;
                healthChangeTick = currentTick;
            }
        }
        prevHealth = current;
    }

    public float getHealthDelta() { return healthDelta; }
    public long getHealthChangeTick() { return healthChangeTick; }

    public int getTotemPops() { return totemPops; }
    public void incrementTotemPops() { totemPops++; }

    public void clear() {
        target = null;
        lockUntilTick = 0;
        prevHealth = -1f;
        healthDelta = 0f;
        totemPops = 0;
    }

    public boolean hasTarget() {
        return getTarget() != null;
    }
}
