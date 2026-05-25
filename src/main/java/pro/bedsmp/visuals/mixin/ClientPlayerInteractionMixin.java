package pro.bedsmp.visuals.mixin;

import net.minecraft.client.multiplayer.MultiPlayerGameMode;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import pro.bedsmp.visuals.client.event.CombatEventHandler;
import pro.bedsmp.visuals.client.hud.ReachLayer;
import pro.bedsmp.visuals.client.event.TickHandler;

/**
 * Перехватывает атаку игрока по сущности.
 * MultiPlayerGameMode = ClientPlayerInteractionManager в Yarn.
 */
@Mixin(MultiPlayerGameMode.class)
public class ClientPlayerInteractionMixin {

    @Inject(
            method = "attack(Lnet/minecraft/world/entity/player/Player;Lnet/minecraft/world/entity/Entity;)V",
            at = @At("HEAD")
    )
    private void bedsmpvisuals$onAttack(Player player, Entity target, CallbackInfo ci) {
        if (!(target instanceof LivingEntity living)) return;
        if (!(player instanceof LocalPlayer localPlayer)) return;

        float reach = (float) player.distanceTo(target);
        ReachLayer.recordReach(reach);

        boolean isCrit = isCriticalHit(localPlayer);
        CombatEventHandler.onHitEntity(living, 0f, isCrit);

        TickHandler.registerLeftClick();
    }

    private boolean isCriticalHit(LocalPlayer player) {
        return !player.onGround()
                && player.getDeltaMovement().y < 0
                && !player.isInWater()
                && !player.isInLava()
                && !player.onClimbable()
                && !player.hasEffect(net.minecraft.world.effect.MobEffects.BLINDNESS)
                && player.getVehicle() == null
                && !player.isSprinting();
    }
}
