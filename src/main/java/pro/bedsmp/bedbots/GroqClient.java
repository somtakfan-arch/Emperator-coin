package pro.bedsmp.bedbots;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.logging.Logger;

/** Асинхронный клиент к Groq (OpenAI-совместимый эндпоинт). */
public class GroqClient {

    private static final String ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

    private final String apiKey;
    private final String model;
    private final int maxTokens;
    private final double temperature;
    private final Logger logger;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public GroqClient(String apiKey, String model, int maxTokens, double temperature, Logger logger) {
        this.apiKey = apiKey;
        this.model = model;
        this.maxTokens = maxTokens;
        this.temperature = temperature;
        this.logger = logger;
    }

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank() && !apiKey.startsWith("ВСТАВЬ");
    }

    /**
     * Запрашивает у ИИ короткую реплику бота.
     * @param systemPrompt характер бота + правила
     * @param userContent  лог чата + последнее сообщение
     * @return CompletableFuture с текстом реплики, либо null при ошибке
     */
    public CompletableFuture<String> chat(String systemPrompt, String userContent) {
        if (!isConfigured()) {
            return CompletableFuture.completedFuture(null);
        }

        JsonArray messages = new JsonArray();
        messages.add(message("system", systemPrompt));
        messages.add(message("user", userContent));

        JsonObject body = new JsonObject();
        body.addProperty("model", model);
        body.add("messages", messages);
        body.addProperty("max_tokens", maxTokens);
        body.addProperty("temperature", temperature);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(ENDPOINT))
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
                .build();

        return http.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                .thenApply(this::parse)
                .exceptionally(ex -> {
                    logger.fine("[BedBots] Ошибка запроса к Groq: " + ex.getMessage());
                    return null;
                });
    }

    private JsonObject message(String role, String content) {
        JsonObject m = new JsonObject();
        m.addProperty("role", role);
        m.addProperty("content", content);
        return m;
    }

    private String parse(HttpResponse<String> resp) {
        try {
            if (resp.statusCode() != 200) {
                logger.fine("[BedBots] Groq вернул код " + resp.statusCode() + ": " + resp.body());
                return null;
            }
            JsonObject root = JsonParser.parseString(resp.body()).getAsJsonObject();
            JsonElement choices = root.get("choices");
            if (choices == null || !choices.isJsonArray() || choices.getAsJsonArray().isEmpty()) {
                return null;
            }
            String content = choices.getAsJsonArray().get(0).getAsJsonObject()
                    .getAsJsonObject("message").get("content").getAsString();
            return clean(content);
        } catch (Exception e) {
            logger.fine("[BedBots] Не удалось разобрать ответ Groq: " + e.getMessage());
            return null;
        }
    }

    /** Чистим ответ: убираем кавычки, переносы строк, ограничиваем длину. */
    private String clean(String s) {
        if (s == null) return null;
        s = s.trim();
        // иногда модель оборачивает реплику в кавычки
        if (s.length() >= 2 && (s.startsWith("\"") && s.endsWith("\""))) {
            s = s.substring(1, s.length() - 1).trim();
        }
        s = s.replace("\n", " ").replace("\r", " ").trim();
        if (s.length() > 200) {
            s = s.substring(0, 200).trim();
        }
        return s.isEmpty() ? null : s;
    }
}
