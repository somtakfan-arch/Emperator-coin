package pro.bedsmp.visuals.client.hud;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.resources.Identifier;

import pro.bedsmp.visuals.client.particle.HitParticleRenderer;
import pro.bedsmp.visuals.client.world.TrajectoryRenderer;

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

        // Эффект попадания (угловые скобки вокруг прицела) — поверх вигнета
        HudElementRegistry.attachElementAfter(id("low_hp_vignette"), id("hit_particles"),
                (gfx, tc) -> HitParticleRenderer.get().renderHud(gfx, tc));

        // Траектория снаряда (2D проекция, без world-space GL)
        HudElementRegistry.attachElementAfter(id("hit_particles"), id("trajectory"),
                (gfx, tc) -> TrajectoryRenderer.renderHud(gfx, tc));

        // Булава — индикатор падения и урона смэша
        HudElementRegistry.attachElementAfter(id("trajectory"), id("mace_pvp"),
                (gfx, tc) -> MacePvPLayer.render(gfx, tc));

        // Кристалл ПвП — счётчик кристаллов и мест для установки
        HudElementRegistry.attachElementAfter(id("mace_pvp"), id("crystal_pvp"),
                (gfx, tc) -> CrystalPvPLayer.render(gfx, tc));

        // ── Фаза 5: 35 новых слоёв ───────────────────────────────────────────

        HudElementRegistry.attachElementAfter(id("crystal_pvp"), id("attack_cooldown"),
                (gfx, tc) -> AttackCooldownLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("attack_cooldown"), id("speed"),
                (gfx, tc) -> SpeedLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("speed"), id("fall_damage_preview"),
                (gfx, tc) -> FallDamagePreviewLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("fall_damage_preview"), id("wtap_indicator"),
                (gfx, tc) -> WTapIndicatorLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("wtap_indicator"), id("kill_streak"),
                (gfx, tc) -> KillStreakLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("kill_streak"), id("absorption"),
                (gfx, tc) -> AbsorptionLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("absorption"), id("food_sat"),
                (gfx, tc) -> FoodSatLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("food_sat"), id("potion_timers"),
                (gfx, tc) -> PotionTimerLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("potion_timers"), id("armor_durability"),
                (gfx, tc) -> ArmorDurabilityLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("armor_durability"), id("item_durability"),
                (gfx, tc) -> ItemDurabilityLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("item_durability"), id("exp_bar"),
                (gfx, tc) -> ExpBarLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("exp_bar"), id("freeze_timer"),
                (gfx, tc) -> FreezeTimerLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("freeze_timer"), id("chunk_info"),
                (gfx, tc) -> ChunkInfoLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("chunk_info"), id("day_time"),
                (gfx, tc) -> DayTimeLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("day_time"), id("nearby_players"),
                (gfx, tc) -> NearbyPlayersLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("nearby_players"), id("real_clock"),
                (gfx, tc) -> RealClockLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("real_clock"), id("light_level"),
                (gfx, tc) -> LightLevelLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("light_level"), id("compass"),
                (gfx, tc) -> CompassLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("compass"), id("swim_depth"),
                (gfx, tc) -> SwimDepthLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("swim_depth"), id("playtime"),
                (gfx, tc) -> PlaytimeLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("playtime"), id("damage_summary"),
                (gfx, tc) -> DamageSummaryLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("damage_summary"), id("gapple_count"),
                (gfx, tc) -> GappleCountLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("gapple_count"), id("totem_status"),
                (gfx, tc) -> TotemStatusLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("totem_status"), id("inventory_count"),
                (gfx, tc) -> InventoryCountLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("inventory_count"), id("strafing"),
                (gfx, tc) -> StrafingLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("strafing"), id("velocity"),
                (gfx, tc) -> VelocityLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("velocity"), id("pearl_cooldown"),
                (gfx, tc) -> PearlCooldownLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("pearl_cooldown"), id("arrow_count"),
                (gfx, tc) -> ArrowCountLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("arrow_count"), id("tps_display"),
                (gfx, tc) -> TpsDisplayLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("tps_display"), id("session_kd"),
                (gfx, tc) -> SessionKDLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("session_kd"), id("shield_status"),
                (gfx, tc) -> ShieldStatusLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("shield_status"), id("sprint_status"),
                (gfx, tc) -> SprintStatusLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("sprint_status"), id("custom_crosshair"),
                (gfx, tc) -> CustomCrosshairLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("custom_crosshair"), id("hit_flash"),
                (gfx, tc) -> HitFlashLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("hit_flash"), id("border_glow"),
                (gfx, tc) -> BorderGlowLayer.render(gfx, tc));

        // ── Фаза 6: 31 новый слой ─────────────────────────────────────────────

        HudElementRegistry.attachElementAfter(id("border_glow"), id("mace_hit_effect"),
                (gfx, tc) -> MaceHitEffectLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("mace_hit_effect"), id("combat_log"),
                (gfx, tc) -> CombatLogLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("combat_log"), id("dps"),
                (gfx, tc) -> DpsLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("dps"), id("iframes"),
                (gfx, tc) -> IFramesLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("iframes"), id("death_coords"),
                (gfx, tc) -> DeathCoordsLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("death_coords"), id("elytra_stats"),
                (gfx, tc) -> ElytraStatsLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("elytra_stats"), id("sneak_indicator"),
                (gfx, tc) -> SneakLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("sneak_indicator"), id("weather_display"),
                (gfx, tc) -> WeatherLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("weather_display"), id("dimension_display"),
                (gfx, tc) -> DimensionLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("dimension_display"), id("hotbar_names"),
                (gfx, tc) -> HotbarNamesLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("hotbar_names"), id("anti_afk"),
                (gfx, tc) -> AntiAfkLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("anti_afk"), id("fishing_indicator"),
                (gfx, tc) -> FishingLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("fishing_indicator"), id("fov_display"),
                (gfx, tc) -> FovLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("fov_display"), id("dph"),
                (gfx, tc) -> DphLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("dph"), id("mace_chain"),
                (gfx, tc) -> MaceChainLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("mace_chain"), id("weapon_damage"),
                (gfx, tc) -> WeaponDamageLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("weapon_damage"), id("fire_timer"),
                (gfx, tc) -> FireTimerLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("fire_timer"), id("enchant_info"),
                (gfx, tc) -> EnchantInfoLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("enchant_info"), id("spawn_distance"),
                (gfx, tc) -> SpawnDistanceLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("spawn_distance"), id("kill_timer"),
                (gfx, tc) -> KillTimerLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("kill_timer"), id("max_fall"),
                (gfx, tc) -> MaxFallLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("max_fall"), id("entity_count"),
                (gfx, tc) -> EntityCountLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("entity_count"), id("movement_distance"),
                (gfx, tc) -> MovementDistanceLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("movement_distance"), id("saturation_display"),
                (gfx, tc) -> SaturationDisplayLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("saturation_display"), id("perspective_indicator"),
                (gfx, tc) -> PerspectiveLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("perspective_indicator"), id("gamemode_display"),
                (gfx, tc) -> GamemodeLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("gamemode_display"), id("biome_display"),
                (gfx, tc) -> BiomeLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("biome_display"), id("hurt_time"),
                (gfx, tc) -> HurtTimeLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("hurt_time"), id("jump_boost"),
                (gfx, tc) -> JumpBoostLayer.render(gfx, tc));
        HudElementRegistry.attachElementAfter(id("jump_boost"), id("healing_rate"),
                (gfx, tc) -> HealingRateLayer.render(gfx, tc));
    }
}
