package pro.bedsmp.visuals.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.fabricmc.loader.api.FabricLoader;
import pro.bedsmp.visuals.BedSMPVisualsClient;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

@Environment(EnvType.CLIENT)
public class ConfigManager {

    private static final int CURRENT_VERSION = 3;
    private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();

    private static Path getConfigPath() {
        return FabricLoader.getInstance().getConfigDir().resolve("bedsmpvisuals.json");
    }

    public static ModConfig load() {
        Path path = getConfigPath();
        if (!Files.exists(path)) {
            ModConfig defaults = new ModConfig();
            save(defaults);
            return defaults;
        }
        try {
            String json = Files.readString(path, StandardCharsets.UTF_8);
            ModConfig cfg = GSON.fromJson(json, ModConfig.class);
            if (cfg == null) {
                BedSMPVisualsClient.LOGGER.warn("Конфиг пустой, использую дефолты");
                return new ModConfig();
            }
            cfg = migrate(cfg);
            return cfg;
        } catch (Exception e) {
            BedSMPVisualsClient.LOGGER.error("Ошибка загрузки конфига, использую дефолты: {}", e.getMessage());
            return new ModConfig();
        }
    }

    public static void save(ModConfig config) {
        if (config == null) return;
        config.configVersion = CURRENT_VERSION;
        try {
            Path path = getConfigPath();
            Files.createDirectories(path.getParent());
            Files.writeString(path, GSON.toJson(config), StandardCharsets.UTF_8);
        } catch (IOException e) {
            BedSMPVisualsClient.LOGGER.error("Ошибка сохранения конфига: {}", e.getMessage());
        }
    }

    /** Миграция конфига при обновлении версии — не роняем мод при изменении структуры. */
    private static ModConfig migrate(ModConfig cfg) {
        if (cfg.configVersion < CURRENT_VERSION) {
            BedSMPVisualsClient.LOGGER.info("Мигрирую конфиг с версии {} → {}", cfg.configVersion, CURRENT_VERSION);
            // Инициализируем поля, которые могли появиться в новых версиях
            if (cfg.hitParticles == null) cfg.hitParticles = new ModConfig.HitParticles();
            if (cfg.targetHud == null) cfg.targetHud = new ModConfig.TargetHud();
            if (cfg.damageNumbers == null) cfg.damageNumbers = new ModConfig.DamageNumbers();
            if (cfg.critEffects == null) cfg.critEffects = new ModConfig.CritEffects();
            if (cfg.trajectory == null) cfg.trajectory = new ModConfig.Trajectory();
            if (cfg.bedStatus == null) cfg.bedStatus = new ModConfig.BedStatus();
            if (cfg.bedHighlight == null) cfg.bedHighlight = new ModConfig.BedHighlight();
            if (cfg.combatTimer == null) cfg.combatTimer = new ModConfig.CombatTimer();
            if (cfg.totemCounter == null) cfg.totemCounter = new ModConfig.TotemCounter();
            if (cfg.healthChange == null) cfg.healthChange = new ModConfig.HealthChange();
            if (cfg.killFeed == null) cfg.killFeed = new ModConfig.KillFeed();
            if (cfg.lowHpVignette == null) cfg.lowHpVignette = new ModConfig.LowHpVignette();
            if (cfg.colorThemes == null) cfg.colorThemes = new ModConfig.ColorThemes();
            if (cfg.cpsCounter == null) cfg.cpsCounter = new ModConfig.CpsCounter();
            if (cfg.comboCounter == null) cfg.comboCounter = new ModConfig.ComboCounter();
            if (cfg.reachDisplay == null) cfg.reachDisplay = new ModConfig.ReachDisplay();
            if (cfg.effectsHud == null) cfg.effectsHud = new ModConfig.EffectsHud();
            if (cfg.armorHud == null) cfg.armorHud = new ModConfig.ArmorHud();
            if (cfg.pingFps == null) cfg.pingFps = new ModConfig.PingFps();
            if (cfg.coordinates == null) cfg.coordinates = new ModConfig.Coordinates();
            if (cfg.hotbarPulse == null) cfg.hotbarPulse = new ModConfig.HotbarPulse();
            if (cfg.damageDirection == null) cfg.damageDirection = new ModConfig.DamageDirection();
            if (cfg.hitSoundCues == null) cfg.hitSoundCues = new ModConfig.HitSoundCues();
            if (cfg.watermark == null) cfg.watermark = new ModConfig.Watermark();
            if (cfg.sessionStats == null) cfg.sessionStats = new ModConfig.SessionStats();
            cfg.configVersion = CURRENT_VERSION;
            save(cfg);
        }
        return cfg;
    }
}
