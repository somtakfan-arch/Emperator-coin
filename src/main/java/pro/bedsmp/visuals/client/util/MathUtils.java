package pro.bedsmp.visuals.client.util;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;

/** Математические утилиты: интерполяция, easing. */
@Environment(EnvType.CLIENT)
public final class MathUtils {

    private MathUtils() {}

    public static float lerp(float from, float to, float t) {
        return from + (to - from) * clamp(t, 0f, 1f);
    }

    public static double lerp(double from, double to, double t) {
        return from + (to - from) * clamp(t, 0.0, 1.0);
    }

    public static float clamp(float v, float min, float max) {
        return Math.max(min, Math.min(max, v));
    }

    public static double clamp(double v, double min, double max) {
        return Math.max(min, Math.min(max, v));
    }

    public static int clamp(int v, int min, int max) {
        return Math.max(min, Math.min(max, v));
    }

    /** Ease-out квадратичный — плавное торможение. */
    public static float easeOut(float t) {
        t = clamp(t, 0f, 1f);
        return 1f - (1f - t) * (1f - t);
    }

    /** Ease-in квадратичный — плавный разгон. */
    public static float easeIn(float t) {
        t = clamp(t, 0f, 1f);
        return t * t;
    }

    /** Нормализовать прогресс по тикам. */
    public static float progress(int currentTick, int maxTick) {
        if (maxTick <= 0) return 1f;
        return clamp((float) currentTick / maxTick, 0f, 1f);
    }

    /** Угол между двумя направлениями в диапазоне [-180, 180]. */
    public static float angleDiff(float from, float to) {
        float diff = to - from;
        while (diff > 180f) diff -= 360f;
        while (diff < -180f) diff += 360f;
        return diff;
    }
}
