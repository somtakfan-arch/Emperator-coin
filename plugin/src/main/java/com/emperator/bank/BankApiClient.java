package com.emperator.bank;

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

  private JSONObject post(String path, JSONObject body) throws ApiException {
    return send("POST", path, body);
  }

  private JSONObject get(String path) throws ApiException {
    return send("GET", path, null);
  }

  private JSONObject send(String method, String path, JSONObject body) throws ApiException {
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
      JSONObject json = response.body() == null || response.body().isBlank()
          ? new JSONObject()
          : new JSONObject(response.body());

      if (response.statusCode() >= 400) {
        throw new ApiException(json.optString("error", "Ошибка банка (код " + response.statusCode() + ")"));
      }
      return json;
    } catch (IOException | InterruptedException e) {
      logger.warning("Не удалось связаться с Emperator Bank API: " + e.getMessage());
      throw new ApiException("Банк временно недоступен, попробуйте позже");
    }
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
}
