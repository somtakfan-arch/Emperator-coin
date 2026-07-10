package com.bedsmp.cleaner;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.plugin.java.JavaPlugin;

public class RareItemCleaner extends JavaPlugin implements CommandExecutor {

    @Override
    public void onEnable() {
        getCommand("clearrare").setExecutor(this);
        getLogger().info("RareItemCleaner загружен. Используй /clearrare all confirm");
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            sender.sendMessage("§eИспользование: §f/clearrare <world|inventories|all> confirm");
            sender.sendMessage("§7world §8- только блоки в мире (яйца дракона, незерит-блоки)");
            sender.sendMessage("§7inventories §8- инвентари и эндер-сундуки, онлайн И офлайн игроков");
            sender.sendMessage("§7all §8- и то, и то");
            return true;
        }

        boolean confirmed = args.length > 1 && args[1].equalsIgnoreCase("confirm");
        if (!confirmed) {
            sender.sendMessage("§cЭто необратимое действие. Повтори команду с §fconfirm§c в конце, например:");
            sender.sendMessage("§f/clearrare " + args[0] + " confirm");
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "world" -> {
                sender.sendMessage("§aЗапускаю зачистку блоков во всех мирах...");
                new WorldCleaner(this).cleanAllWorlds(sender);
            }
            case "inventories" -> {
                sender.sendMessage("§aЗапускаю зачистку инвентарей (онлайн + офлайн)...");
                new InventoryCleaner(this).cleanAll(sender);
            }
            case "all" -> {
                sender.sendMessage("§aЗапускаю полную зачистку...");
                new InventoryCleaner(this).cleanAll(sender);
                new WorldCleaner(this).cleanAllWorlds(sender);
            }
            default -> sender.sendMessage("§cНеизвестный режим. Используй world, inventories или all.");
        }
        return true;
    }
}
