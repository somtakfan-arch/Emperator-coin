package com.bedsmp.unbreakablestand;

import com.bedsmp.unbreakablestand.commands.GiveItemCommand;
import com.bedsmp.unbreakablestand.listeners.StandBreakerListener;
import com.bedsmp.unbreakablestand.listeners.StandPlaceListener;
import com.bedsmp.unbreakablestand.listeners.StandProtectionListener;
import org.bukkit.plugin.java.JavaPlugin;

public final class UnbreakableStandPlugin extends JavaPlugin {

    @Override
    public void onEnable() {
        Keys keys = new Keys(this);
        ItemFactory itemFactory = new ItemFactory(keys);

        getServer().getPluginManager().registerEvents(new StandPlaceListener(keys), this);
        getServer().getPluginManager().registerEvents(new StandProtectionListener(keys), this);
        getServer().getPluginManager().registerEvents(new StandBreakerListener(keys), this);

        getCommand("unbreakablestand").setExecutor(new GiveItemCommand(itemFactory::createUnbreakableStand));
        getCommand("standbreaker").setExecutor(new GiveItemCommand(itemFactory::createStandBreaker));
    }
}
