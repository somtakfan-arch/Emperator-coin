package pro.bedsmp.visuals.mixin;

import net.minecraft.client.player.LocalPlayer;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.event.TickHandler;

/** Отслеживает клики ПКМ для CPS-счётчика. */
@Mixin(LocalPlayer.class)
public class ClientPlayerEntityMixin {

    @Inject(
            method = "swing(Lnet/minecraft/world/InteractionHand;)V",
            at = @At("HEAD")
    )
    private void bedsmpvisuals$onSwing(net.minecraft.world.InteractionHand hand, CallbackInfo ci) {
        // Отслеживаем только для CPS (swing = замах, прокси для ЛКМ активности)
    }
}
