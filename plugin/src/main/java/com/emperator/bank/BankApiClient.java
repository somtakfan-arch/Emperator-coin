package com.emperator.bank;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;
import java.util.logging.Logger;

/** Talks to the Emperator Bank website's plugin API over HTTP. */
public class BankApiClient {

  private final HttpClient http;
  private final String baseUrl;
  private final String apiKey;
  private final Duration timeout;
  private final Logger logger;

  public BankApiClient(String baseUrl, String apiKey, long timeoutMs, Logger logger) {
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    this.apiKey = apiKey;
    this.timeout = Duration.ofMillis(timeoutMs);
    this.logger = logger;
    this.http = HttpClient.newBuilder().connectTimeout(timeout).build();
  }

  public static class ApiException extends Exception {
    public ApiException(String message) {
      super(message);
    }
  }

  private String sendRaw(String method, String path, JSONObject body) throws ApiException {
    try {
      HttpRequest.Builder builder = HttpRequest.newBuilder()
          .uri(URI.create(baseUrl + path))
          .timeout(timeout)
          .header("Authorization", "Bearer " + apiKey)
          .header("Content-Type", "application/json");

      if ("POST".equals(method)) {
        String json = body == null ? "{}" : body.toString();
        builder.POST(HttpRequest.BodyPublishers.ofString(json));
      } else {
        builder.GET();
      }

      HttpResponse<String> response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
      String responseBody = response.body();

      if (response.statusCode() >= 400) {
        String errorMsg = "Ошибка банка (код " + response.statusCode() + ")";
        try {
          errorMsg = new JSONObject(responseBody).optString("error", errorMsg);
        } catch (Exception ignored) {
          // response wasn't a JSON object; fall back to the generic message
        }
        throw new ApiException(errorMsg);
      }
      return (responseBody == null || responseBody.isBlank()) ? "{}" : responseBody;
    } catch (IOException | InterruptedException e) {
      logger.warning("Не удалось связаться с Emperator Bank API: " + e.getMessage());
      throw new ApiException("Банк временно недоступен, попробуйте позже");
    }
  }

  private JSONObject post(String path, JSONObject body) throws ApiException {
    return new JSONObject(sendRaw("POST", path, body));
  }

  private JSONObject get(String path) throws ApiException {
    return new JSONObject(sendRaw("GET", path, null));
  }

  private JSONArray getArray(String path) throws ApiException {
    String raw = sendRaw("GET", path, null);
    return raw.isBlank() ? new JSONArray() : new JSONArray(raw);
  }

  public JSONObject linkAccount(String code, UUID mcUuid, String mcUsername) throws ApiException {
    JSONObject body = new JSONObject();
    body.put("code", code);
    body.put("mcUuid", mcUuid.toString());
    body.put("mcUsername", mcUsername);
    return post("/link", body);
  }

  public JSONObject getBalance(UUID mcUuid) throws ApiException {
    return get("/balance/" + mcUuid);
  }

  public JSONObject deposit(UUID mcUuid, long amount) throws ApiException {
    JSONObject body = new JSONObject();
    body.put("mcUuid", mcUuid.toString());
    body.put("amount", amount);
    return post("/deposit", body);
  }

  public JSONObject withdraw(UUID mcUuid, long amount) throws ApiException {
    JSONObject body = new JSONObject();
    body.put("mcUuid", mcUuid.toString());
    body.put("amount", amount);
    return post("/withdraw", body);
  }

  public JSONObject pay(UUID mcUuid, UUID toMcUuid, long amount) throws ApiException {
    JSONObject body = new JSONObject();
    body.put("mcUuid", mcUuid.toString());
    body.put("toMcUuid", toMcUuid.toString());
    body.put("amount", amount);
    return post("/pay", body);
  }

  public JSONArray top(int limit) throws ApiException {
    return getArray("/top?limit=" + limit);
  }

  public JSONObject claimDaily(UUID mcUuid) throws ApiException {
    return post("/daily/" + mcUuid, new JSONObject());
  }

  public JSONArray recentIncoming(UUID mcUuid, String sinceIso) throws ApiException {
    String path = "/recent/" + mcUuid + (sinceIso != null ? "?since=" + java.net.URLEncoder.encode(sinceIso, java.nio.charset.StandardCharsets.UTF_8) : "");
    return getArray(path);
  }
}
