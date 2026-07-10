package com.emperator.bank;

import net.milkbowl.vault.economy.Economy;
import org.bukkit.plugin.RegisteredServiceProvider;
import org.bukkit.plugin.java.JavaPlugin;

public class EmperatorBankPlugin extends JavaPlugin {

  private BankApiClient apiClient;
  private Economy economy;

  @Override
  public void onEnable() {
    saveDefaultConfig();

    apiClient = new BankApiClient(
        getConfig().getString("api-base-url"),
        getConfig().getString("api-key"),
        getConfig().getLong("timeout-ms", 5000),
        getLogger()
    );

    if (getServer().getPluginManager().getPlugin("Vault") != null) {
      RegisteredServiceProvider<Economy> rsp = getServer().getServicesManager().getRegistration(Economy.class);
      if (rsp != null) {
        economy = rsp.getProvider();
        getLogger().info("Vault economy найден, депозиты/выводы в игровую валюту включены.");
      }
    }
    if (economy == null) {
      getLogger().warning("Vault не найден — банковский баланс не будет синхронизироваться с игровой валютой.");
    }

    BankCommand bankCommand = new BankCommand(apiClient, economy);
    getCommand("bank").setExecutor(bankCommand);
    getCommand("bank").setTabCompleter(bankCommand);

    NotificationService notifications = new NotificationService(this, apiClient, economy);
    getServer().getPluginManager().registerEvents(notifications, this);
    notifications.startPolling(20L * 10); // every 10 seconds

    getLogger().info("Emperator Bank подключён к сайту: " + getConfig().getString("api-base-url"));
  }
}
