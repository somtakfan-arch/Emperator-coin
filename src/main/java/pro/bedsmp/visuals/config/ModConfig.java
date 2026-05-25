package pro.bedsmp.visuals.config;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import pro.bedsmp.visuals.client.theme.ColorTheme;
import pro.bedsmp.visuals.client.util.HudAnchor;

/**
 * Все настройки мода. Каждая функция — отдельный вложенный класс.
 */
@Environment(EnvType.CLIENT)
public class ModConfig {

    public int configVersion = 3;
    public boolean hudVisible = true;
    public float globalScale = 1.0f;
    public float globalOpacity = 1.0f;
    public String colorTheme = ColorTheme.BEDSMP.name();

    // ── Фаза 1: Базовые функции (Pulse Visuals) ──────────────────────────────

    public HitParticles hitParticles = new HitParticles();
    public TargetHud targetHud = new TargetHud();
    public DamageNumbers damageNumbers = new DamageNumbers();
    public CritEffects critEffects = new CritEffects();
    public Trajectory trajectory = new Trajectory();

    // ── Фаза 2: Фишки под BedSMP ─────────────────────────────────────────────

    public BedStatus bedStatus = new BedStatus();
    public BedHighlight bedHighlight = new BedHighlight();
    public CombatTimer combatTimer = new CombatTimer();
    public TotemCounter totemCounter = new TotemCounter();
    public HealthChange healthChange = new HealthChange();
    public KillFeed killFeed = new KillFeed();
    public LowHpVignette lowHpVignette = new LowHpVignette();
    public ColorThemes colorThemes = new ColorThemes();

    // ── Фаза 3: Доп. функции ─────────────────────────────────────────────────

    public CpsCounter cpsCounter = new CpsCounter();
    public ComboCounter comboCounter = new ComboCounter();
    public ReachDisplay reachDisplay = new ReachDisplay();
    public EffectsHud effectsHud = new EffectsHud();
    public ArmorHud armorHud = new ArmorHud();
    public PingFps pingFps = new PingFps();
    public Coordinates coordinates = new Coordinates();
    public HotbarPulse hotbarPulse = new HotbarPulse();
    public DamageDirection damageDirection = new DamageDirection();
    public HitSoundCues hitSoundCues = new HitSoundCues();
    public Watermark watermark = new Watermark();
    public HudScaleOpacity hudScaleOpacity = new HudScaleOpacity();
    public SessionStats sessionStats = new SessionStats();
    public QuickTogglePanel quickTogglePanel = new QuickTogglePanel();

    // ─────────────────────────────────────────────────────────────────────────

    public static class HitParticles {
        public boolean enabled = true;
        public String shape = "SPARK";    // SPARK, CIRCLE, CROSS, STAR
        public int color = 0xFFFFFFFF;
        public float size = 1.0f;
        public int count = 6;
        public int lifetime = 12;
        public float speed = 0.15f;
        public boolean gravity = true;
    }

    public static class TargetHud {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_CENTER;
        public int offsetX = 0;
        public int offsetY = 10;
        public int lockTicks = 60;
        public boolean showArmor = true;
        public boolean showDistance = true;
        public boolean showEffects = false;
    }

    public static class DamageNumbers {
        public boolean enabled = true;
        public int color = 0xFFFF4444;
        public int critColor = 0xFFFFAA00;
        public float fontSize = 1.0f;
        public int durationTicks = 30;
        public boolean accumulate = false;
        public int accumulateWindowTicks = 5;
    }

    public static class CritEffects {
        public boolean enabled = true;
        public int particleColor = 0xFFFFAA00;
        public boolean critSound = true;
        public float critSoundVolume = 0.5f;
    }

    public static class Trajectory {
        public boolean enabled = false;  // ВЫКЛ по умолчанию — может быть запрещено правилами сервера
        public int color = 0xFF44AAFF;
        public float lineWidth = 1.5f;
        public int predictionTicks = 80;
        public boolean showLandingMark = true;
        public int landingMarkColor = 0xFFFF4444;
    }

    public static class BedStatus {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_RIGHT;
        public int offsetX = -5;
        public int offsetY = -5;
        public float scale = 1.0f;
        public String mode = "MANUAL";  // MANUAL, AUTO_HINT
        public String chatRegex = "(?i)(твоя кровать|your bed).*уничтожена|destroyed";
        public boolean[] bedAlive = {true, true, true};
    }

