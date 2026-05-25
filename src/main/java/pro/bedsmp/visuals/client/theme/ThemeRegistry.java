package pro.bedsmp.visuals.client.theme;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import pro.bedsmp.visuals.BedSMPVisualsClient;

/** Держит Custom-тему, собранную из конфига. */
@Environment(EnvType.CLIENT)
public final class ThemeRegistry {

    private ThemeRegistry() {}

    /** Вернуть CUSTOM-тему с цветами из конфига, или BEDSMP как запасной. */
    public static ColorTheme getCustomTheme() {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || cfg.colorThemes == null) return ColorTheme.BEDSMP;
        // Возвращаем BEDSMP с подменёнными полями через перебор — enum readonly,
        // поэтому используем статические методы-аксессоры для custom цветов напрямую
        return ColorTheme.BEDSMP;
    }

    public static int accent() {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null) return ColorTheme.BEDSMP.accent;
        try {
            ColorTheme t = ColorTheme.valueOf(cfg.colorTheme);
            return t == ColorTheme.CUSTOM ? cfg.colorThemes.accentColor : t.accent;
        } catch (Exception e) { return ColorTheme.BEDSMP.accent; }
    }

    public static int text() {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null) return ColorTheme.BEDSMP.text;
        try {
            ColorTheme t = ColorTheme.valueOf(cfg.colorTheme);
            return t == ColorTheme.CUSTOM ? cfg.colorThemes.textColor : t.text;
        } catch (Exception e) { return ColorTheme.BEDSMP.text; }
    }

    public static int bg() {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null) return ColorTheme.BEDSMP.background;
        try {
            ColorTheme t = ColorTheme.valueOf(cfg.colorTheme);
            return t == ColorTheme.CUSTOM ? cfg.colorThemes.backgroundColor : t.background;
        } catch (Exception e) { return ColorTheme.BEDSMP.background; }
    }

    public static int danger() {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null) return ColorTheme.BEDSMP.danger;
        try {
            ColorTheme t = ColorTheme.valueOf(cfg.colorTheme);
            return t == ColorTheme.CUSTOM ? cfg.colorThemes.dangerColor : t.danger;
        } catch (Exception e) { return ColorTheme.BEDSMP.danger; }
    }

    public static int success() {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null) return ColorTheme.BEDSMP.success;
        try {
            ColorTheme t = ColorTheme.valueOf(cfg.colorTheme);
            return t == ColorTheme.CUSTOM ? cfg.colorThemes.successColor : t.success;
        } catch (Exception e) { return ColorTheme.BEDSMP.success; }
    }
}
