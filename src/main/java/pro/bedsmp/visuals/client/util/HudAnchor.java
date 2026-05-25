package pro.bedsmp.visuals.client.util;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.Minecraft;

/** Якоря для позиционирования HUD-элементов. */
@Environment(EnvType.CLIENT)
public enum HudAnchor {
    TOP_LEFT,
    TOP_CENTER,
    TOP_RIGHT,
    MIDDLE_LEFT,
    CENTER,
    MIDDLE_RIGHT,
    BOTTOM_LEFT,
    BOTTOM_CENTER,
    BOTTOM_RIGHT;

    /** Вычислить абсолютную X-позицию с учётом якоря и смещения. */
    public int resolveX(int offsetX, int elementWidth) {
        int sw = Minecraft.getInstance().getWindow().getGuiScaledWidth();
        return switch (this) {
            case TOP_LEFT, MIDDLE_LEFT, BOTTOM_LEFT -> offsetX;
            case TOP_CENTER, CENTER, BOTTOM_CENTER -> sw / 2 - elementWidth / 2 + offsetX;
            case TOP_RIGHT, MIDDLE_RIGHT, BOTTOM_RIGHT -> sw - elementWidth + offsetX;
        };
    }

    /** Вычислить абсолютную Y-позицию с учётом якоря и смещения. */
    public int resolveY(int offsetY, int elementHeight) {
        int sh = Minecraft.getInstance().getWindow().getGuiScaledHeight();
        return switch (this) {
            case TOP_LEFT, TOP_CENTER, TOP_RIGHT -> offsetY;
            case MIDDLE_LEFT, CENTER, MIDDLE_RIGHT -> sh / 2 - elementHeight / 2 + offsetY;
            case BOTTOM_LEFT, BOTTOM_CENTER, BOTTOM_RIGHT -> sh - elementHeight + offsetY;
        };
    }
}
