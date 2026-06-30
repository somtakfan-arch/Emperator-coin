package com.bedsmp.thornsward;

import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;

public final class ThornsWardPlugin extends JavaPlugin {

    private ThornsWardItem thornsWardItem;

    @Override
    public void onEnable() {
        saveDefaultConfig();

        thornsWardItem = new ThornsWardItem(this);

        getServer().getPluginManager().registerEvents(new ThornsWardListener(this, thornsWardItem), this);

        ThornsWardCommand commandExecutor = new ThornsWardCommand(thornsWardItem);
        PluginCommand command = getCommand("thornsward");
        if (command != null) {
            command.setExecutor(commandExecutor);
            command.setTabCompleter(commandExecutor);
        } else {
            getLogger().warning("Команда 'thornsward' не зарегистрирована — проверьте plugin.yml.");
        }

        getLogger().info("ThornsWard включен.");
    }

    public ThornsWardItem getThornsWardItem() {
        return thornsWardItem;
    }
}
