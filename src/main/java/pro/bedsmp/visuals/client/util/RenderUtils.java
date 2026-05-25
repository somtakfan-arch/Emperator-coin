package pro.bedsmp.visuals.client.util;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;

/**
 * Единственное место с низкоуровневым 2D-рисованием.
 * Все HUD-слои рисуют через эти методы, не напрямую.
 */
@Environment(EnvType.CLIENT)
public final class RenderUtils {

    private RenderUtils() {}

    public static void fillRect(GuiGraphics gfx, int x, int y, int w, int h, int argb) {
        gfx.fill(x, y, x + w, y + h, argb);
    }

    public static void drawOutlineRect(GuiGraphics gfx, int x, int y, int w, int h,
                                       int fillArgb, int borderArgb, int borderWidth) {
        if (fillArgb != 0) {
            gfx.fill(x + borderWidth, y + borderWidth,
                    x + w - borderWidth, y + h - borderWidth, fillArgb);
        }
        if (borderArgb != 0) {
            gfx.fill(x, y, x + w, y + borderWidth, borderArgb);
            gfx.fill(x, y + h - borderWidth, x + w, y + h, borderArgb);
            gfx.fill(x, y + borderWidth, x + borderWidth, y + h - borderWidth, borderArgb);
            gfx.fill(x + w - borderWidth, y + borderWidth, x + w, y + h - borderWidth, borderArgb);
        }
    }

    public static void drawProgressBar(GuiGraphics gfx, int x, int y, int w, int h,
                                       float fraction, int bgArgb, int fgArgb) {
        gfx.fill(x, y, x + w, y + h, bgArgb);
        int fillW = (int)(w * Math.max(0f, Math.min(1f, fraction)));
        if (fillW > 0) gfx.fill(x, y, x + fillW, y + h, fgArgb);
    }

    public static void drawText(GuiGraphics gfx, String text, int x, int y, int argb) {
        Font font = Minecraft.getInstance().font;
        gfx.drawString(font, text, x, y, argb, true);
    }

    public static void drawTextNoShadow(GuiGraphics gfx, String text, int x, int y, int argb) {
        Font font = Minecraft.getInstance().font;
        gfx.drawString(font, text, x, y, argb, false);
    }

    public static void drawComponent(GuiGraphics gfx, Component text, int x, int y, int argb) {
        Font font = Minecraft.getInstance().font;
        gfx.drawString(font, text, x, y, argb, true);
    }

    public static int textWidth(String text) {
        return Minecraft.getInstance().font.width(text);
    }

    public static int fontHeight() {
        return Minecraft.getInstance().font.lineHeight;
    }

    /** Прямоугольник с закруглёнными углами. */
    public static void fillRoundedRect(GuiGraphics gfx, int x, int y, int w, int h,
                                       int radius, int argb) {
        if (radius <= 0) {
            fillRect(gfx, x, y, w, h, argb);
            return;
        }
        gfx.fill(x + radius, y, x + w - radius, y + h, argb);
        gfx.fill(x, y + radius, x + radius, y + h - radius, argb);
        gfx.fill(x + w - radius, y + radius, x + w, y + h - radius, argb);
        fillCircleQuarter(gfx, x + radius, y + radius, radius, 0, argb);
        fillCircleQuarter(gfx, x + w - radius, y + radius, radius, 1, argb);
        fillCircleQuarter(gfx, x + radius, y + h - radius, radius, 2, argb);
        fillCircleQuarter(gfx, x + w - radius, y + h - radius, radius, 3, argb);
    }

    private static void fillCircleQuarter(GuiGraphics gfx, int cx, int cy, int r, int q, int argb) {
        for (int dy = 0; dy <= r; dy++) {
            int dx = (int) Math.sqrt((double)r * r - (double)dy * dy);
            int x1 = (q == 0 || q == 2) ? cx - dx : cx;
            int x2 = (q == 1 || q == 3) ? cx + dx : cx;
            int y1 = (q == 0 || q == 1) ? cy - r + dy : cy + dy;
            gfx.fill(Math.min(x1, cx), y1, Math.max(x2, cx), y1 + 1, argb);
        }
    }
}