    public static class BedHighlight {
        public boolean enabled = false;  // ВЫКЛ по умолчанию — аналог ESP
        public int color = 0x6600AAFF;
        public int radius = 32;
        public String mode = "OUTLINE";  // OUTLINE, FILL
        public boolean throughWalls = false;
    }

    public static class CombatTimer {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_RIGHT;
        public int offsetX = -5;
        public int offsetY = 5;
        public int combatTimeoutTicks = 200;  // 10 сек
        public int colorInCombat = 0xFFFF4444;
        public int colorSafe = 0xFF44FF44;
    }

    public static class TotemCounter {
        public boolean enabled = true;
        public boolean showSessionTotal = true;
        public HudAnchor anchor = HudAnchor.TOP_CENTER;
        public int offsetX = 0;
        public int offsetY = 80;
    }

    public static class HealthChange {
        public boolean enabled = true;
        public int healColor = 0xFF44FF44;
        public int damageColor = 0xFFFF4444;
        public int displayTicks = 20;
    }

    public static class KillFeed {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_RIGHT;
        public int offsetX = -5;
        public int offsetY = 60;
        public int maxLines = 5;
        public int entryLifeTicks = 120;
        public int fadeInTicks = 8;
        public int fadeOutTicks = 15;
    }

    public static class LowHpVignette {
        public boolean enabled = true;
        public float targetHpThreshold = 0.3f;
        public int targetVignetteColor = 0x99FF0000;
        public boolean selfVignette = true;
        public float selfHpThreshold = 0.25f;
        public int selfVignetteColor = 0x99880000;
        public float pulseSpeed = 2.0f;
        public float pulseStrength = 0.6f;
    }

    public static class ColorThemes {
        public boolean enabled = true;
        public int accentColor = 0xFF00DCCC;
        public int textColor = 0xFFFFFFFF;
        public int backgroundColor = 0xAA000000;
        public int dangerColor = 0xFFFF4444;
        public int successColor = 0xFF44FF44;
    }

    public static class CpsCounter {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_LEFT;
        public int offsetX = 5;
        public int offsetY = -5;
        public boolean showBoth = true;  // ЛКМ и ПКМ
    }

    public static class ComboCounter {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_CENTER;
        public int offsetX = 0;
        public int offsetY = 50;
        public int comboTimeoutTicks = 40;
        public boolean showMaxCombo = true;
    }

    public static class ReachDisplay {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -20;
        public int displayTicks = 30;
    }

    public static class EffectsHud {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_LEFT;
        public int offsetX = 5;
        public int offsetY = 5;
        public boolean targetEffects = true;
        public boolean selfEffects = false;
    }

    public static class ArmorHud {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -40;
        public float warnThreshold = 0.2f;
        public int warnColor = 0xFFFF4444;
    }

    public static class PingFps {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_LEFT;
        public int offsetX = 5;
        public int offsetY = 5;
        public int pingGoodColor = 0xFF44FF44;
        public int pingOkColor = 0xFFFFAA00;
        public int pingBadColor = 0xFFFF4444;
        public int pingGoodThreshold = 80;
        public int pingOkThreshold = 150;
    }

    public static class Coordinates {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_LEFT;
        public int offsetX = 5;
        public int offsetY = -20;
        public boolean showBiome = true;
        public boolean showDirection = true;
    }

    public static class HotbarPulse {
        public boolean enabled = true;
        public int pulseColor = 0x8800DCCC;
        public int pulseTicks = 8;
    }

    public static class DamageDirection {
        public boolean enabled = true;
        public int indicatorColor = 0xAAFF4444;
        public int displayTicks = 25;
        public float arcWidth = 0.25f;
    }

    public static class HitSoundCues {
        public boolean enabled = true;
        public boolean critSound = true;
        public boolean totemSound = true;
        public boolean killSound = true;
        public boolean deathSound = false;
        public float volume = 0.7f;
    }

    public static class Watermark {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_LEFT;
        public int offsetX = 5;
        public int offsetY = 5;
        public float opacity = 0.7f;
        public String text = "BedSMP";
    }

    public static class HudScaleOpacity {
        public boolean enabled = true;
    }

    public static class SessionStats {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_RIGHT;
        public int offsetX = -5;
        public int offsetY = -60;
        // Данные сессии — обнуляются при выходе
        public transient int kills = 0;
        public transient int deaths = 0;
        public transient int totemsPopped = 0;
        public transient int maxCombo = 0;
        public transient long combatTimeTicks = 0;
    }

    public static class QuickTogglePanel {
        public boolean enabled = true;
    }
}
