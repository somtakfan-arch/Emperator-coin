package ru.bedsmp.noenchants;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** /noenchants scan|stats|reload|toggle */
public final class NoEnchantsCommand implements CommandExecutor, TabCompleter {

    private static final List<String> SUB = List.of("scan", "stats", "reload", "toggle");

    private final BedNoEnchants plugin;

    public NoEnchantsCommand(BedNoEnchants plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!sender.hasPermission("bednoenchants.admin")) {
            sender.sendMessage(Text.component(plugin.settings().message("no-permission")));
            return true;
        }
        if (args.length == 0) {
            help(sender);
            return true;
        }

        switch (args[0].toLowerCase(Locale.ROOT)) {
            case "reload" -> {
                plugin.reloadSettings();
                sender.sendMessage(Text.component(plugin.settings().message("reloaded")));
            }
            case "scan" -> {
                sender.sendMessage(Text.component(plugin.settings().message("scan-started")));
                long itemsBefore = plugin.stats().items();
                long playersBefore = plugin.stats().players();
                int chunks = plugin.sweepTask().scanNow();
                String done = plugin.settings().message("scan-done")
                        .replace("%items%", String.valueOf(plugin.stats().items() - itemsBefore))
                        .replace("%chunks%", String.valueOf(chunks))
                        .replace("%players%", String.valueOf(plugin.stats().players() - playersBefore));
                sender.sendMessage(Text.component(done));
            }
            case "stats" -> {
                Stats stats = plugin.stats();
                sender.sendMessage(Text.component("&8&m---- &bBedNoEnchants &8&m----"));
                sender.sendMessage(Text.component("&7Очищено предметов: &f" + stats.items()));
                sender.sendMessage(Text.component("&7Очищено контейнеров: &f" + stats.containers()));
                sender.sendMessage(Text.component("&7Обработано чанков: &f" + stats.chunks()));
                sender.sendMessage(Text.component("&7Очищено инвентарей игроков: &f" + stats.players()));
                sender.sendMessage(Text.component("&7Заблокировано зачарований: &f" + stats.blockedEnchants()));
                sender.sendMessage(Text.component("&7В очереди чанков: &f" + plugin.sweepTask().queueSize()));
                sender.sendMessage(Text.component("&7Статус: " + (plugin.settings().enabled() ? "&aвключён" : "&cвыключен")));
            }
            case "toggle" -> {
                boolean now = !plugin.settings().enabled();
                plugin.getConfig().set("enabled", now);
                plugin.saveConfig();
                plugin.reloadSettings();
                sender.sendMessage(Text.component(plugin.settings().message(now ? "toggled-on" : "toggled-off")));
            }
            default -> help(sender);
        }
        return true;
    }

    private void help(CommandSender sender) {
        sender.sendMessage(Text.component("&8&m---- &bBedNoEnchants &8&m----"));
        sender.sendMessage(Text.component("&e/noenchants scan &7— зачистить все загруженные чанки и игроков"));
        sender.sendMessage(Text.component("&e/noenchants stats &7— статистика"));
        sender.sendMessage(Text.component("&e/noenchants reload &7— перезагрузить конфиг"));
        sender.sendMessage(Text.component("&e/noenchants toggle &7— включить/выключить плагин"));
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length != 1) return List.of();
        List<String> out = new ArrayList<>();
        for (String sub : SUB) {
            if (sub.startsWith(args[0].toLowerCase(Locale.ROOT))) out.add(sub);
        }
        return out;
    }
}
