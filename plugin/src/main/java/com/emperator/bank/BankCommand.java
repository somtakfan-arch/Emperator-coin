package com.emperator.bank;

import net.milkbowl.vault.economy.Economy;
import org.bukkit.ChatColor;
import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

public class BankCommand implements CommandExecutor, TabCompleter {

  private static final String PREFIX = ChatColor.GOLD + "[Emperator Bank] " + ChatColor.RESET;

  private final BankApiClient api;
  private final Economy economy;

  public BankCommand(BankApiClient api, Economy economy) {
    this.api = api;
    this.economy = economy;
  }

  private static String fmt(long amount) {
    return String.format(Locale.US, "%,d", amount);
  }

  @Override
  public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
    if (args.length == 0) {
      sendUsage(sender);
      return true;
    }

    switch (args[0].toLowerCase()) {
      case "link" -> handleLink(sender, args);
      case "balance", "bal" -> requirePlayer(sender, this::handleBalance);
      case "deposit" -> requirePlayer(sender, p -> handleDeposit(p, args));
      case "withdraw" -> requirePlayer(sender, p -> handleWithdraw(p, args));
      case "pay" -> requirePlayer(sender, p -> handlePay(p, args));
      case "daily" -> requirePlayer(sender, this::handleDaily);
      case "top" -> handleTop(sender, args);
      default -> sendUsage(sender);
    }
    return true;
  }

  private interface PlayerAction {
    void run(Player player);
  }

  private void requirePlayer(CommandSender sender, PlayerAction action) {
    if (sender instanceof Player player) {
      action.run(player);
    } else {
      sender.sendMessage(PREFIX + "Эта команда доступна только игрокам в игре.");
    }
  }

  private void sendUsage(CommandSender sender) {
    sender.sendMessage(PREFIX + "Команды: /bank link <код>, /bank link <ник> <код> (админ/консоль), " +
        "/bank balance, /bank pay <ник> <сумма>, /bank deposit <сумма>, /bank withdraw <сумма>, " +
        "/bank daily, /bank top");
  }

  // /bank link <code>          -> player links their own account
  // /bank link <nickname> <code> -> console or a permitted player links someone else's account,
  //                                  knowing only the code shown on the website
  private void handleLink(CommandSender sender, String[] args) {
    if (args.length == 2) {
      if (!(sender instanceof Player player)) {
        sender.sendMessage(PREFIX + "Из консоли укажи ник: /bank link <ник> <код>");
        return;
      }
      linkAccount(sender, player.getUniqueId(), player.getName(), args[1]);
      return;
    }

    if (args.length == 3) {
      if (!sender.hasPermission("emperatorbank.admin.link")) {
        sender.sendMessage(PREFIX + "Нет прав для привязки чужого аккаунта (emperatorbank.admin.link).");
        return;
      }
      String targetName = args[1];
      String code = args[2];
      OfflinePlayer target = Bukkit.getOfflinePlayer(targetName);
      if (!target.isOnline() && !target.hasPlayedBefore()) {
        sender.sendMessage(PREFIX + "Игрок \"" + targetName + "\" ни разу не заходил на сервер — его UUID неизвестен.");
        return;
      }
      String resolvedName = target.getName() != null ? target.getName() : targetName;
      linkAccount(sender, target.getUniqueId(), resolvedName, code);
      return;
    }

    sender.sendMessage(PREFIX + "Использование: /bank link <код> или /bank link <ник> <код>");
  }

  private void linkAccount(CommandSender sender, UUID mcUuid, String mcUsername, String code) {
    runAsync(sender, () -> {
      JSONObject result = api.linkAccount(code, mcUuid, mcUsername);
      return PREFIX + "Аккаунт " + mcUsername + " привязан к банковскому счёту " +
          result.optString("username") + ". Баланс: " + fmt(result.optLong("balance")) + " EMP";
    });
  }

  private void handleBalance(Player player) {
    runAsync(player, () -> {
      JSONObject result = api.getBalance(player.getUniqueId());
      return PREFIX + "Баланс счёта " + result.optString("username") + ": " +
          fmt(result.optLong("balance")) + " EMP";
    });
  }

  private void handleDeposit(Player player, String[] args) {
    Long amount = parseAmount(player, args);
    if (amount == null) return;

    if (economy == null) {
      player.sendMessage(PREFIX + "Игровая экономика (Vault) недоступна на этом сервере.");
      return;
    }
    if (!economy.has(player, amount)) {
      player.sendMessage(PREFIX + "Недостаточно игровых денег для депозита.");
      return;
    }

    economy.withdrawPlayer(player, amount);
    runAsync(player, () -> {
      try {
        JSONObject result = api.deposit(player.getUniqueId(), amount);
        return PREFIX + "Депозит выполнен. Баланс банка: " + fmt(result.optLong("balance")) + " EMP";
      } catch (BankApiClient.ApiException e) {
        Bukkit.getScheduler().runTask(
            Bukkit.getPluginManager().getPlugin("EmperatorBank"),
            () -> economy.depositPlayer(player, amount)
        );
        throw e;
      }
    });
  }

  private void handleWithdraw(Player player, String[] args) {
    Long amount = parseAmount(player, args);
    if (amount == null) return;

    if (economy == null) {
      player.sendMessage(PREFIX + "Игровая экономика (Vault) недоступна на этом сервере.");
      return;
    }

    runAsync(player, () -> {
      JSONObject result = api.withdraw(player.getUniqueId(), amount);
      Bukkit.getScheduler().runTask(
          Bukkit.getPluginManager().getPlugin("EmperatorBank"),
          () -> economy.depositPlayer(player, amount)
      );
      return PREFIX + "Вывод выполнен. Баланс банка: " + fmt(result.optLong("balance")) + " EMP";
    });
  }

  // /bank pay <nickname> <amount> - direct transfer between two linked bank accounts.
  private void handlePay(Player player, String[] args) {
    if (args.length < 3) {
      player.sendMessage(PREFIX + "Использование: /bank pay <ник> <сумма>");
      return;
    }
    String targetName = args[1];
    Long amount = parseAmountAt(player, args, 2);
    if (amount == null) return;

    OfflinePlayer target = Bukkit.getOfflinePlayer(targetName);
    if (!target.isOnline() && !target.hasPlayedBefore()) {
      player.sendMessage(PREFIX + "Игрок \"" + targetName + "\" ни разу не заходил на сервер.");
      return;
    }
    UUID toUuid = target.getUniqueId();

    runAsync(player, () -> {
      JSONObject result = api.pay(player.getUniqueId(), toUuid, amount);
      String feeNote = result.optLong("fee") > 0 ? " (комиссия " + fmt(result.optLong("fee")) + " EMP)" : "";
      return PREFIX + "Переведено " + fmt(result.optLong("netAmount")) + " EMP игроку " +
          result.optString("toUsername") + feeNote + ". Баланс: " + fmt(result.optLong("balance")) + " EMP";
    });
  }

  private void handleDaily(Player player) {
    runAsync(player, () -> {
      JSONObject result = api.claimDaily(player.getUniqueId());
      return PREFIX + "Получен ежедневный бонус: " + fmt(result.optLong("amount")) +
          " EMP. Баланс: " + fmt(result.optLong("balance")) + " EMP";
    });
  }

  private void handleTop(CommandSender sender, String[] args) {
    int limit = 10;
    if (args.length >= 2) {
      try {
        limit = Math.max(1, Math.min(50, Integer.parseInt(args[1])));
      } catch (NumberFormatException ignored) {
        // keep default
      }
    }
    int finalLimit = limit;
    runAsync(sender, () -> {
      JSONArray top = api.top(finalLimit);
      if (top.isEmpty()) return PREFIX + "Пока нет данных для топа.";
      StringBuilder sb = new StringBuilder(PREFIX + "Топ игроков банка:\n");
      for (int i = 0; i < top.length(); i++) {
        JSONObject row = top.getJSONObject(i);
        sb.append(ChatColor.GOLD).append(i + 1).append(". ").append(ChatColor.RESET)
            .append(row.optString("username")).append(" — ")
            .append(fmt(row.optLong("balance"))).append(" EMP");
        if (i < top.length() - 1) sb.append("\n");
      }
      return sb.toString();
    });
  }

  private Long parseAmount(Player player, String[] args) {
    return parseAmountAt(player, args, 1);
  }

  private Long parseAmountAt(Player player, String[] args, int index) {
    if (args.length <= index) {
      player.sendMessage(PREFIX + "Укажите сумму.");
      return null;
    }
    try {
      long amount = Long.parseLong(args[index]);
      if (amount <= 0) {
        player.sendMessage(PREFIX + "Сумма должна быть больше 0.");
        return null;
      }
      return amount;
    } catch (NumberFormatException e) {
      player.sendMessage(PREFIX + "Сумма должна быть целым числом.");
      return null;
    }
  }

  private interface ApiCall {
    String call() throws BankApiClient.ApiException;
  }

  private void runAsync(CommandSender sender, ApiCall call) {
    var plugin = Bukkit.getPluginManager().getPlugin("EmperatorBank");
    Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
      String message;
      try {
        message = call.call();
      } catch (BankApiClient.ApiException e) {
        message = PREFIX + ChatColor.RED + e.getMessage();
      }
      String finalMessage = message;
      Bukkit.getScheduler().runTask(plugin, () -> sender.sendMessage(finalMessage));
    });
  }

  @Override
  public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
    if (args.length == 1) {
      return List.of("link", "balance", "pay", "deposit", "withdraw", "daily", "top");
    }
    if (args.length == 2 && ("link".equalsIgnoreCase(args[0]) || "pay".equalsIgnoreCase(args[0]))
        && !(sender instanceof Player && "link".equalsIgnoreCase(args[0]))) {
      return null; // let Bukkit suggest online player names
    }
    return Collections.emptyList();
  }
}
