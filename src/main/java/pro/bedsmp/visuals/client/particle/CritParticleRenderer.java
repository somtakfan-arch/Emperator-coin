package pro.bedsmp.visuals.client.particle;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.world.entity.LivingEntity;
import pro.bedsmp.visuals.BedSMPVisualsClient;

/** Дополнительные частицы для критических ударов. */
@Environment(EnvType.CLIENT)
public class CritParticleRenderer {

    private CritParticleRenderer() {}

    /** Спавнит расширенный набор партиклов для крита через HitParticleRenderer. */
    public static void spawnCrit(LivingEntity target, float damage) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.critEffects.enabled) return;
        // Крит-партиклы идут через тот же рендерер, но с флагом isCrit=true
        HitParticleRenderer.get().spawnHit(target, damage, true);
    }
}
