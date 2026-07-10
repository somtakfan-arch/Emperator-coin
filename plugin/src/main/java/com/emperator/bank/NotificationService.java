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
 * For each online, linked player: (1) announces new incoming transfers in
 * chat, and (2) keeps their real in-game balance in lockstep with the bank
 * ledger (the bank balance IS their real money — every site-side operation
 * just changes the ledger; this loop is what actually applies that change
 * to Vault). There's no push channel from the (serverless) backend to the
 * game server, so polling — on join, and every few seconds while online —
 * is the simplest reliable option for both.
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
    Player player = event.getPlayer();
    UUID uuid = player.getUniqueId();
    // Only notify about transfers received after this join, not old history.
    lastCheckedAt.put(uuid, Instant.now().toString());
    // Catch up immediately on anything that changed while they were offline.
    Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> checkBalanceSync(player, uuid));
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
      checkBalanceSync(player, uuid);
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

  private void checkBalanceSync(Player player, UUID uuid) {
    if (economy == null) return;
    JSONObject status;
    try {
      status = api.getSyncStatus(uuid);
    } catch (BankApiClient.ApiException e) {
      return; // not linked yet, or bank unreachable - try again next poll
    }

    long delta = status.optLong("delta", 0);
    if (delta == 0) return;

    if (delta > 0) {
      Bukkit.getScheduler().runTask(plugin, () -> economy.depositPlayer(player, delta));
      confirmQuietly(uuid, delta);
    } else {
      long amount = -delta;
      if (!economy.has(player, amount)) {
        // Real balance can't cover it (e.g. they spent it via another plugin
        // since the last sync) - leave it pending, retry on the next poll.
        return;
      }
      economy.withdrawPlayer(player, amount);
      confirmQuietly(uuid, delta);
    }
  }

  // Retries a few times: if the Vault change already happened but this call
  // fails, the gap would otherwise still show up (and get re-applied,
  // double-crediting/debiting) on the next poll.
  private void confirmQuietly(UUID uuid, long appliedDelta) {
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        api.confirmSync(uuid, appliedDelta);
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
