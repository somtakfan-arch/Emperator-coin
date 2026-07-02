package me.bedsmp.bedahbots;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.bukkit.Material;
import org.bukkit.enchantments.Enchantment;

import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;
import java.util.stream.Collectors;

/** Sends an item request to the xAI Grok API and parses the structured JSON response. */
public final class GrokParser {

    public record EnchantPick(Enchantment enchantment, int level) {}
    public record ParseResult(Material material, int amount, List<EnchantPick> enchants) {}

    // System prompt teaches Grok the Bukkit enum names and Russian→English translations.
    private static final String SYSTEM_PROMPT = """
            Parse a Minecraft item request (Russian or English) and return ONLY raw JSON — no markdown, no code blocks, no explanation.
            Format: {"material":"BUKKIT_MATERIAL","amount":1,"enchants":[{"id":"BUKKIT_ENCHANTMENT","level":1}]}
            Use exact Bukkit Material enum names (UPPERCASE_UNDERSCORES).
            Use exact Bukkit Enchantment field names (UPPERCASE_UNDERSCORES).

            Examples:
            "булаву с починкой 2" → {"material":"MACE","amount":1,"enchants":[{"id":"MENDING","level":2}]}
            "алмазный меч с остротой 5" → {"material":"DIAMOND_SWORD","amount":1,"enchants":[{"id":"SHARPNESS","level":5}]}
            "незеритовую кирку с эффективностью 10" → {"material":"NETHERITE_PICKAXE","amount":1,"enchants":[{"id":"EFFICIENCY","level":10}]}
            "10 стрел" → {"material":"ARROW","amount":10,"enchants":[]}
            "щит с прочностью 3" → {"material":"SHIELD","amount":1,"enchants":[{"id":"UNBREAKING","level":3}]}

            Russian→Bukkit items:
            булава=MACE, меч=SWORD, лук=BOW, арбалет=CROSSBOW, трезубец=TRIDENT, щит=SHIELD,
            кирка=PICKAXE, лопата=SHOVEL, топор=AXE, мотыга=HOE, удочка=FISHING_ROD,
            шлем=HELMET, нагрудник=CHESTPLATE, поножи=LEGGINGS, ботинки/сапоги=BOOTS, элитры=ELYTRA,
            алмазный=DIAMOND, незеритовый=NETHERITE, железный=IRON, золотой=GOLDEN, каменный=STONE, деревянный=WOODEN,
            стрела=ARROW, арбалетный болт=CROSSBOW,
            тотем=TOTEM_OF_UNDYING, жемчуг=ENDER_PEARL, незеритовый слиток=NETHERITE_INGOT,
            яблоко=APPLE, золотое яблоко=GOLDEN_APPLE, зачарованное яблоко=ENCHANTED_GOLDEN_APPLE,
            лазурит=LAPIS_LAZULI, алмаз=DIAMOND, изумруд=EMERALD.

            Russian→Bukkit enchants:
            починка=MENDING, острота=SHARPNESS, смерть=SMITE, огонь=FIRE_ASPECT,
            кара/смерть членистоногих=BANE_OF_ARTHROPODS, отдача=KNOCKBACK, зачистка=SWEEPING_EDGE,
            эффективность=EFFICIENCY, шёлковое касание=SILK_TOUCH, удача=FORTUNE, прочность=UNBREAKING,
            сила=POWER, откидывание=PUNCH, бесконечность=INFINITY,
            лояльность=LOYALTY, пронзание=IMPALING, круговорот=RIPTIDE, гроза=CHANNELING,
            многозарядность=MULTISHOT, скорость зарядки=QUICK_CHARGE, пробивание=PIERCING,
            плотность=DENSITY, пробой=BREACH, взрыв ветра=WIND_BURST,
            добыча/мародёрство=LOOTING, удача в море=LUCK_OF_THE_SEA, притяжение=LURE,
            защита=PROTECTION, защита от огня=FIRE_PROTECTION, защита от снарядов=PROJECTILE_PROTECTION,
            взрывная защита=BLAST_PROTECTION, перышко=FEATHER_FALLING, дыхание=RESPIRATION,
            водное сродство=AQUA_AFFINITY, шипы=THORNS, поступь душ=SOUL_SPEED,
            быстрый шаг=SWIFT_SNEAK, оковы=BINDING_CURSE, исчезновение=VANISHING_CURSE.
            """;

    private static final Gson GSON = new Gson();

    private final HttpClient http;
    private final String apiKey;
    private final String model;
    private final String apiUrl;
    private final Logger log;

