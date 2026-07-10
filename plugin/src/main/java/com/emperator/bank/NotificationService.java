package com.emperator.bank;

import net.milkbowl.vault.economy.Economy;
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
 * Polls the bank API for each online, linked player to: (1) announce new
 * incoming transfers in chat, and (2) fulfill deposit/withdraw requests the
 * player created on the website. There is no push channel from the
 * (serverless) backend to the game server, so a periodic poll is the
 * simplest reliable option for both.
 */
public class NotificationService implements Listener {

  private static final String PREFIX = ChatColor.GOLD + "[Emperator Bank] " + ChatColor.RESET;

  private final JavaPlugin plugin;
  private final BankApiClient api;
  private final Economy economy;
  private final Map<UUID, String> lastCheckedAt = new ConcurrentHashMap<>();

  public NotificationService(JavaPlugin plugin, BankApiClient api, Economy economy) {
    this.plugin = plugin;
    this.api = api;
    this.economy = economy;
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
      checkIncomingTransfers(player, uuid);
      checkPendingGameOps(player, uuid);
    }
  }

  private void checkIncomingTransfers(Player player, UUID uuid) {
    String since = lastCheckedAt.get(uuid);
    try {
      JSONArray recent = api.recentIncoming(uuid, since);
      if (recent.length() == 0) return;

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

  private void checkPendingGameOps(Player player, UUID uuid) {
    if (economy == null) return;
    JSONArray pending;
    try {
      pending = api.pendingOps(uuid);
    } catch (BankApiClient.ApiException e) {
      return; // not linked yet, or bank unreachable - try again next poll
    }

    for (int i = 0; i < pending.length(); i++) {
      JSONObject op = pending.getJSONObject(i);
      String opId = op.optString("id");
      String type = op.optString("type");
      long amount = op.optLong("amount");

      if ("deposit".equals(type)) {
        fulfillDeposit(player, uuid, opId, amount);
      } else if ("withdraw".equals(type)) {
        fulfillWithdraw(player, uuid, opId, amount);
      }
    }
  }

  private void fulfillDeposit(Player player, UUID uuid, String opId, long amount) {
    if (!economy.has(player, amount)) {
      resolveQuietly(opId, uuid, false, "Недостаточно игровых денег");
      Bukkit.getScheduler().runTask(plugin, () -> player.sendMessage(
          PREFIX + "Заявка на депозит " + String.format(Locale.US, "%,d", amount) +
              " EMP отклонена: недостаточно игровых денег."));
      return;
    }
    economy.withdrawPlayer(player, amount);
    try {
      api.deposit(uuid, amount);
      resolveQuietly(opId, uuid, true, null);
      Bukkit.getScheduler().runTask(plugin, () -> player.sendMessage(
          PREFIX + "Депозит с сайта выполнен: +" + String.format(Locale.US, "%,d", amount) + " EMP в банке."));
    } catch (BankApiClient.ApiException e) {
      Bukkit.getScheduler().runTask(plugin, () -> economy.depositPlayer(player, amount));
      resolveQuietly(opId, uuid, false, e.getMessage());
    }
  }

  private void fulfillWithdraw(Player player, UUID uuid, String opId, long amount) {
    try {
      api.withdraw(uuid, amount);
    } catch (BankApiClient.ApiException e) {
      resolveQuietly(opId, uuid, false, e.getMessage());
      Bukkit.getScheduler().runTask(plugin, () -> player.sendMessage(
          PREFIX + "Заявка на вывод " + String.format(Locale.US, "%,d", amount) + " EMP отклонена: " + e.getMessage()));
      return;
    }
    Bukkit.getScheduler().runTask(plugin, () -> economy.depositPlayer(player, amount));
    resolveQuietly(opId, uuid, true, null);
    Bukkit.getScheduler().runTask(plugin, () -> player.sendMessage(
        PREFIX + "Вывод с сайта выполнен: +" + String.format(Locale.US, "%,d", amount) + " игровых денег."));
  }

  // Retries a few times: if the deposit/withdraw already went through but this
  // call fails, the request would otherwise stay "pending" and get re-applied
  // (double-credited/debited) on the next poll.
  private void resolveQuietly(String opId, UUID uuid, boolean success, String note) {
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        api.resolvePendingOp(opId, uuid, success, note);
        return;
      } catch (BankApiClient.ApiException e) {
        try {
          Thread.sleep(1000L * (attempt + 1));
        } catch (InterruptedException ignored) {
          Thread.currentThread().interrupt();
          return;
        }
      }
    }
  }
}
