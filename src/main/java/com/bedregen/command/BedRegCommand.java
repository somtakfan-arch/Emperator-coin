package com.bedregen.command;

import com.bedregen.BedRegenPlugin;
import com.bedregen.data.PositionManager;
import com.bedregen.data.RegionData;
import com.bedregen.data.RegionManager;
import com.bedregen.schematic.SchematicService;
import com.sk89q.worldedit.math.BlockVector3;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

public final class BedRegCommand implements CommandExecutor, TabCompleter {

    private static final List<String> SUBCOMMANDS = List.of("pos1", "pos2", "save", "regen", "list", "delete");

    private final BedRegenPlugin plugin;

    public BedRegCommand(BedRegenPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!sender.hasPermission("bedreg.admin")) {
            msg(sender, "&c\u0423 \u0432\u0430\u0441 \u043d\u0435\u0442 \u043f\u0440\u0430\u0432 \u0434\u043b\u044f \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u044f \u044d\u0442\u043e\u0439 \u043a\u043e\u043c\u0430\u043d\u0434\u044b.");
            return true;
        }

        if (args.length == 0) {
            sendHelp(sender);
            return true;
        }

        String sub = args[0].toLowerCase(Locale.ROOT);
        switch (sub) {
            case "pos1":
                return handlePos1(sender);
            case "pos2":
                return handlePos2(sender);
            case "save":
                return handleSave(sender, args);
            case "regen":
                return handleRegen(sender, args);
            case "list":
                return handleList(sender);
            case "delete":
                return handleDelete(sender, args);
            default:
                sendHelp(sender);
                return true;
        }
    }

    private boolean handlePos1(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            msg(sender, "&c\u042d\u0442\u0443 \u043a\u043e\u043c\u0430\u043d\u0434\u0443 \u043c\u043e\u0436\u0435\u0442 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u044c \u0442\u043e\u043b\u044c\u043a\u043e \u0438\u0433\u0440\u043e\u043a.");
            return true;
        }
        Location loc = player.getLocation();
        plugin.getPositionManager().setPos1(player.getUniqueId(), loc);
        msg(sender, String.format("&a\u041f\u0435\u0440\u0432\u0430\u044f \u0442\u043e\u0447\u043a\u0430 \u0437\u0430\u043f\u043e\u043c\u043d\u0435\u043d\u0430: &f%d, %d, %d &7(\u043c\u0438\u0440: %s)",
                loc.getBlockX(), loc.getBlockY(), loc.getBlockZ(), loc.getWorld().getName()));
        return true;
    }

    private boolean handlePos2(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            msg(sender, "&c\u042d\u0442\u0443 \u043a\u043e\u043c\u0430\u043d\u0434\u0443 \u043c\u043e\u0436\u0435\u0442 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u044c \u0442\u043e\u043b\u044c\u043a\u043e \u0438\u0433\u0440\u043e\u043a.");
            return true;
        }
        Location loc = player.getLocation();
        plugin.getPositionManager().setPos2(player.getUniqueId(), loc);
        msg(sender, String.format("&a\u0412\u0442\u043e\u0440\u0430\u044f \u0442\u043e\u0447\u043a\u0430 \u0437\u0430\u043f\u043e\u043c\u043d\u0435\u043d\u0430: &f%d, %d, %d &7(\u043c\u0438\u0440: %s)",
                loc.getBlockX(), loc.getBlockY(), loc.getBlockZ(), loc.getWorld().getName()));
        return true;
    }

    private boolean handleSave(CommandSender sender, String[] args) {
        if (!(sender instanceof Player player)) {
            msg(sender, "&c\u042d\u0442\u0443 \u043a\u043e\u043c\u0430\u043d\u0434\u0443 \u043c\u043e\u0436\u0435\u0442 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u044c \u0442\u043e\u043b\u044c\u043a\u043e \u0438\u0433\u0440\u043e\u043a.");
            return true;
        }
        if (args.length < 2) {
            msg(sender, "&c\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u0435: /bedreg save <\u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435>");
            return true;
        }
        String name = args[1];

        PositionManager pm = plugin.getPositionManager();
        Location pos1 = pm.getPos1(player.getUniqueId());
        Location pos2 = pm.getPos2(player.getUniqueId());

        if (pos1 == null || pos2 == null) {
            msg(sender, "&c\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0437\u0430\u0434\u0430\u0439\u0442\u0435 \u043e\u0431\u0435 \u0442\u043e\u0447\u043a\u0438: /bedreg pos1 \u0438 /bedreg pos2");
            return true;
        }

        if (pos1.getWorld() == null || pos2.getWorld() == null
                || !pos1.getWorld().equals(pos2.getWorld())) {
            msg(sender, "&c\u0422\u043e\u0447\u043a\u0438 pos1 \u0438 pos2 \u043d\u0430\u0445\u043e\u0434\u044f\u0442\u0441\u044f \u0432 \u0440\u0430\u0437\u043d\u044b\u0445 \u043c\u0438\u0440\u0430\u0445.");
            return true;
        }

        World world = pos1.getWorld();
        int minX = Math.min(pos1.getBlockX(), pos2.getBlockX());
        int minY = Math.min(pos1.getBlockY(), pos2.getBlockY());
        int minZ = Math.min(pos1.getBlockZ(), pos2.getBlockZ());
        int maxX = Math.max(pos1.getBlockX(), pos2.getBlockX());
        int maxY = Math.max(pos1.getBlockY(), pos2.getBlockY());
        int maxZ = Math.max(pos1.getBlockZ(), pos2.getBlockZ());

        SchematicService schematicService = plugin.getSchematicService();
        RegionManager regionManager = plugin.getRegionManager();

        msg(sender, String.format("&e\u041d\u0430\u0447\u0438\u043d\u0430\u044e \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435 \u0440\u0435\u0433\u0438\u043e\u043d\u0430 '%s'...", name));

        BlockVector3 min = BlockVector3.at(minX, minY, minZ);
        BlockVector3 max = BlockVector3.at(maxX, maxY, maxZ);

        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                schematicService.saveRegion(world, min, max, name);
                RegionData data = new RegionData(name, world.getName(), minX, minY, minZ, maxX, maxY, maxZ);
                regionManager.put(data);
                Bukkit.getScheduler().runTask(plugin, () -> msg(sender, String.format(
                        "&a\u0420\u0435\u0433\u0438\u043e\u043d '%s' \u0443\u0441\u043f\u0435\u0448\u043d\u043e \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d (%dx%dx%d \u0431\u043b\u043e\u043a\u043e\u0432).",
                        name, data.sizeX(), data.sizeY(), data.sizeZ())));
            } catch (IOException e) {
                plugin.getLogger().warning("Region save failed: " + e.getMessage());
                Bukkit.getScheduler().runTask(plugin, () -> msg(sender, String.format(
                        "&c\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f \u0440\u0435\u0433\u0438\u043e\u043d\u0430 '%s': %s", name, e.getMessage())));
            }
        });

        return true;
    }

    private boolean handleRegen(CommandSender sender, String[] args) {
        if (args.length < 2) {
            msg(sender, "&c\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u0435: /bedreg regen <\u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435>");
            return true;
        }
        String name = args[1];
        RegionManager regionManager = plugin.getRegionManager();
        RegionData data = regionManager.get(name);
        if (data == null) {
            msg(sender, String.format("&c\u0420\u0435\u0433\u0438\u043e\u043d \u0441 \u0438\u043c\u0435\u043d\u0435\u043c '%s' \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d.", name));
            return true;
        }

        World world = Bukkit.getWorld(data.getWorld());
        if (world == null) {
            msg(sender, String.format("&c\u041c\u0438\u0440 '%s' \u0434\u043b\u044f \u0440\u0435\u0433\u0438\u043e\u043d\u0430 '%s' \u043d\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d.", data.getWorld(), name));
            return true;
        }

        SchematicService schematicService = plugin.getSchematicService();
        msg(sender, String.format("&e\u0417\u0430\u043f\u0443\u0441\u043a\u0430\u044e \u0440\u0435\u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u044e \u0440\u0435\u0433\u0438\u043e\u043d\u0430 '%s'...", name));

        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                schematicService.pasteRegion(world, data);
                Bukkit.getScheduler().runTask(plugin, () -> msg(sender, String.format(
                        "&a\u0420\u0435\u0433\u0438\u043e\u043d '%s' \u0443\u0441\u043f\u0435\u0448\u043d\u043e \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d.", name)));
            } catch (IOException e) {
                plugin.getLogger().warning("Region regen failed: " + e.getMessage());
                Bukkit.getScheduler().runTask(plugin, () -> msg(sender, String.format(
                        "&c\u041e\u0448\u0438\u0431\u043a\u0430 \u0440\u0435\u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u0438 \u0440\u0435\u0433\u0438\u043e\u043d\u0430 '%s': %s", name, e.getMessage())));
            }
        });

        return true;
    }

    private boolean handleList(CommandSender sender) {
        RegionManager regionManager = plugin.getRegionManager();
        List<String> names = new ArrayList<>(regionManager.names());
        if (names.isEmpty()) {
            msg(sender, "&7\u0421\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0445 \u0440\u0435\u0433\u0438\u043e\u043d\u043e\u0432 \u043d\u0435\u0442.");
            return true;
        }
        msg(sender, String.format("&6\u0421\u043e\u0445\u0440\u0430\u043d\u0451\u043d\u043d\u044b\u0435 \u0440\u0435\u0433\u0438\u043e\u043d\u044b (%d):", names.size()));
        for (String name : names) {
            RegionData data = regionManager.get(name);
            if (data == null) {
                continue;
            }
            msg(sender, String.format("&f- %s &7(\u043c\u0438\u0440: %s, \u0440\u0430\u0437\u043c\u0435\u0440: %dx%dx%d)",
                    data.getName(), data.getWorld(), data.sizeX(), data.sizeY(), data.sizeZ()));
        }
        return true;
    }

    private boolean handleDelete(CommandSender sender, String[] args) {
        if (args.length < 2) {
            msg(sender, "&c\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u0435: /bedreg delete <\u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435>");
            return true;
        }
        String name = args[1];
        RegionManager regionManager = plugin.getRegionManager();
        if (!regionManager.exists(name)) {
            msg(sender, String.format("&c\u0420\u0435\u0433\u0438\u043e\u043d \u0441 \u0438\u043c\u0435\u043d\u0435\u043c '%s' \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d.", name));
            return true;
        }
        RegionData data = regionManager.get(name);
        regionManager.remove(name);
        if (data != null) {
            plugin.getSchematicService().deleteSchematic(data.getName());
        }
        msg(sender, String.format("&a\u0420\u0435\u0433\u0438\u043e\u043d '%s' \u0443\u0434\u0430\u043b\u0451\u043d.", name));
        return true;
    }

    private void sendHelp(CommandSender sender) {
        msg(sender, "&6--- BedRegen ---");
        msg(sender, "&f/bedreg pos1 &7- \u0437\u0430\u043f\u043e\u043c\u043d\u0438\u0442\u044c \u043f\u0435\u0440\u0432\u0443\u044e \u0442\u043e\u0447\u043a\u0443");
        msg(sender, "&f/bedreg pos2 &7- \u0437\u0430\u043f\u043e\u043c\u043d\u0438\u0442\u044c \u0432\u0442\u043e\u0440\u0443\u044e \u0442\u043e\u0447\u043a\u0443");
        msg(sender, "&f/bedreg save <\u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435> &7- \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0440\u0435\u0433\u0438\u043e\u043d");
        msg(sender, "&f/bedreg regen <\u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435> &7- \u0432\u043e\u0441\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u0440\u0435\u0433\u0438\u043e\u043d");
        msg(sender, "&f/bedreg list &7- \u0441\u043f\u0438\u0441\u043e\u043a \u0440\u0435\u0433\u0438\u043e\u043d\u043e\u0432");
        msg(sender, "&f/bedreg delete <\u043d\u0430\u0437\u0432\u0430\u043d\u0438\u0435> &7- \u0443\u0434\u0430\u043b\u0438\u0442\u044c \u0440\u0435\u0433\u0438\u043e\u043d");
    }

    private void msg(CommandSender sender, String text) {
        sender.sendMessage(ChatColor.translateAlternateColorCodes('&', text));
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (!sender.hasPermission("bedreg.admin")) {
            return List.of();
        }
        if (args.length == 1) {
            String prefix = args[0].toLowerCase(Locale.ROOT);
            return SUBCOMMANDS.stream()
                    .filter(s -> s.startsWith(prefix))
                    .collect(Collectors.toList());
        }
        if (args.length == 2) {
            String sub = args[0].toLowerCase(Locale.ROOT);
            if (sub.equals("regen") || sub.equals("delete")) {
                String prefix = args[1].toLowerCase(Locale.ROOT);
                return plugin.getRegionManager().names().stream()
                        .filter(n -> n.startsWith(prefix))
                        .collect(Collectors.toList());
            }
        }
        return List.of();
    }
}
