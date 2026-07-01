package me.bedsmp.bedahbots;

import me.bedsmp.bedahbots.GrokParser.EnchantPick;
import org.bukkit.Material;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

/**
 * Caches "meta-optimal" enchant lists per gear material fetched from Groq.
 * Refresh is async; ListingTask reads from the cache on the main thread safely
 * because the backing map is a ConcurrentHashMap.
 */
public final class MetaEnchantCache {

    // The gear types we ask Groq about — chosen for trading relevance.
    private static final List<Material> GEAR_MATS = List.of(
            Material.NETHERITE_SWORD, Material.DIAMOND_SWORD, Material.IRON_SWORD,
            Material.NETHERITE_AXE,   Material.DIAMOND_AXE,   Material.IRON_AXE,
            Material.NETHERITE_PICKAXE, Material.DIAMOND_PICKAXE, Material.IRON_PICKAXE,
            Material.NETHERITE_SHOVEL, Material.DIAMOND_SHOVEL,
            Material.NETHERITE_HOE,   Material.DIAMOND_HOE,
            Material.MACE, Material.BOW, Material.CROSSBOW, Material.TRIDENT,
            Material.SHIELD, Material.ELYTRA, Material.FISHING_ROD,
            Material.NETHERITE_HELMET,     Material.NETHERITE_CHESTPLATE,
            Material.NETHERITE_LEGGINGS,   Material.NETHERITE_BOOTS,
            Material.DIAMOND_HELMET,       Material.DIAMOND_CHESTPLATE,
            Material.DIAMOND_LEGGINGS,     Material.DIAMOND_BOOTS,
            Material.IRON_HELMET,          Material.IRON_CHESTPLATE,
            Material.IRON_LEGGINGS,        Material.IRON_BOOTS,
            Material.CHAINMAIL_HELMET,     Material.CHAINMAIL_CHESTPLATE,
            Material.CHAINMAIL_LEGGINGS,   Material.CHAINMAIL_BOOTS,
            Material.TURTLE_HELMET
    );

    private final Map<Material, List<EnchantPick>> cache = new ConcurrentHashMap<>();
    private final JavaPlugin plugin;
    private final Logger log;
    private GrokParser parser;

    public MetaEnchantCache(JavaPlugin plugin) {
        this.plugin = plugin;
        this.log = plugin.getLogger();
    }

    public void reloadConfig(FileConfiguration cfg) {
        String apiKey = cfg.getString("chat-requests.api-key", "");
        String model  = cfg.getString("chat-requests.model", "llama-3.3-70b-versatile");
        String apiUrl = cfg.getString("chat-requests.api-url",
                "https://api.groq.com/openai/v1/chat/completions");
        parser = apiKey.isBlank() ? null : new GrokParser(apiKey, model, apiUrl, log);
    }

    /** Fires an async task that queries Groq and refreshes the cache. */
    public void triggerRefresh() {
        if (parser == null) { cache.clear(); return; }
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, this::refresh);
    }

    private void refresh() {
        try {
            log.info("[MetaEnchants] Запрашиваю лучшие чары у Groq...");
            Map<Material, List<EnchantPick>> result = parser.fetchMetaEnchants(GEAR_MATS);
            cache.clear();
            cache.putAll(result);
            log.info("[MetaEnchants] Готово — кэш на " + cache.size() + " предметов.");
        } catch (Exception e) {
            log.warning("[MetaEnchants] Не удалось обновить кэш: " + e.getMessage());
        }
    }

    public List<EnchantPick> getFor(Material mat) {
        return cache.getOrDefault(mat, List.of());
    }

    public boolean has(Material mat) {
        return !cache.getOrDefault(mat, List.of()).isEmpty();
    }
}
