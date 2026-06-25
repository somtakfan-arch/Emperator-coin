package me.bedsmp.bedahbots;

import org.bukkit.ChatColor;
import org.bukkit.configuration.file.FileConfiguration;

import java.nio.charset.StandardCharsets;
import java.util.*;

public class BotManager {

    private final List<String> names = new ArrayList<>();
    private final Map<String, UUID> uuids = new LinkedHashMap<>();
    private String coloredPrefix;
    private final Random rng = new Random();

    public void load(FileConfiguration cfg) {
        names.clear();
        uuids.clear();

        coloredPrefix = ChatColor.translateAlternateColorCodes('&',
                cfg.getString("bots.prefix", "&8[&bБот&8] &f"));

        List<String> cfgNames = cfg.getStringList("bots.names");
        if (cfgNames.isEmpty()) {
            cfgNames = List.of("BotTrader");
        }
        for (String n : cfgNames) {
            names.add(n);
            // Deterministic UUID so the same bot name always maps to the same UUID
            uuids.put(n, UUID.nameUUIDFromBytes(("BedAHBot:" + n).getBytes(StandardCharsets.UTF_8)));
        }
    }

    /** Display name (with colour prefix) shown in /ah as the seller. */
    public String displayName(String name) {
        return coloredPrefix + name;
    }

    public String randomName() {
        return names.get(rng.nextInt(names.size()));
    }

    public UUID uuidFor(String name) {
        return uuids.getOrDefault(name,
                UUID.nameUUIDFromBytes(("BedAHBot:" + name).getBytes(StandardCharsets.UTF_8)));
    }

    public Set<UUID> allUUIDs() {
        return new HashSet<>(uuids.values());
    }

    public boolean isBotUUID(UUID uuid) {
        return uuids.containsValue(uuid);
    }

    /** Total active bot listings across all bots. */
    public int totalBotListings() {
        Set<UUID> botUUIDs = allUUIDs();
        return (int) me.elaineqheart.auctionHouse.data.ram.AuctionHouseStorage.getAll()
                .stream()
                .filter(n -> !n.isSold() && !n.isExpired() && botUUIDs.contains(n.getPlayerUUID()))
                .count();
    }
}
