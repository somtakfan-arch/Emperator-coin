package pro.bedsmp.visuals.client.util;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;

/** Утилиты для работы с цветами ARGB. */
@Environment(EnvType.CLIENT)
public final class ColorUtils {

    private ColorUtils() {}

    public static int alpha(int argb) { return (argb >> 24) & 0xFF; }
    public static int red(int argb)   { return (argb >> 16) & 0xFF; }
    public static int green(int argb) { return (argb >> 8) & 0xFF; }
    public static int blue(int argb)  { return argb & 0xFF; }

    /** Применить коэффициент прозрачности (0..1) к существующей альфе цвета. */
    public static int withAlpha(int argb, float alphaFactor) {
        int a = (int)(alpha(argb) * alphaFactor) & 0xFF;
        return (a << 24) | (argb & 0x00FFFFFF);
    }

    /** Линейная интерполяция двух ARGB-цветов. */
    public static int lerp(int from, int to, float t) {
        t = Math.max(0f, Math.min(1f, t));
        int a = lerp8(alpha(from), alpha(to), t);
        int r = lerp8(red(from), red(to), t);
        int g = lerp8(green(from), green(to), t);
        int b = lerp8(blue(from), blue(to), t);
        return (a << 24) | (r << 16) | (g << 8) | b;
    }

    private static int lerp8(int from, int to, float t) {
        return (int)(from + (to - from) * t);
    }

    /** Пульсирующий цвет: значение синуса возвращает коэффициент [0..1]. */
    public static float pulse(float timeSeconds, float speed) {
        return (float)(0.5 + 0.5 * Math.sin(timeSeconds * speed * Math.PI * 2));
    }

    /** Собрать ARGB из компонентов. */
    public static int argb(int a, int r, int g, int b) {
        return ((a & 0xFF) << 24) | ((r & 0xFF) << 16) | ((g & 0xFF) << 8) | (b & 0xFF);
    }

    /** Цвет HP-полоски: зелёный → жёлтый → красный. */
    public static int healthBarColor(float fraction) {
        if (fraction > 0.5f) {
            return lerp(0xFFFFAA00, 0xFF44FF44, (fraction - 0.5f) * 2f);
        } else {
            return lerp(0xFFFF4444, 0xFFFFAA00, fraction * 2f);
        }
    }
}