    public GrokParser(String apiKey, String model, String apiUrl, Logger log) {
        this.apiKey = apiKey;
        this.model = model;
        this.apiUrl = apiUrl;
        this.log = log;
        this.http = HttpClient.newBuilder()
                .proxy(ProxySelector.getDefault())
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    /**
     * Calls Grok with the player's item request and returns the parsed result.
     * Blocks the calling thread; must be called from an async context.
     */
    public ParseResult parse(String playerRequest) throws Exception {
        JsonObject body = new JsonObject();
        body.addProperty("model", model);
        body.addProperty("max_tokens", 300);

        JsonArray messages = new JsonArray();
        JsonObject sys = new JsonObject();
        sys.addProperty("role", "system");
        sys.addProperty("content", SYSTEM_PROMPT);
        JsonObject usr = new JsonObject();
        usr.addProperty("role", "user");
        usr.addProperty("content", playerRequest);
        messages.add(sys);
        messages.add(usr);
        body.add("messages", messages);

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl))
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(20))
                .POST(HttpRequest.BodyPublishers.ofString(GSON.toJson(body)))
                .build();

        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() != 200) {
            throw new Exception("HTTP " + resp.statusCode() + ": " + resp.body().substring(0, Math.min(200, resp.body().length())));
        }

        JsonObject root = JsonParser.parseString(resp.body()).getAsJsonObject();
        String content = root.getAsJsonArray("choices")
                .get(0).getAsJsonObject()
                .getAsJsonObject("message")
                .get("content").getAsString().trim();

        // Strip markdown code fence if model adds one despite instructions
        if (content.startsWith("```")) {
            content = content.replaceAll("(?s)```[\\w]*\\n?", "").trim();
        }

        JsonObject parsed = JsonParser.parseString(content).getAsJsonObject();

        String matName = parsed.get("material").getAsString().toUpperCase();
        Material material = Material.matchMaterial(matName);
        if (material == null) throw new Exception("неизвестный предмет: " + matName);

        int amount = parsed.has("amount") ? Math.max(1, parsed.get("amount").getAsInt()) : 1;
        amount = Math.min(amount, material.getMaxStackSize());

        List<EnchantPick> enchants = new ArrayList<>();
        if (parsed.has("enchants") && !parsed.get("enchants").isJsonNull()) {
            for (var el : parsed.getAsJsonArray("enchants")) {
                JsonObject eo = el.getAsJsonObject();
                String eid = eo.get("id").getAsString().toUpperCase();
                @SuppressWarnings("deprecation")
                Enchantment ench = Enchantment.getByName(eid);
                if (ench == null) {
                    log.warning("GrokParser: неизвестное зачарование '" + eid + "' — пропускаю");
                    continue;
                }
                int level = eo.has("level") ? Math.max(1, eo.get("level").getAsInt()) : 1;
                enchants.add(new EnchantPick(ench, level));
            }
        }

        return new ParseResult(material, amount, enchants);
    }

    private static final String META_PROMPT = """
            You are a Minecraft 1.21 PvP and survival expert. For each item I give you, return the 2-3 best enchantments with optimal levels that top players actually use in competitive play.
            Return ONLY raw JSON — no markdown, no code blocks, no explanation.
            Format: {"MATERIAL_NAME": [{"id": "ENCHANT_ID", "level": N}, ...], ...}
            Use exact Bukkit API enum names (UPPERCASE_UNDERSCORES). Only include enchants valid for the item type.
            Key meta picks:
            NETHERITE_SWORD/DIAMOND_SWORD → SHARPNESS 5, UNBREAKING 3, MENDING 1
            MACE → DENSITY 5, BREACH 4, WIND_BURST 1
            BOW → POWER 5, INFINITY 1, FLAME 1
            CROSSBOW → MULTISHOT 1, QUICK_CHARGE 3, UNBREAKING 3
            TRIDENT → LOYALTY 3, IMPALING 5, MENDING 1
            NETHERITE_SPEAR/DIAMOND_SPEAR → SHARPNESS 5, LUNGE 3, MENDING 1
            IRON_SPEAR → SHARPNESS 4, UNBREAKING 3, MENDING 1
            NETHERITE_PICKAXE/DIAMOND_PICKAXE → EFFICIENCY 5, UNBREAKING 3, MENDING 1
            NETHERITE_AXE/DIAMOND_AXE → EFFICIENCY 5, SHARPNESS 5, MENDING 1
            NETHERITE_HELMET/DIAMOND_HELMET → PROTECTION 4, UNBREAKING 3, RESPIRATION 3
            NETHERITE_CHESTPLATE/DIAMOND_CHESTPLATE → PROTECTION 4, UNBREAKING 3, MENDING 1
            NETHERITE_LEGGINGS/DIAMOND_LEGGINGS → PROTECTION 4, UNBREAKING 3, SWIFT_SNEAK 3
            NETHERITE_BOOTS/DIAMOND_BOOTS → PROTECTION 4, FEATHER_FALLING 4, DEPTH_STRIDER 3
            ELYTRA → UNBREAKING 3, MENDING 1
            SHIELD → UNBREAKING 3, MENDING 1
            FISHING_ROD → LURE 3, LUCK_OF_THE_SEA 3, MENDING 1
            """;

    private static final String PRICE_PROMPT = """
            You are a Minecraft SMP economy expert. Players on this server have ~10,000,000 coins each.
            Set AUCTION HOUSE base prices (before any markup) that feel meaningful in a 10M economy.

            Reference prices (approximate /sell values on this server):
            IRON_INGOT≈1500, GOLD_INGOT≈3000, DIAMOND≈12000, NETHERITE_INGOT≈90000.

            Target price ranges for base (pre-markup) auction prices:
            - ENCHANTED_BOOK: 10000-50000
            - Iron gear (sword/axe/pickaxe): 6000-10000
            - Diamond gear: 40000-70000
            - Netherite gear: 120000-200000
            - MACE (rare vault drop): 250000-400000
            - ELYTRA: 500000-800000
            - TOTEM_OF_UNDYING: 400000-600000
            - NETHER_STAR: 800000-1200000
            - BEACON: 1000000-1500000
            - ARROW/FIREWORK_ROCKET/GLOWSTONE: 100-500
            - Spears: same tier as equivalent swords
            - Minimum: 500

            Return ONLY raw JSON: {"MATERIAL_NAME": price_as_number, ...}
            No explanation, no markdown.
            """;

    /**
     * Queries Groq for the best enchants for each material in the list.
     * Blocks the calling thread — must be called from an async context.
     */
    public Map<Material, List<EnchantPick>> fetchMetaEnchants(List<Material> materials) throws Exception {
        String matList = materials.stream().map(Material::name).collect(Collectors.joining(", "));

        JsonObject body = new JsonObject();
        body.addProperty("model", model);
        body.addProperty("max_tokens", 2000);

        JsonArray messages = new JsonArray();
        JsonObject sys = new JsonObject();
        sys.addProperty("role", "system");
        sys.addProperty("content", META_PROMPT);
        JsonObject usr = new JsonObject();
        usr.addProperty("role", "user");
        usr.addProperty("content", matList);
        messages.add(sys);
        messages.add(usr);
        body.add("messages", messages);

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl))
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(30))
                .POST(HttpRequest.BodyPublishers.ofString(GSON.toJson(body)))
                .build();

        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() != 200) {
            throw new Exception("HTTP " + resp.statusCode() + ": " + resp.body().substring(0, Math.min(300, resp.body().length())));
        }

        JsonObject root = JsonParser.parseString(resp.body()).getAsJsonObject();
        String content = root.getAsJsonArray("choices")
                .get(0).getAsJsonObject()
                .getAsJsonObject("message")
                .get("content").getAsString().trim();

        if (content.startsWith("```")) {
            content = content.replaceAll("(?s)```[\\w]*\\n?", "").trim();
        }

        Map<Material, List<EnchantPick>> result = new HashMap<>();
        JsonObject parsed = JsonParser.parseString(content).getAsJsonObject();
        for (String key : parsed.keySet()) {
            Material mat = Material.matchMaterial(key.toUpperCase());
            if (mat == null) continue;
            List<EnchantPick> picks = new ArrayList<>();
            for (var el : parsed.getAsJsonArray(key)) {
                JsonObject eo = el.getAsJsonObject();
                String eid = eo.get("id").getAsString().toUpperCase();
                @SuppressWarnings("deprecation")
                Enchantment ench = Enchantment.getByName(eid);
                if (ench == null) continue;
                int level = eo.has("level") ? Math.max(1, eo.get("level").getAsInt()) : 1;
                picks.add(new EnchantPick(ench, level));
            }
            if (!picks.isEmpty()) result.put(mat, picks);
        }
        return result;
    }

    /**
     * Queries Groq for market prices of the given materials.
     * Blocks the calling thread — must be called from an async context.
     */
    public Map<Material, Double> fetchItemPrices(List<Material> materials) throws Exception {
        String matList = materials.stream().map(Material::name).collect(Collectors.joining(", "));

        JsonObject body = new JsonObject();
        body.addProperty("model", model);
        body.addProperty("max_tokens", 2000);

        JsonArray messages = new JsonArray();
        JsonObject sys = new JsonObject();
        sys.addProperty("role", "system");
        sys.addProperty("content", PRICE_PROMPT);
        JsonObject usr = new JsonObject();
        usr.addProperty("role", "user");
        usr.addProperty("content", matList);
        messages.add(sys);
        messages.add(usr);
        body.add("messages", messages);

        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl))
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(30))
                .POST(HttpRequest.BodyPublishers.ofString(GSON.toJson(body)))
                .build();

        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() != 200) {
            throw new Exception("HTTP " + resp.statusCode() + ": " + resp.body().substring(0, Math.min(300, resp.body().length())));
        }

        JsonObject root = JsonParser.parseString(resp.body()).getAsJsonObject();
        String content = root.getAsJsonArray("choices")
                .get(0).getAsJsonObject()
                .getAsJsonObject("message")
                .get("content").getAsString().trim();

        if (content.startsWith("```")) {
            content = content.replaceAll("(?s)```[\\w]*\\n?", "").trim();
        }

        Map<Material, Double> result = new HashMap<>();
        JsonObject parsed = JsonParser.parseString(content).getAsJsonObject();
        for (String key : parsed.keySet()) {
            Material mat = Material.matchMaterial(key.toUpperCase());
            if (mat == null) continue;
            try {
                double price = parsed.get(key).getAsDouble();
                if (price > 0) result.put(mat, price);
            } catch (Exception ignored) {}
        }
        return result;
    }
}
