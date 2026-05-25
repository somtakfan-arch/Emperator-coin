package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.resources.Identifier;

/**
 * Регистрирует все HUD-элементы через HudElementRegistry (Fabric API 1.21.11).
 * Каждый элемент — отдельный Identifier, цепочкой после MISC_OVERLAYS.
 */
@Environment(EnvType.CLIENT)
public class HudManager {

    private static Identifier id(String name) {
        return Identifier.fromNamespaceAndPath("bedsmpvisuals", name);
    }

    public static void register() {
        // Регистрируем слои последовательно, каждый после предыдущего
        HudElementRegistry.attachElementAfter(VanillaHudElements.MISC_OVERLAYS, id("watermark"),
                (gfx, tc) -> WatermarkLayer.render(gfx, tc));

        HudElementRegistry.attachElementAfter(id("watermark"), id("ping_fps"),
                (gfx, tc) -> PingFpsLayer.render(gfx, tc));

        HudElementRegistry.attachElementAfter(id("ping_fps"), id("coordinates"),
                (gfx, tc) -> CoordinatesLayer.render(gfx, tc));

        HudElementRegistry.attachElementAfter(id("coordinates"), id("target_hud"),
                (gfx, tc) -> TargetHudLayer.render(gfx, tc));

        HudElementRegistry.attachElementAfter(id("target_hud"), id("damage_numbers"),
                (gfx, tc) -> DamageNumbersLayer.render(gfx, tc));

        HudElementRegistry.attachElementAfter(id("damage_numbers"), id("bed_status"),
                (gfx, tc) -> BedStatusLayer.render(gfx, tc));

        HudElementRegistry.attachElementAfter(id("bed_status"), id("combat_timer"),
                (gfx, tc) -> CombatTimerLayer.render(gfx, tc));

        HudElementRegistry.attachElementAfter(id("combat_timer"), id("totem_counter"),
                (gfx, tc) -> TotemCounterLayer.render(gfx, tc));

        HudElementRegistry.attachElementAfter(id("totem_counter"), id("kill_feed"),
                (gfx, tc) -> KillFeedLayer.render(gfx, tc));

        HudElementRegistry.attachElementAfter(id("kill_feed"), id("cps"),
                (gfx, tc) -> CpsLayer.render(gfx, tc));

        HudElementRegistry.attachElementAfter(id("cps"), id("combo"),
                (gfx, tc) -> ComboLayer.render(gfx, tc));

        HudElementRegistry.attachElementAfter(id("combo"), id("reach"),
                (gfx, tc) -> ReachLayer.render(gfx, tc));

        HudElementRegistry.attachElementAfter(id("reach"), id("effects_hud"),
                (gfx, tc) -> EffectsHudLayer.render(gfx, tc));

        HudElementRegistry.attachElementAfter(id("effects_hud"), id("armor_hud"),
                (gfx, tc) -> ArmorHudLayer.render(gfx, tc));

        // Вигнет поверх всего
        HudElementRegistry.attachElementAfter(id("armor_hud"), id("low_hp_vignette"),
                (gfx, tc) -> LowHpVignetteLayer.render(gfx, tc));
    }
}
