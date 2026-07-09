package com.emperator.bank;

import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.plugin.java.JavaPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Polls the bank API for each online, linked player and announces new
 * incoming transfers in chat. There is no push channel from the (serverless)
 * backend to the game server, so a periodic poll is the simplest reliable option.
 */
public class NotificationService implements Listener {

  private static final String PREFIX = ChatColor.GOLD + "[Emperator Bank] " + ChatColor.RESET;

  private final JavaPlugin plugin;
  private final BankApiClient api;
  private final Map<UUID, String> lastCheckedAt = new ConcurrentHashMap<>();

  public NotificationService(JavaPlugin plugin, BankApiClient api) {
    this.plugin = plugin;
    this.api = api;
  }

  @EventHandler
  public void onJoin(PlayerJoinEvent event) {
    // Only notify about transfers received after this join, not old history.
    lastCheckedAt.put(event.getPlayer().getUniqueId(), Instant.now().toString());
  }

  @EventHandler
  public void onQuit(PlayerQuitEvent event) {
    lastCheckedAt.remove(event.getPlayer().getUniqueId());
  }

  public void startPolling(long periodTicks) {
    Bukkit.getScheduler().runTaskTimerAsynchronously(plugin, this::pollOnce, periodTicks, periodTicks);
  }

  private void pollOnce() {
    for (Player player : Bukkit.getOnlinePlayers()) {
      UUID uuid = player.getUniqueId();
      String since = lastCheckedAt.get(uuid);
      try {
        JSONArray recent = api.recentIncoming(uuid, since);
        if (recent.length() == 0) continue;

        String latest = since;
        for (int i = 0; i < recent.length(); i++) {
          JSONObject tx = recent.getJSONObject(i);
          long amount = tx.optLong("amount");
          String from = tx.optString("from_username", null);
          String createdAt = tx.optString("created_at", null);
          if (createdAt != null) latest = createdAt;

          String message = PREFIX + "Вам зачислено " + String.format(Locale.US, "%,d", amount) +
              " EMP" + (from != null ? " от " + from : "");
          Bukkit.getScheduler().runTask(plugin, () -> player.sendMessage(message));
        }
        lastCheckedAt.put(uuid, latest);
      } catch (BankApiClient.ApiException e) {
        // Not linked yet, or the bank API is briefly unreachable - skip quietly.
      }
    }
  }
}
