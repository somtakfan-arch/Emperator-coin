package com.bedsmp.thornsward;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public final class CrystallerSwordCommand implements CommandExecutor, TabCompleter {

    private final CrystallerSwordItem item;

    public CrystallerSwordCommand(CrystallerSwordItem item) {
        this.item = item;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                              @NotNull String label, @NotNull String[] args) {
        if (args.length == 0 || !args[0].equalsIgnoreCase("give")) {
            sender.sendMessage(Component.text("Использование: /crystallersword give [игрок]", NamedTextColor.YELLOW));
            return true;
        }

        if (!sender.hasPermission("bedsmp.crystallersword.give")) {
            sender.sendMessage(Component.text("У вас нет прав на эту команду.", NamedTextColor.RED));
            return true;
        }

        Player target;
        if (args.length >= 2) {
            target = Bukkit.getPlayerExact(args[1]);
            if (target == null) {
                sender.sendMessage(Component.text("Игрок не найден или не в сети: " + args[1], NamedTextColor.RED));
                return true;
            }
        } else if (sender instanceof Player senderPlayer) {
            target = senderPlayer;
        } else {
            sender.sendMessage(Component.text("Укажите игрока: /crystallersword give <игрок>", NamedTextColor.RED));
            return true;
        }

        ItemStack stack = item.create();
        Map<Integer, ItemStack> leftover = target.getInventory().addItem(stack);
        if (!leftover.isEmpty()) {
            leftover.values().forEach(left -> target.getWorld().dropItemNaturally(target.getLocation(), left));
            sender.sendMessage(Component.text("Инвентарь полон — предмет выброшен на землю.", NamedTextColor.YELLOW));
        }

        target.sendMessage(Component.text("Вы получили Меч Кристаллера!", NamedTextColor.LIGHT_PURPLE));
        if (sender != target) {
            sender.sendMessage(Component.text("Выдан Меч Кристаллера игроку " + target.getName(), NamedTextColor.GREEN));
        }
        return true;
    }

    @Override
    public @Nullable List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command,
                                                  @NotNull String alias, @NotNull String[] args) {
        if (args.length == 1) {
            return Collections.singletonList("give");
        }
        if (args.length == 2 && args[0].equalsIgnoreCase("give")) {
            return Bukkit.getOnlinePlayers().stream().map(Player::getName).collect(Collectors.toList());
        }
        return Collections.emptyList();
    }
}
