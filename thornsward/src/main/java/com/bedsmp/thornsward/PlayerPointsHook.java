package com.bedsmp.thornsward;

import org.bukkit.plugin.Plugin;
import org.bukkit.plugin.java.JavaPlugin;
import org.jetbrains.annotations.Nullable;

import java.lang.reflect.Method;
import java.util.UUID;

final class PlayerPointsHook {

    private final Object api;
    private final Method lookMethod;
    private final Method takeMethod;

    private PlayerPointsHook(Object api) throws ReflectiveOperationException {
        this.api        = api;
        this.lookMethod = api.getClass().getMethod("look", UUID.class);
        this.takeMethod = api.getClass().getMethod("take", UUID.class, int.class);
    }

    static @Nullable PlayerPointsHook create(JavaPlugin plugin) {
        try {
            Plugin pp = plugin.getServer().getPluginManager().getPlugin("PlayerPoints");
            if (pp == null || !pp.isEnabled()) {
                plugin.getLogger().warning("PlayerPoints не найден — магазин отключён.");
                return null;
            }
            Object api = pp.getClass().getMethod("getAPI").invoke(pp);
            plugin.getLogger().info("PlayerPoints подключён успешно.");
            return new PlayerPointsHook(api);
        } catch (Exception e) {
            plugin.getLogger().warning("Не удалось подключиться к PlayerPoints: " + e.getMessage());
            return null;
        }
    }

    int look(UUID uuid) {
        try { return (int) lookMethod.invoke(api, uuid); }
        catch (Exception e) { return 0; }
    }

    boolean take(UUID uuid, int amount) {
        try { return (boolean) takeMethod.invoke(api, uuid, amount); }
        catch (Exception e) { return false; }
    }
}
