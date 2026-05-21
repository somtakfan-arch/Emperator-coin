package pro.bedsmp.emperorsword.command;

import net.kyori.adventure.text.Component;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;
import org.bukkit.entity.Player;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;
import org.jetbrains.annotations.NotNull;
import pro.bedsmp.emperorsword.level.LevelConfig;
import pro.bedsmp.emperorsword.level.SwordLevel;
import pro.bedsmp.emperorsword.quest.QuestType;
import pro.bedsmp.emperorsword.sword.SwordData;
import pro.bedsmp.emperorsword.sword.SwordManager;
import pro.bedsmp.emperorsword.util.Messages;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Обработчик команд /es (алиас /emperorsword).
 *
 * Подкоманды:
 *   /es give <игрок>             — выдать меч (admin)
 *   /es setlevel <игрок> <уровень> — задать уровень (admin)
 *   /es info                      — посмотреть прогресс
 *   /es reload                    — перезагрузить конфиги (admin)
 *   /es help                      — помощь
 */
public class EmperorSwordCommand implements CommandExecutor, TabCompleter {

    private final JavaPlugin plugin;
    private final SwordManager swordManager;
    private final SwordData swordData;
    private final LevelConfig levelConfig;

    public EmperorSwordCommand(JavaPlugin plugin, SwordManager swordManager, LevelConfig levelConfig) {
        this.plugin = plugin;
        this.swordManager = swordManager;
        this.swordData = swordManager.getSwordData();
        this.levelConfig = levelConfig;
    }

    @Override
    public boolean onCommand(@NotNull CommandSender sender, @NotNull Command command,
                             @NotNull String label, @NotNull String[] args) {
        if (args.length == 0) {
            sender.sendMessage(Messages.parse(Messages.HELP));
            return true;
        }

        String sub = args[0].toLowerCase();
        switch (sub) {
            case "give"     -> cmdGive(sender, args);
            case "setlevel" -> cmdSetLevel(sender, args);
            case "info"     -> cmdInfo(sender);
            case "reload"   -> cmdReload(sender);
            case "help"     -> sender.sendMessage(Messages.parse(Messages.HELP));
            default         -> sender.sendMessage(Messages.parse(Messages.UNKNOWN_SUBCOMMAND));
        }
        return true;
    }

    // ——————————————————————————————————————————
    // Подкоманды
    // ——————————————————————————————————————————

    private void cmdGive(CommandSender sender, String[] args) {
        if (!sender.hasPermission("emperorsword.admin")) {
            sender.sendMessage(Messages.parse(Messages.NO_PERMISSION));
            return;
        }
        if (args.length < 2) {
            sender.sendMessage(Messages.parse(Messages.USAGE_GIVE));
            return;
        }

        Player target = Bukkit.getPlayer(args[1]);
        if (target == null) {
            sender.sendMessage(Messages.playerNotFound(args[1]));
            return;
        }

        // Проверяем, нет ли уже меча (если allow-multiple отключён)
        if (!plugin.getConfig().getBoolean("allow-multiple-swords", false)
                && swordManager.hasSword(target)) {
            sender.sendMessage(Messages.alreadyHasSword(target.getName()));
            return;
        }

        // Создаём меч
        ItemStack sword = swordManager.createSword(target.getUniqueId());

        // Отдаём в инвентарь или дропаем у ног если нет места
        var overflow = target.getInventory().addItem(sword);
        if (!overflow.isEmpty()) {
            target.getWorld().dropItemNaturally(target.getLocation(), sword);
            sender.sendMessage(Messages.inventoryFull(target.getName()));
        } else {
            sender.sendMessage(Messages.swordGiven(target.getName()));
            target.sendMessage(Messages.swordReceived());
        }
    }

    private void cmdSetLevel(CommandSender sender, String[] args) {
        if (!sender.hasPermission("emperorsword.admin")) {
            sender.sendMessage(Messages.parse(Messages.NO_PERMISSION));
            return;
        }
        if (args.length < 3) {
            sender.sendMessage(Messages.parse(Messages.USAGE_SETLEVEL));
            return;
        }

        Player target = Bukkit.getPlayer(args[1]);
        if (target == null) {
            sender.sendMessage(Messages.playerNotFound(args[1]));
            return;
        }

        int targetLevel;
        try {
            targetLevel = Integer.parseInt(args[2]);
        } catch (NumberFormatException e) {
            sender.sendMessage(Messages.invalidLevel(levelConfig.getMaxLevel()));
            return;
        }

        if (targetLevel < levelConfig.getMinLevel() || targetLevel > levelConfig.getMaxLevel()) {
            sender.sendMessage(Messages.invalidLevel(levelConfig.getMaxLevel()));
            return;
        }

        ItemStack sword = swordManager.findSwordInInventory(target);
        if (sword == null) {
            sender.sendMessage(Messages.playerHasNoSword(target.getName()));
            return;
        }

        swordManager.forceSetLevel(sword, targetLevel);
        sender.sendMessage(Messages.levelSet(target.getName(), targetLevel));

        // Сообщаем цели
        SwordLevel level = levelConfig.getLevel(targetLevel);
        if (level != null) {
            target.sendMessage(Messages.levelUp(targetLevel, level.getName()));
        }
    }

