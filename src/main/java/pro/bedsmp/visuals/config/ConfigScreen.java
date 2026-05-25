package pro.bedsmp.visuals.config;

import me.shedaniel.clothconfig2.api.ConfigBuilder;
import me.shedaniel.clothconfig2.api.ConfigCategory;
import me.shedaniel.clothconfig2.api.ConfigEntryBuilder;
import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import pro.bedsmp.visuals.BedSMPVisualsClient;

@Environment(EnvType.CLIENT)
public class ConfigScreen {

    public static Screen create(Screen parent) {
        ModConfig cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null) cfg = new ModConfig();

        ConfigBuilder builder = ConfigBuilder.create()
                .setParentScreen(parent)
                .setTitle(Component.translatable("config.bedsmpvisuals.title"))
                .setSavingRunnable(() -> ConfigManager.save(BedSMPVisualsClient.CONFIG));

        ConfigEntryBuilder eb = builder.entryBuilder();
        final ModConfig finalCfg = cfg;

        // ── Вкладка: Основные (Pulse) ─────────────────────────────────────────
        ConfigCategory pulse = builder.getOrCreateCategory(
                Component.translatable("config.bedsmpvisuals.cat.pulse"));

        // Hit Particles
        pulse.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.hitparticles.enabled"),
                finalCfg.hitParticles.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.hitParticles.enabled = v)
                .build());
        pulse.addEntry(eb.startIntSlider(
                Component.translatable("config.bedsmpvisuals.hitparticles.count"),
                finalCfg.hitParticles.count, 1, 20)
                .setDefaultValue(6)
                .setSaveConsumer(v -> finalCfg.hitParticles.count = v)
                .build());
        pulse.addEntry(eb.startIntSlider(
                Component.translatable("config.bedsmpvisuals.hitparticles.lifetime"),
                finalCfg.hitParticles.lifetime, 5, 60)
                .setDefaultValue(12)
                .setSaveConsumer(v -> finalCfg.hitParticles.lifetime = v)
                .build());

        // Target HUD
        pulse.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.targethud.enabled"),
                finalCfg.targetHud.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.targetHud.enabled = v)
                .build());
        pulse.addEntry(eb.startIntSlider(
                Component.translatable("config.bedsmpvisuals.targethud.lockticks"),
                finalCfg.targetHud.lockTicks, 20, 200)
                .setDefaultValue(60)
                .setSaveConsumer(v -> finalCfg.targetHud.lockTicks = v)
                .build());

        // Damage Numbers
        pulse.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.damagenumbers.enabled"),
                finalCfg.damageNumbers.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.damageNumbers.enabled = v)
                .build());

        // Crit Effects
        pulse.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.criteffects.enabled"),
                finalCfg.critEffects.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.critEffects.enabled = v)
                .build());

        // Trajectory
        pulse.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.trajectory.enabled"),
                finalCfg.trajectory.enabled)
                .setDefaultValue(false)
                .setTooltip(Component.translatable("config.bedsmpvisuals.trajectory.warning"))
                .setSaveConsumer(v -> finalCfg.trajectory.enabled = v)
                .build());
        pulse.addEntry(eb.startIntSlider(
                Component.translatable("config.bedsmpvisuals.trajectory.ticks"),
                finalCfg.trajectory.predictionTicks, 20, 200)
                .setDefaultValue(80)
                .setSaveConsumer(v -> finalCfg.trajectory.predictionTicks = v)
                .build());

        // ── Вкладка: BedSMP ───────────────────────────────────────────────────
        ConfigCategory bedsmp = builder.getOrCreateCategory(
                Component.translatable("config.bedsmpvisuals.cat.bedsmp"));

        bedsmp.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.bedstatus.enabled"),
                finalCfg.bedStatus.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.bedStatus.enabled = v)
                .build());

        bedsmp.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.bedhighlight.enabled"),
                finalCfg.bedHighlight.enabled)
                .setDefaultValue(false)
                .setTooltip(Component.translatable("config.bedsmpvisuals.bedhighlight.warning"))
                .setSaveConsumer(v -> finalCfg.bedHighlight.enabled = v)
                .build());

        bedsmp.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.combattimer.enabled"),
                finalCfg.combatTimer.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.combatTimer.enabled = v)
                .build());

        bedsmp.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.totemcounter.enabled"),
                finalCfg.totemCounter.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.totemCounter.enabled = v)
                .build());

        bedsmp.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.killfeed.enabled"),
                finalCfg.killFeed.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.killFeed.enabled = v)
                .build());

        bedsmp.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.lowhpvignette.enabled"),
                finalCfg.lowHpVignette.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.lowHpVignette.enabled = v)
                .build());
        bedsmp.addEntry(eb.startFloatField(
                Component.translatable("config.bedsmpvisuals.lowhpvignette.threshold"),
                finalCfg.lowHpVignette.targetHpThreshold)
                .setDefaultValue(0.3f)
                .setSaveConsumer(v -> finalCfg.lowHpVignette.targetHpThreshold = v)
                .build());

        // ── Вкладка: Доп. функции ─────────────────────────────────────────────
        ConfigCategory extra = builder.getOrCreateCategory(
                Component.translatable("config.bedsmpvisuals.cat.extra"));

        extra.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.cps.enabled"),
                finalCfg.cpsCounter.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.cpsCounter.enabled = v)
                .build());

        extra.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.combo.enabled"),
                finalCfg.comboCounter.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.comboCounter.enabled = v)
                .build());

        extra.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.reach.enabled"),
                finalCfg.reachDisplay.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.reachDisplay.enabled = v)
                .build());

        extra.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.armor.enabled"),
                finalCfg.armorHud.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.armorHud.enabled = v)
                .build());

        extra.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.pingfps.enabled"),
                finalCfg.pingFps.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.pingFps.enabled = v)
                .build());

        extra.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.coords.enabled"),
                finalCfg.coordinates.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.coordinates.enabled = v)
                .build());

        extra.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.watermark.enabled"),
                finalCfg.watermark.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.watermark.enabled = v)
                .build());

        extra.addEntry(eb.startBooleanToggle(
                Component.translatable("config.bedsmpvisuals.sessionstats.enabled"),
                finalCfg.sessionStats.enabled)
                .setDefaultValue(true)
                .setSaveConsumer(v -> finalCfg.sessionStats.enabled = v)
                .build());

        // ── Вкладка: Тема и масштаб ───────────────────────────────────────────
        ConfigCategory theme = builder.getOrCreateCategory(
                Component.translatable("config.bedsmpvisuals.cat.theme"));

        theme.addEntry(eb.startFloatField(
                Component.translatable("config.bedsmpvisuals.global.scale"),
                finalCfg.globalScale)
                .setDefaultValue(1.0f)
                .setSaveConsumer(v -> finalCfg.globalScale = Math.max(0.5f, Math.min(2.0f, v)))
                .build());

        theme.addEntry(eb.startFloatField(
                Component.translatable("config.bedsmpvisuals.global.opacity"),
                finalCfg.globalOpacity)
                .setDefaultValue(1.0f)
                .setSaveConsumer(v -> finalCfg.globalOpacity = Math.max(0.1f, Math.min(1.0f, v)))
                .build());

        // ── Вкладка: О моде ───────────────────────────────────────────────────
        ConfigCategory about = builder.getOrCreateCategory(
                Component.translatable("config.bedsmpvisuals.cat.about"));

        about.addEntry(eb.startTextDescription(
                Component.translatable("config.bedsmpvisuals.about.text"))
                .build());

        return builder.build();
    }
}
