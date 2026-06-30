package com.bedsmp.thornsward;

import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;

public final class ThornsWardPlugin extends JavaPlugin {

    private ThornsWardItem thornsWardItem;
    private CrystallerSwordItem crystallerSwordItem;

    @Override
    public void onEnable() {
        saveDefaultConfig();

        thornsWardItem = new ThornsWardItem(this);
        crystallerSwordItem = new CrystallerSwordItem(this);

        getServer().getPluginManager().registerEvents(new ThornsWardListener(this, thornsWardItem), this);
        getServer().getPluginManager().registerEvents(new CrystallerSwordListener(this, crystallerSwordItem), this);

        ThornsWardCommand thornsWardCommand = new ThornsWardCommand(thornsWardItem);
        registerCommand("thornsward", thornsWardCommand, thornsWardCommand);

        CrystallerSwordCommand crystallerSwordCommand = new CrystallerSwordCommand(crystallerSwordItem);
        registerCommand("crystallersword", crystallerSwordCommand, crystallerSwordCommand);

        getLogger().info("ThornsWard включен.");
    }

    private void registerCommand(String name, org.bukkit.command.CommandExecutor executor,
                                  org.bukkit.command.TabCompleter tabCompleter) {
        PluginCommand command = getCommand(name);
        if (command != null) {
            command.setExecutor(executor);
            command.setTabCompleter(tabCompleter);
        } else {
            getLogger().warning("Команда '" + name + "' не зарегистрирована — проверьте plugin.yml.");
        }
    }

    public ThornsWardItem getThornsWardItem() {
        return thornsWardItem;
    }

    public CrystallerSwordItem getCrystallerSwordItem() {
        return crystallerSwordItem;
    }
}
