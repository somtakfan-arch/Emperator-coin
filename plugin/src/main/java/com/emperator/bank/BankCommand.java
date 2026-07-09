package com.emperator.bank;

import net.milkbowl.vault.economy.Economy;
import org.bukkit.ChatColor;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.json.JSONObject;

import java.util.Collections;
import java.util.List;

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
    if (!(sender instanceof Player player)) {
      sender.sendMessage(PREFIX + "Эта команда доступна только игрокам.");
      return true;
    }

    if (args.length == 0) {
      sendUsage(player);
      return true;
    }

    switch (args[0].toLowerCase()) {
      case "link" -> handleLink(player, args);
      case "balance", "bal" -> handleBalance(player);
      case "deposit" -> handleDeposit(player, args);
      case "withdraw" -> handleWithdraw(player, args);
      default -> sendUsage(player);
    }
    return true;
  }

  private void sendUsage(Player player) {
    player.sendMessage(PREFIX + "Команды: /bank link <код>, /bank balance, /bank deposit <сумма>, /bank withdraw <сумма>");
  }

  private void handleLink(Player player, String[] args) {
    if (args.length < 2) {
      player.sendMessage(PREFIX + "Использование: /bank link <код с сайта>");
      return;
    }
    String code = args[1];
    runAsync(player, () -> {
      JSONObject result = api.linkAccount(code, player.getUniqueId(), player.getName());
      return PREFIX + "Аккаунт привязан к банковскому счёту " + result.optString("username") +
          ". Баланс: " + result.optLong("balance") + " EMP";
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

  private void runAsync(Player player, ApiCall call) {
    var plugin = Bukkit.getPluginManager().getPlugin("EmperatorBank");
    Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
      String message;
      try {
        message = call.call();
      } catch (BankApiClient.ApiException e) {
        message = PREFIX + ChatColor.RED + e.getMessage();
      }
      String finalMessage = message;
      Bukkit.getScheduler().runTask(plugin, () -> player.sendMessage(finalMessage));
    });
  }

  @Override
  public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
    if (args.length == 1) {
      return List.of("link", "balance", "deposit", "withdraw");
    }
    return Collections.emptyList();
  }
}
