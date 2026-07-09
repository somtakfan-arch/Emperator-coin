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
import org.json.JSONObject;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

public class BankCommand implements CommandExecutor, TabCompleter {

  private static final String PREFIX = ChatColor.GOLD + "[Emperator Bank] " + ChatColor.RESET;

  private final BankApiClient api;
  private final Economy economy;

  public BankCommand(BankApiClient api, Economy economy) {
    this.api = api;
    this.economy = economy;
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
    sender.sendMessage(PREFIX + "Команды: /bank link <код> (для себя), " +
        "/bank link <ник> <код> (привязать другого игрока, нужны права или консоль), " +
        "/bank balance, /bank deposit <сумма>, /bank withdraw <сумма>");
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
          result.optString("username") + ". Баланс: " + result.optLong("balance") + " EMP";
    });
  }

  private void handleBalance(Player player) {
    runAsync(player, () -> {
      JSONObject result = api.getBalance(player.getUniqueId());
      return PREFIX + "Баланс счёта " + result.optString("username") + ": " +
          result.optLong("balance") + " EMP";
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
        return PREFIX + "Депозит выполнен. Баланс банка: " + result.optLong("balance") + " EMP";
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
      return PREFIX + "Вывод выполнен. Баланс банка: " + result.optLong("balance") + " EMP";
    });
  }

  private Long parseAmount(Player player, String[] args) {
    if (args.length < 2) {
      player.sendMessage(PREFIX + "Укажите сумму, например: /bank deposit 100");
      return null;
    }
    try {
      long amount = Long.parseLong(args[1]);
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
      return List.of("link", "balance", "deposit", "withdraw");
    }
    if (args.length == 2 && "link".equalsIgnoreCase(args[0]) && !(sender instanceof Player)) {
      return null; // let Bukkit suggest online player names
    }
    return Collections.emptyList();
  }
}
