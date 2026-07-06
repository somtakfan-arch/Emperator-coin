package com.bedregen;

import com.bedregen.command.BedRegCommand;
import com.bedregen.data.PositionManager;
import com.bedregen.data.RegionManager;
import com.bedregen.schematic.SchematicService;
import org.bukkit.plugin.PluginManager;
import org.bukkit.plugin.java.JavaPlugin;

public final class BedRegenPlugin extends JavaPlugin {

    private PositionManager positionManager;
    private RegionManager regionManager;
    private SchematicService schematicService;

    @Override
    public void onEnable() {
        PluginManager pm = getServer().getPluginManager();
        if (pm.getPlugin("FastAsyncWorldEdit") == null) {
            getLogger().severe("FastAsyncWorldEdit not found. Disabling BedRegen.");
            pm.disablePlugin(this);
            return;
        }

        if (!getDataFolder().exists()) {
            getDataFolder().mkdirs();
        }

        this.positionManager = new PositionManager();
        this.regionManager = new RegionManager(this);
        this.schematicService = new SchematicService(this);

        BedRegCommand command = new BedRegCommand(this);
        getCommand("bedreg").setExecutor(command);
        getCommand("bedreg").setTabCompleter(command);

        getLogger().info("BedRegen enabled.");
    }

    @Override
    public void onDisable() {
        getLogger().info("BedRegen disabled.");
    }

    public PositionManager getPositionManager() {
        return positionManager;
    }

    public RegionManager getRegionManager() {
        return regionManager;
    }

    public SchematicService getSchematicService() {
        return schematicService;
    }
}
