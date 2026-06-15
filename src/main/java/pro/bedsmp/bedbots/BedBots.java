package pro.bedsmp.bedbots;

import net.citizensnpcs.api.CitizensAPI;
import org.bukkit.Bukkit;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.plugin.java.JavaPlugin;

public class BedBots extends JavaPlugin {

    private BotManager botManager;
    private GroqClient groq;
    private ChatListener chatListener;

    @Override
    public void onEnable() {
        saveDefaultConfig();

        if (Bukkit.getPluginManager().getPlugin("Citizens") == null) {
            getLogger().severe("Citizens не найден! BedBots отключается. Поставь Citizens и перезапусти.");
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        groq = new GroqClient(
                getConfig().getString("groq.api-key", ""),
                getConfig().getString("groq.model", "llama-3.1-8b-instant"),
                getConfig().getInt("groq.max-tokens", 80),
                getConfig().getDouble("groq.temperature", 0.9),
                getLogger()
        );
        if (!groq.isConfigured()) {
            getLogger().warning("Groq API-ключ не указан в config.yml — боты будут ходить, но молчать.");
        }

        botManager = new BotManager(this);
        botManager.load(getConfig());

        chatListener = new ChatListener(this, botManager, groq);
        getServer().getPluginManager().registerEvents(chatListener, this);

        if (getConfig().getBoolean("serverlist.fake-online", true)) {
            getServer().getPluginManager().registerEvents(new PingListener(botManager), this);
        }

        // Даём Citizens полностью прогрузиться, затем чистим старых и спавним новых.
        if (getConfig().getBoolean("presence.spawn-on-start", true)) {
            Bukkit.getScheduler().runTaskLater(this, this::respawn, 60L);
        }

        getLogger().info("BedBots запущен. Ботов в конфиге: " + botManager.botCount());
    }

    @Override
    public void onDisable() {
        if (botManager != null) {
            botManager.shutdown();
        }
    }

    /** Полная пересборка ботов: убрать старых -> заспавнить -> запустить блуждание. */
    private void respawn() {
        if (!CitizensAPI.hasImplementation()) {
            getLogger().warning("Citizens ещё не готов, повторю спавн позже.");
            Bukkit.getScheduler().runTaskLater(this, this::respawn, 40L);
            return;
        }
        botManager.cleanup();
        botManager.spawnAll(getConfig());
        botManager.startWander(getConfig().getInt("presence.wander-interval-seconds", 8));
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!sender.hasPermission("bedbots.admin")) {
            sender.sendMessage("§cНет прав.");
            return true;
        }
        if (args.length == 0) {
            sender.sendMessage("§e/bedbots <reload|respawn|remove>");
            return true;
        }
        switch (args[0].toLowerCase()) {
            case "reload" -> {
                reloadConfig();
                botManager.shutdown();
                botManager.load(getConfig());
                respawn();
                sender.sendMessage("§aКонфиг перезагружен, боты пересозданы.");
            }
            case "respawn" -> {
                respawn();
                sender.sendMessage("§aБоты пересозданы.");
            }
            case "remove" -> {
                botManager.shutdown();
                sender.sendMessage("§aБоты убраны.");
            }
            default -> sender.sendMessage("§e/bedbots <reload|respawn|remove>");
        }
        return true;
    }
}
