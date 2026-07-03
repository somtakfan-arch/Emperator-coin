package com.bedsmp.thornsward;
import net.kyori.adventure.text.Component;import net.kyori.adventure.text.format.NamedTextColor;
import org.bukkit.Bukkit;import org.bukkit.command.*;import org.bukkit.entity.Player;import org.bukkit.inventory.ItemStack;
import org.jetbrains.annotations.NotNull;import org.jetbrains.annotations.Nullable;
import java.util.*;import java.util.stream.Collectors;
public final class EchoPastCommand implements CommandExecutor, TabCompleter {
    private final EchoPastItem item;
    public EchoPastCommand(EchoPastItem item){this.item=item;}
    @Override public boolean onCommand(@NotNull CommandSender s,@NotNull Command c,@NotNull String l,@NotNull String[] a){
        if(a.length==0||!a[0].equalsIgnoreCase("give")){s.sendMessage(Component.text("Использование: /echopast give [игрок]",NamedTextColor.YELLOW));return true;}
        if(!s.hasPermission("bedsmp.echopast.give")){s.sendMessage(Component.text("Нет прав.",NamedTextColor.RED));return true;}
        Player t;if(a.length>=2){t=Bukkit.getPlayerExact(a[1]);if(t==null){s.sendMessage(Component.text("Игрок не найден: "+a[1],NamedTextColor.RED));return true;}}
        else if(s instanceof Player sp){t=sp;}else{s.sendMessage(Component.text("Укажите игрока.",NamedTextColor.RED));return true;}
        Map<Integer,ItemStack> left=t.getInventory().addItem(item.create());left.values().forEach(i->t.getWorld().dropItemNaturally(t.getLocation(),i));
        t.sendMessage(Component.text("Вы получили Эхо Прошлого!",NamedTextColor.GREEN));
        if(s!=t)s.sendMessage(Component.text("Выдано игроку "+t.getName(),NamedTextColor.GREEN));return true;}
    @Override public @Nullable List<String> onTabComplete(@NotNull CommandSender s,@NotNull Command c,@NotNull String al,@NotNull String[] args){
        if(args.length==1)return Collections.singletonList("give");
        if(args.length==2&&args[0].equalsIgnoreCase("give"))return Bukkit.getOnlinePlayers().stream().map(Player::getName).collect(Collectors.toList());
        return Collections.emptyList();}}
