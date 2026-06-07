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

    // ── Фаза 4: Булава и кристалл ────────────────────────────────────────────

    public MacePvP macePvp = new MacePvP();
    public CrystalPvP crystalPvp = new CrystalPvP();

    // ── Фаза 5: 35 новых функций ──────────────────────────────────────────────

    public AttackCooldown   attackCooldown   = new AttackCooldown();
    public SpeedDisplay     speedDisplay     = new SpeedDisplay();
    public FallDamagePreview fallDamagePreview = new FallDamagePreview();
    public WTapIndicator    wTapIndicator    = new WTapIndicator();
    public KillStreak       killStreak       = new KillStreak();
    public AbsorptionDisplay absorptionDisplay = new AbsorptionDisplay();
    public FoodDisplay      foodDisplay      = new FoodDisplay();
    public PotionTimers     potionTimers     = new PotionTimers();
    public ArmorDurability  armorDurability  = new ArmorDurability();
    public ItemDurability   itemDurability   = new ItemDurability();
    public ExpDisplay       expDisplay       = new ExpDisplay();
    public FreezeTimer      freezeTimer      = new FreezeTimer();
    public ChunkInfo        chunkInfo        = new ChunkInfo();
    public DayTime          dayTime          = new DayTime();
    public NearbyPlayers    nearbyPlayers    = new NearbyPlayers();
    public RealClock        realClock        = new RealClock();
    public LightLevel       lightLevel       = new LightLevel();
    public CompassDisplay   compassDisplay   = new CompassDisplay();
    public SwimDepth        swimDepth        = new SwimDepth();
    public Playtime         playtime         = new Playtime();
    public DamageSummary    damageSummary    = new DamageSummary();
    public GappleCount      gappleCount      = new GappleCount();
    public TotemStatus      totemStatus      = new TotemStatus();
    public InventoryCount   inventoryCount   = new InventoryCount();
    public StrafingDisplay  strafingDisplay  = new StrafingDisplay();
    public VelocityDisplay  velocityDisplay  = new VelocityDisplay();
    public PearlCooldown    pearlCooldown    = new PearlCooldown();
    public ArrowCount       arrowCount       = new ArrowCount();
    public TpsDisplay       tpsDisplay       = new TpsDisplay();
    public SessionKD        sessionKD        = new SessionKD();
    public ShieldStatus     shieldStatus     = new ShieldStatus();
    public SprintStatus     sprintStatus     = new SprintStatus();
    public CustomCrosshair  customCrosshair  = new CustomCrosshair();
    public HitFlash         hitFlash         = new HitFlash();
    public BorderGlow       borderGlow       = new BorderGlow();

    // ── Фаза 6: 31 новая функция ──────────────────────────────────────────────

    public MaceHitEffect    maceHitEffect    = new MaceHitEffect();
    public CombatLog        combatLog        = new CombatLog();
    public Dps              dps              = new Dps();
    public IFrames          iFrames          = new IFrames();
    public DeathCoords      deathCoords      = new DeathCoords();
    public ElytraStats      elytraStats      = new ElytraStats();
    public SneakIndicator   sneakIndicator   = new SneakIndicator();
    public WeatherDisplay   weatherDisplay   = new WeatherDisplay();
    public DimensionDisplay dimensionDisplay = new DimensionDisplay();
    public HotbarNames      hotbarNames      = new HotbarNames();
    public AntiAfk          antiAfk          = new AntiAfk();
    public FishingIndicator fishingIndicator = new FishingIndicator();
    public FovDisplay       fovDisplay       = new FovDisplay();
    public Dph              dph              = new Dph();
    public MaceChain        maceChain        = new MaceChain();
    public WeaponDamage     weaponDamage     = new WeaponDamage();
    public FireTimer        fireTimer        = new FireTimer();
    public EnchantInfo      enchantInfo      = new EnchantInfo();
    public SpawnDistance    spawnDistance    = new SpawnDistance();
    public KillTimer        killTimer        = new KillTimer();
    public MaxFall          maxFall          = new MaxFall();
    public EntityCount      entityCount      = new EntityCount();
    public MovementDistance movementDistance = new MovementDistance();
    public SaturationDisplay saturationDisplay = new SaturationDisplay();
    public PerspectiveIndicator perspectiveIndicator = new PerspectiveIndicator();
    public GamemodeDisplay  gamemodeDisplay  = new GamemodeDisplay();
    public BiomeDisplay     biomeDisplay     = new BiomeDisplay();
    public HurtTimeDisplay  hurtTimeDisplay  = new HurtTimeDisplay();
    public JumpBoostDisplay jumpBoostDisplay = new JumpBoostDisplay();
    public HealingRateDisplay healingRateDisplay = new HealingRateDisplay();

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

    public static class MacePvP {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.CENTER;
        public int offsetX = 0;
        public int offsetY = 40;
        public float minFallHeight = 1.5f;
    }

    public static class CrystalPvP {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.CENTER;
        public int offsetX = 0;
        public int offsetY = -50;
        public int scanRadius = 10;
        public boolean showPlacementCount = false;
        public int placementRadius = 4;
    }

    // ── Фаза 5: Новые конфиги ─────────────────────────────────────────────────

    public static class AttackCooldown {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -28;
    }

    public static class SpeedDisplay {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -42;
    }

    public static class FallDamagePreview {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.CENTER;
        public int offsetX = 0;
        public int offsetY = 60;
    }

    public static class WTapIndicator {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -55;
    }

    public static class KillStreak {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_CENTER;
        public int offsetX = 0;
        public int offsetY = 30;
    }

    public static class AbsorptionDisplay {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_CENTER;
        public int offsetX = 0;
        public int offsetY = 95;
    }

    public static class FoodDisplay {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_CENTER;
        public int offsetX = 0;
        public int offsetY = 110;
    }

    public static class PotionTimers {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_LEFT;
        public int offsetX = 5;
        public int offsetY = 80;
    }

    public static class ArmorDurability {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_LEFT;
        public int offsetX = 5;
        public int offsetY = -40;
    }

    public static class ItemDurability {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -60;
    }

    public static class ExpDisplay {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -50;
    }

    public static class FreezeTimer {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.CENTER;
        public int offsetX = 0;
        public int offsetY = 80;
    }

    public static class ChunkInfo {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_RIGHT;
        public int offsetX = -5;
        public int offsetY = -80;
    }

    public static class DayTime {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_RIGHT;
        public int offsetX = -5;
        public int offsetY = 80;
    }

    public static class NearbyPlayers {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_LEFT;
        public int offsetX = 5;
        public int offsetY = 120;
        public int radius = 64;
    }

    public static class RealClock {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_RIGHT;
        public int offsetX = -5;
        public int offsetY = 95;
    }

    public static class LightLevel {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_LEFT;
        public int offsetX = 5;
        public int offsetY = 135;
    }

    public static class CompassDisplay {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_CENTER;
        public int offsetX = 0;
        public int offsetY = 125;
    }

    public static class SwimDepth {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.CENTER;
        public int offsetX = 0;
        public int offsetY = 95;
    }

    public static class Playtime {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_RIGHT;
        public int offsetX = -5;
        public int offsetY = -100;
    }

    public static class DamageSummary {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_RIGHT;
        public int offsetX = -5;
        public int offsetY = -115;
    }

    public static class GappleCount {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_RIGHT;
        public int offsetX = -5;
        public int offsetY = -130;
    }

    public static class TotemStatus {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_CENTER;
        public int offsetX = 0;
        public int offsetY = 55;
    }

    public static class InventoryCount {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_LEFT;
        public int offsetX = 5;
        public int offsetY = -60;
    }

    public static class StrafingDisplay {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -80;
    }

    public static class VelocityDisplay {
        public boolean enabled = false;
        public HudAnchor anchor = HudAnchor.BOTTOM_LEFT;
        public int offsetX = 5;
        public int offsetY = -75;
    }

    public static class PearlCooldown {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -70;
    }

    public static class ArrowCount {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -70;
    }

    public static class TpsDisplay {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_RIGHT;
        public int offsetX = -5;
        public int offsetY = 110;
    }

    public static class SessionKD {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_RIGHT;
        public int offsetX = -5;
        public int offsetY = -60;
    }

    public static class ShieldStatus {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -75;
    }

    public static class SprintStatus {
        public boolean enabled = false;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -90;
    }

    public static class CustomCrosshair {
        public boolean enabled = false;
        public String style = "GAP";  // CROSS, DOT, CIRCLE, GAP
        public int gap = 4;
        public int size = 6;
        public int thickness = 1;
        public int color = 0xFFFFFFFF;
        public boolean dynamicExpand = true;
    }

    public static class HitFlash {
        public boolean enabled = true;
        public int flashColor = 0xFFFF2222;
    }

    public static class BorderGlow {
        public boolean enabled = false;
        public int color = 0xFFFF2222;
    }

    // ── Фаза 6: Новые классы конфигурации ────────────────────────────────────

    public static class MaceHitEffect {
        public boolean enabled = true;
    }

    public static class CombatLog {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_RIGHT;
        public int offsetX = -5;
        public int offsetY = 130;
    }

    public static class Dps {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_RIGHT;
        public int offsetX = -5;
        public int offsetY = 150;
    }

    public static class IFrames {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_CENTER;
        public int offsetX = 0;
        public int offsetY = 50;
    }

    public static class DeathCoords {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_LEFT;
        public int offsetX = 5;
        public int offsetY = -90;
    }

    public static class ElytraStats {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -55;
    }

    public static class SneakIndicator {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -95;
    }

    public static class WeatherDisplay {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_LEFT;
        public int offsetX = 5;
        public int offsetY = 70;
    }

    public static class DimensionDisplay {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_LEFT;
        public int offsetX = 5;
        public int offsetY = 85;
    }

    public static class HotbarNames {
        public boolean enabled = false;
    }

    public static class AntiAfk {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_RIGHT;
        public int offsetX = -5;
        public int offsetY = -80;
    }

    public static class FishingIndicator {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -85;
    }

    public static class FovDisplay {
        public boolean enabled = false;
        public HudAnchor anchor = HudAnchor.BOTTOM_LEFT;
        public int offsetX = 5;
        public int offsetY = -90;
    }

    public static class Dph {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_RIGHT;
        public int offsetX = -5;
        public int offsetY = 165;
    }

    public static class MaceChain {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -110;
    }

    public static class WeaponDamage {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_LEFT;
        public int offsetX = 5;
        public int offsetY = -75;
    }

    public static class FireTimer {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -100;
    }

    public static class EnchantInfo {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_LEFT;
        public int offsetX = 5;
        public int offsetY = -105;
    }

    public static class SpawnDistance {
        public boolean enabled = false;
        public HudAnchor anchor = HudAnchor.BOTTOM_LEFT;
        public int offsetX = 5;
        public int offsetY = -120;
    }

    public static class KillTimer {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_RIGHT;
        public int offsetX = -5;
        public int offsetY = -95;
    }

    public static class MaxFall {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_RIGHT;
        public int offsetX = -5;
        public int offsetY = -110;
    }

    public static class EntityCount {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_LEFT;
        public int offsetX = 5;
        public int offsetY = 100;
        public double radius = 64;
    }

    public static class MovementDistance {
        public boolean enabled = false;
        public HudAnchor anchor = HudAnchor.BOTTOM_LEFT;
        public int offsetX = 5;
        public int offsetY = -135;
    }

    public static class SaturationDisplay {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_RIGHT;
        public int offsetX = -5;
        public int offsetY = -125;
    }

    public static class PerspectiveIndicator {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_CENTER;
        public int offsetX = 0;
        public int offsetY = 5;
    }

    public static class GamemodeDisplay {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_LEFT;
        public int offsetX = 5;
        public int offsetY = 115;
    }

    public static class BiomeDisplay {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.TOP_LEFT;
        public int offsetX = 5;
        public int offsetY = 130;
    }

    public static class HurtTimeDisplay {
        public boolean enabled = true;
    }

    public static class JumpBoostDisplay {
        public boolean enabled = true;
        public HudAnchor anchor = HudAnchor.BOTTOM_CENTER;
        public int offsetX = 0;
        public int offsetY = -115;
    }

    public static class HealingRateDisplay {
        public boolean enabled = false;
        public HudAnchor anchor = HudAnchor.BOTTOM_RIGHT;
        public int offsetX = -5;
        public int offsetY = -140;
    }
}
