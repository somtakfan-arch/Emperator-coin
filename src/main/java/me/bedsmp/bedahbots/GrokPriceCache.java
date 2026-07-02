package me.bedsmp.bedahbots;

import org.bukkit.Material;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

/**
 * Queries Groq for fair market prices of items not found in worth.yml.
 * Async refresh; WorthLoader reads the cache on the main thread safely.
 */
public final class GrokPriceCache {

    private final Map<Material, Double> cache = new ConcurrentHashMap<>();
    private final JavaPlugin plugin;
    private final Logger log;
    private GrokParser parser;

    public GrokPriceCache(JavaPlugin plugin) {
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

    /** Fires an async task to fetch prices for the given materials from Groq. */
    public void triggerRefresh(List<Material> materials) {
        if (parser == null || materials.isEmpty()) return;
        List<Material> copy = List.copyOf(materials);
        plugin.getServer().getScheduler().runTaskAsynchronously(plugin, () -> refresh(copy));
    }

    private static final int BATCH_SIZE = 30;

    private void refresh(List<Material> materials) {
        int total = 0;
        for (int i = 0; i < materials.size(); i += BATCH_SIZE) {
            List<Material> batch = materials.subList(i, Math.min(i + BATCH_SIZE, materials.size()));
            try {
                log.info("[GrokPrices] Запрашиваю цены (" + (i + 1) + "-" + (i + batch.size()) + " из " + materials.size() + ")...");
                Map<Material, Double> result = parser.fetchItemPrices(new ArrayList<>(batch));
                cache.putAll(result);
                total += result.size();
            } catch (Exception e) {
                log.warning("[GrokPrices] Батч " + (i / BATCH_SIZE + 1) + " не удался: " + e.getMessage());
            }
        }
        log.info("[GrokPrices] Готово — цены для " + total + " предметов.");
    }

    public double getPrice(Material mat) {
        return cache.getOrDefault(mat, -1.0);
    }

    public boolean has(Material mat) {
        return cache.containsKey(mat);
    }
}
