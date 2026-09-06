package ru.bedsmp.noenchants;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.serializer.legacy.LegacyComponentSerializer;

/** Мелкий помощник для цветных сообщений с кодами &. */
public final class Text {

    private Text() {
    }

    public static Component component(String legacy) {
        return LegacyComponentSerializer.legacyAmpersand().deserialize(legacy == null ? "" : legacy);
    }
}
