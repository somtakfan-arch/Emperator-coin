package com.bedsmp.unbreakablestand.commands;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;

import java.util.function.IntFunction;

public final class GiveItemCommand implements CommandExecutor {

    private final IntFunction<ItemStack> itemSupplier;

    public GiveItemCommand(IntFunction<ItemStack> itemSupplier) {
        this.itemSupplier = itemSupplier;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("§cЭту команду может использовать только игрок.");
            return true;
        }

        int amount = 1;
        if (args.length > 0) {
            try {
                amount = Integer.parseInt(args[0]);
            } catch (NumberFormatException e) {
                player.sendMessage("§cКоличество должно быть числом.");
                return true;
            }
        }

        if (amount < 1 || amount > 64) {
            player.sendMessage("§cКоличество должно быть от 1 до 64.");
            return true;
        }

        ItemStack item = itemSupplier.apply(amount);
        player.getInventory().addItem(item).values()
                .forEach(leftover -> player.getWorld().dropItemNaturally(player.getLocation(), leftover));

        player.sendMessage("§aВыдано: " + amount + " шт.");
        return true;
    }
}
