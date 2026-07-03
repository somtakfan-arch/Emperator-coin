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
    private InstantAppleItem    instantAppleItem;
    private RevengeThornItem    revengeThornItem;
    private SoulLanternItem     soulLanternItem;

    @Override
    public void onEnable() {
        saveDefaultConfig();

        thornsWardItem      = new ThornsWardItem(this);
        crystallerSwordItem = new CrystallerSwordItem(this);
        amethystAxeItem     = new AmethystAxeItem(this);
        nemesisItem         = new NemesisItem(this);
        phantomItem         = new PhantomItem(this);
        mirrorShieldItem    = new MirrorShieldItem(this);
        instantAppleItem    = new InstantAppleItem(this);
        revengeThornItem    = new RevengeThornItem(this);
        soulLanternItem     = new SoulLanternItem(this);

        getServer().getPluginManager().registerEvents(new ThornsWardListener(this, thornsWardItem), this);
        getServer().getPluginManager().registerEvents(new CrystallerSwordListener(this, crystallerSwordItem), this);
        getServer().getPluginManager().registerEvents(new AmethystAxeListener(this, amethystAxeItem), this);
        getServer().getPluginManager().registerEvents(new NemesisListener(this, nemesisItem), this);
        getServer().getPluginManager().registerEvents(new PhantomListener(this, phantomItem), this);
        getServer().getPluginManager().registerEvents(new MirrorShieldListener(this, mirrorShieldItem), this);
        getServer().getPluginManager().registerEvents(new InstantAppleListener(this, instantAppleItem), this);
        getServer().getPluginManager().registerEvents(new RevengeThornListener(this, revengeThornItem), this);
        getServer().getPluginManager().registerEvents(new SoulLanternListener(this, soulLanternItem), this);

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

        InstantAppleCommand instantAppleCommand = new InstantAppleCommand(instantAppleItem);
        registerCommand("instantapple", instantAppleCommand, instantAppleCommand);

        RevengeThornCommand revengeThornCommand = new RevengeThornCommand(revengeThornItem);
        registerCommand("revengethorn", revengeThornCommand, revengeThornCommand);

        SoulLanternCommand soulLanternCommand = new SoulLanternCommand(soulLanternItem);
        registerCommand("soullantern", soulLanternCommand, soulLanternCommand);

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