    private void cmdInfo(CommandSender sender) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage(Messages.parse(Messages.PREFIX + "<red>Только для игроков.</red>"));
            return;
        }
        if (!player.hasPermission("emperorsword.use")) {
            player.sendMessage(Messages.parse(Messages.NO_PERMISSION));
            return;
        }

        ItemStack sword = swordManager.findSwordInInventory(player);
        if (sword == null) {
            player.sendMessage(Messages.parse(Messages.INFO_NO_SWORD));
            return;
        }

        int currentLevelNum = swordData.getLevel(sword);
        SwordLevel currentLevel = levelConfig.getLevel(currentLevelNum);

        player.sendMessage(Messages.parse(Messages.INFO_HEADER));
        player.sendMessage(Messages.parse(Messages.INFO_TITLE));
        player.sendMessage(Messages.parse(Messages.INFO_HEADER));

        if (currentLevel != null) {
            player.sendMessage(Messages.infoLevel(currentLevelNum, currentLevel.getName()));
        }

        SwordLevel nextLevel = levelConfig.getNextLevel(currentLevelNum);
        if (nextLevel == null) {
            player.sendMessage(Messages.parse(Messages.INFO_MAX_LEVEL));
        } else {
            player.sendMessage(Messages.parse(Messages.INFO_PROGRESS_HEADER));
            for (Map.Entry<QuestType, Long> req : nextLevel.getRequirements().entrySet()) {
                long progress = swordData.getProgress(sword, req.getKey());
                player.sendMessage(Messages.infoProgressLine(
                        req.getKey().getDisplayName(),
                        Math.min(progress, req.getValue()),
                        req.getValue()));
            }
        }

        player.sendMessage(Messages.parse(Messages.INFO_HEADER));
    }

    private void cmdReload(CommandSender sender) {
        if (!sender.hasPermission("emperorsword.admin")) {
            sender.sendMessage(Messages.parse(Messages.NO_PERMISSION));
            return;
        }

        plugin.reloadConfig();
        levelConfig.load();
        sender.sendMessage(Messages.parse(Messages.CONFIG_RELOADED));
    }

    // ——————————————————————————————————————————
    // Tab-completion
    // ——————————————————————————————————————————

    @Override
    public List<String> onTabComplete(@NotNull CommandSender sender, @NotNull Command command,
                                      @NotNull String label, @NotNull String[] args) {
        List<String> completions = new ArrayList<>();

        if (args.length == 1) {
            List<String> subs = new ArrayList<>(Arrays.asList("info", "help"));
            if (sender.hasPermission("emperorsword.admin")) {
                subs.addAll(Arrays.asList("give", "setlevel", "reload"));
            }
            return filterStartsWith(subs, args[0]);
        }

        if (args.length == 2) {
            String sub = args[0].toLowerCase();
            if ((sub.equals("give") || sub.equals("setlevel"))
                    && sender.hasPermission("emperorsword.admin")) {
                return Bukkit.getOnlinePlayers().stream()
                        .map(Player::getName)
                        .filter(n -> n.toLowerCase().startsWith(args[1].toLowerCase()))
                        .collect(Collectors.toList());
            }
        }

        if (args.length == 3 && args[0].equalsIgnoreCase("setlevel")
                && sender.hasPermission("emperorsword.admin")) {
            // Предлагаем уровни от минимума до максимума
            for (int i = levelConfig.getMinLevel(); i <= levelConfig.getMaxLevel(); i++) {
                String s = String.valueOf(i);
                if (s.startsWith(args[2])) {
                    completions.add(s);
                }
            }
            return completions;
        }

        return completions;
    }

    private List<String> filterStartsWith(List<String> list, String prefix) {
        return list.stream()
                .filter(s -> s.toLowerCase().startsWith(prefix.toLowerCase()))
                .collect(Collectors.toList());
    }
}
