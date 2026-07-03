package com.bedsmp.thornsward;

import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;

public final class ThornsWardPlugin extends JavaPlugin {

    private ThornsWardItem     thornsWardItem;
    private CrystallerSwordItem crystallerSwordItem;
    private AmethystAxeItem     amethystAxeItem;
    private NemesisItem         nemesisItem;
    private PhantomItem         phantomItem;
    private MirrorShieldItem    mirrorShieldItem;

    @Override
    public void onEnable() {
        saveDefaultConfig();

        thornsWardItem      = new ThornsWardItem(this);
        crystallerSwordItem = new CrystallerSwordItem(this);
        amethystAxeItem     = new AmethystAxeItem(this);
        nemesisItem         = new NemesisItem(this);
        phantomItem         = new PhantomItem(this);
        mirrorShieldItem    = new MirrorShieldItem(this);

        getServer().getPluginManager().registerEvents(new ThornsWardListener(this, thornsWardItem), this);
        getServer().getPluginManager().registerEvents(new CrystallerSwordListener(this, crystallerSwordItem), this);
        getServer().getPluginManager().registerEvents(new AmethystAxeListener(this, amethystAxeItem), this);
        getServer().getPluginManager().registerEvents(new NemesisListener(this, nemesisItem), this);
        getServer().getPluginManager().registerEvents(new PhantomListener(this, phantomItem), this);
        getServer().getPluginManager().registerEvents(new MirrorShieldListener(this, mirrorShieldItem), this);

        ThornsWardCommand thornsWardCommand = new ThornsWardCommand(thornsWardItem);
        registerCommand("thornsward", thornsWardCommand, thornsWardCommand);

        CrystallerSwordCommand crystallerSwordCommand = new CrystallerSwordCommand(crystallerSwordItem);
        registerCommand("crystallersword", crystallerSwordCommand, crystallerSwordCommand);

        AmethystAxeCommand amethystAxeCommand = new AmethystAxeCommand(amethystAxeItem);
        registerCommand("amethystaxe", amethystAxeCommand, amethystAxeCommand);

        NemesisCommand nemesisCommand = new NemesisCommand(nemesisItem);
        registerCommand("nemesis", nemesisCommand, nemesisCommand);

        PhantomCommand phantomCommand = new PhantomCommand(phantomItem);
        registerCommand("phantom", phantomCommand, phantomCommand);

        MirrorShieldCommand mirrorShieldCommand = new MirrorShieldCommand(mirrorShieldItem);
        registerCommand("mirrorshield", mirrorShieldCommand, mirrorShieldCommand);

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
