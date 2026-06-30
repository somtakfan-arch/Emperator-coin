package com.bedsmp.unbreakablestand;

import org.bukkit.NamespacedKey;
import org.bukkit.plugin.Plugin;

public final class Keys {

    public final NamespacedKey unbreakableStand;
    public final NamespacedKey standBreaker;

    public Keys(Plugin plugin) {
        this.unbreakableStand = new NamespacedKey(plugin, "unbreakable_stand");
        this.standBreaker = new NamespacedKey(plugin, "stand_breaker");
    }
}
