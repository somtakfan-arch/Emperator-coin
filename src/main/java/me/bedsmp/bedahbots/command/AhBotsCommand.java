package me.bedsmp.bedahbots.command;

import me.bedsmp.bedahbots.BedAHBotsPlugin;
import me.bedsmp.bedahbots.BotManager;
import me.bedsmp.bedahbots.BotStock;
import me.bedsmp.bedahbots.WorthLoader;
import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.jetbrains.annotations.NotNull;

import java.util.List;

public final class AhBotsCommand implements CommandExecutor, TabCompleter {

    private static final String PERM = "ahbots.admin";

    private final BedAHBotsPlugin plugin;
    private final BotManager botManager;
    private final WorthLoader worth;
    private final BotStock stock;

    public AhBotsCommand(BedAHBotsPlugin plugin, BotManager botManager,
                         WorthLoader worth, BotStock stock, BedAHBotsPlugin ignored) {
        this.plugin = plugin;
        this.botManager = botManager;
        this.worth = worth;
        this.stock = stock;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command cmd,
                             @NotNull String label, @NotNull String[] args) {
        if (!sender.hasPermission(PERM)) {
            sender.sendMessage(ChatColor.RED + "У вас нет прав на эту команду.");
            return true;
        }
        if (args.length == 0) {
            sendUsage(sender);
            return true;
        }

        switch (args[0].toLowerCase()) {
            case "status"     -> cmdStatus(sender);
            case "seed"       -> cmdSeed(sender);
            case "buy"        -> cmdBuy(sender);
            case "resell"     -> cmdResell(sender);
            case "reload"        -> cmdReload(sender);
            case "clearstock"    -> cmdClearStock(sender);
            case "clearlistings" -> cmdClearListings(sender);
            case "clearall"      -> cmdClearAll(sender);
            default              -> sendUsage(sender);
        }
        return true;
    }

    private void cmdStatus(CommandSender s) {
        int listings  = botManager.totalBotListings();
        int stockSize = stock.size();
        int worthItems = worth.knownMaterials().size();
        s.sendMessage(ChatColor.GOLD + "=== BedAHBots Status ===");
        s.sendMessage(ChatColor.YELLOW + "Active bot listings: " + ChatColor.WHITE + listings);
        s.sendMessage(ChatColor.YELLOW + "Items in stock: "      + ChatColor.WHITE + stockSize);
        s.sendMessage(ChatColor.YELLOW + "Worth items loaded: "  + ChatColor.WHITE + worthItems);
        s.sendMessage(ChatColor.YELLOW + "Bot count: "           + ChatColor.WHITE + botManager.allUUIDs().size());
    }

    private void cmdSeed(CommandSender s) {
        s.sendMessage(ChatColor.GREEN + "Running listing cycle...");
        // Run on main thread (we're already on it from command execution)
        plugin.listingTask.runCycle();
        s.sendMessage(ChatColor.GREEN + "Listing cycle complete.");
    }

    private void cmdBuy(CommandSender s) {
        s.sendMessage(ChatColor.GREEN + "Running buying cycle...");
        plugin.buyingTask.runCycle();
        s.sendMessage(ChatColor.GREEN + "Buying cycle complete.");
    }

    private void cmdResell(CommandSender s) {
        s.sendMessage(ChatColor.GREEN + "Running reselling cycle...");
        plugin.resellingTask.runCycle();
        s.sendMessage(ChatColor.GREEN + "Reselling cycle complete.");
    }

    private void cmdReload(CommandSender s) {
        plugin.reloadAll();
        s.sendMessage(ChatColor.GREEN + "BedAHBots: конфиг и worth.yml перезагружены.");
    }

    private void cmdClearStock(CommandSender s) {
        int size = stock.size();
        stock.clear();
        stock.save();
        s.sendMessage(ChatColor.YELLOW + "Склад очищен. Удалено предметов: " + size);
    }

    private void cmdClearListings(CommandSender s) {
        int count = plugin.clearBotListings();
        s.sendMessage(ChatColor.YELLOW + "Удалено активных лотов ботов: " + count);
    }

    private void cmdClearAll(CommandSender s) {
        int count = plugin.clearAllListings();
        s.sendMessage(ChatColor.YELLOW + "Удалено лотов с аукциона (все): " + count);
    }

    private void sendUsage(CommandSender s) {
        s.sendMessage(ChatColor.YELLOW + "Использование: /ahbots <status|seed|buy|resell|reload|clearstock|clearlistings|clearall>");
    }

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command cmd,
                                      @NotNull String alias, @NotNull String[] args) {
        if (args.length == 1) {
            return List.of("status", "seed", "buy", "resell", "reload", "clearstock", "clearlistings", "clearall");
        }
        return List.of();
    }
}
