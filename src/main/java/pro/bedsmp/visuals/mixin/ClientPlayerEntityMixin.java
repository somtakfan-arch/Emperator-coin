package pro.bedsmp.visuals.mixin;

import net.minecraft.client.player.LocalPlayer;
import org.spongepowered.asm.mixin.Mixin;

/** Зарезервирован. CPS отслеживается через GLFW-поллинг в TickHandler. */
@Mixin(LocalPlayer.class)
public class ClientPlayerEntityMixin {
    // CPS перенесён в TickHandler (GLFW polling)
}
