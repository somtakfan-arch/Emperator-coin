package pro.bedsmp.visuals.client.theme;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import pro.bedsmp.visuals.BedSMPVisualsClient;

/** Пресеты цветовых тем. */
@Environment(EnvType.CLIENT)
public enum ColorTheme {
    BEDSMP  (0xFF00DCCC, 0xFFFFFFFF, 0xBB0A0A1A, 0xFFFF4444, 0xFF44FF44),
    DARK    (0xFF888888, 0xFFCCCCCC, 0xCC000000, 0xFFCC3333, 0xFF33CC33),
    LIGHT   (0xFF2244AA, 0xFF222222, 0xDDFFFFFF, 0xFFCC2222, 0xFF228822),
    NEON    (0xFF00FF88, 0xFF00FF88, 0xAA000011, 0xFFFF0066, 0xFF00FF44),
    MINIMAL (0xFFAAAAAA, 0xFFFFFFFF, 0x880A0A0A, 0xFFFF6666, 0xFF66FF66),
    CUSTOM  (0xFF00DCCC, 0xFFFFFFFF, 0xBB0A0A1A, 0xFFFF4444, 0xFF44FF44);

    public final int accent;
    public final int text;
    public final int background;
    public final int danger;
    public final int success;

    ColorTheme(int accent, int text, int background, int danger, int success) {
        this.accent = accent;
        this.text = text;
        this.background = background;
        this.danger = danger;
        this.success = success;
    }

    /** Получить активную тему из конфига. */
    public static ColorTheme current() {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null) return BEDSMP;
        try {
            return valueOf(cfg.colorTheme);
        } catch (IllegalArgumentException e) {
            return BEDSMP;
        }
    }

    /** Версия для Custom-темы — создаёт объект с нужными полями. */
    public static int accent() { return active().accent; }
    public static int text()   { return active().text; }
    public static int bg()     { return active().background; }
    public static int danger() { return active().danger; }
    public static int success(){ return active().success; }

    private static ColorTheme active() {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null) return BEDSMP;
        try {
            ColorTheme theme = valueOf(cfg.colorTheme);
            if (theme == CUSTOM) {
                // Перегружаем поля через трюк — enum нельзя переопределить, используем отдельный синглтон
                return ThemeRegistry.getCustomTheme();
            }
            return theme;
        } catch (IllegalArgumentException e) {
            return BEDSMP;
        }
    }
}
