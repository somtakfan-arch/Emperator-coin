package com.bedregen.data;

import org.bukkit.Location;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Holds pos1/pos2 per player in memory. Not persisted across restarts by design.
 */
public final class PositionManager {

    private final Map<UUID, Location> pos1 = new HashMap<>();
    private final Map<UUID, Location> pos2 = new HashMap<>();

    public void setPos1(UUID uuid, Location location) {
        pos1.put(uuid, location.clone());
    }

    public void setPos2(UUID uuid, Location location) {
        pos2.put(uuid, location.clone());
    }

    public Location getPos1(UUID uuid) {
        return pos1.get(uuid);
    }

    public Location getPos2(UUID uuid) {
        return pos2.get(uuid);
    }

    public void clear(UUID uuid) {
        pos1.remove(uuid);
        pos2.remove(uuid);
    }
}
