package pro.bedsmp.bedbots;

import io.papermc.paper.event.player.AsyncChatEvent;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.serializer.plain.PlainTextComponentSerializer;
import org.bukkit.Bukkit;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ThreadLocalRandom;

/** Слушает чат игроков и решает, ответит ли кто-то из ботов. */
public class ChatListener implements Listener {

    private static final String RULES =
            " Ты играешь на Minecraft-сервере BedSMP и пишешь в игровой чат. " +
            "Отвечай ТОЛЬКО на русском, очень коротко — одно предложение, как подросток в игре, можно сленг и сокращения. " +
            "Никогда не используй мат, оскорбления по национальности, угрозы в реальной жизни, контент 18+ или политику. " +
            "Не признавайся, что ты бот или ИИ. Не повторяй чужие сообщения дословно.";

    private final BedBots plugin;
    private final BotManager bots;
    private final GroqClient groq;

    private final double replyChance;
    private final boolean replyOnMention;
    private final long globalCooldownMs;
    private final long botCooldownMs;
    private final int historySize;
    private final long delayMinMs;
    private final long delayMaxMs;

    private final Deque<String> history = new ArrayDeque<>();
    private volatile long lastGlobalReply = 0L;

    public ChatListener(BedBots plugin, BotManager bots, GroqClient groq) {
        this.plugin = plugin;
        this.bots = bots;
        var cfg = plugin.getConfig();
        this.replyChance = cfg.getDouble("chat.reply-chance", 0.25);
        this.replyOnMention = cfg.getBoolean("chat.reply-on-mention", true);
        this.globalCooldownMs = cfg.getLong("chat.global-cooldown-seconds", 6) * 1000L;
        this.botCooldownMs = cfg.getLong("chat.bot-cooldown-seconds", 20) * 1000L;
        this.historySize = cfg.getInt("chat.history-size", 8);
        this.delayMinMs = cfg.getLong("chat.reply-delay-min-ms", 800);
        this.delayMaxMs = cfg.getLong("chat.reply-delay-max-ms", 2500);
        this.groq = groq;
    }

    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onChat(AsyncChatEvent event) {
        String playerName = event.getPlayer().getName();
        String text = PlainTextComponentSerializer.plainText().serialize(event.message()).trim();
        if (text.isEmpty()) return;

        // запоминаем сообщение в общую историю
        synchronized (history) {
            history.addLast("<" + playerName + "> " + text);
            while (history.size() > historySize) {
                history.removeFirst();
            }
        }

        if (!groq.isConfigured()) return;

        Bot target;
        long now = System.currentTimeMillis();
        synchronized (this) {
            // глобальный кулдаун
            if (now - lastGlobalReply < globalCooldownMs) return;

            Bot mentioned = replyOnMention ? bots.findMentioned(text) : null;
            if (mentioned != null) {
                target = mentioned;
            } else if (ThreadLocalRandom.current().nextDouble() < replyChance) {
                target = bots.randomBot();
            } else {
                return;
            }
            if (target == null) return;

            // персональный кулдаун бота
            if (now - target.getLastReplyMillis() < botCooldownMs) return;

            // резервируем право ответа сразу (оптимистично)
            lastGlobalReply = now;
            target.setLastReplyMillis(now);
        }

        String context = buildContext();
        final Bot chosen = target;
        String system = chosen.getPersonality() + RULES;

        groq.chat(system, context).thenAccept(reply -> {
            if (reply == null || reply.isBlank()) return;
            scheduleSay(chosen, reply);
        });
    }

    private String buildContext() {
        StringBuilder sb = new StringBuilder("Последние сообщения в чате:\n");
        synchronized (history) {
            for (String line : history) {
                sb.append(line).append('\n');
            }
        }
        sb.append("\nНапиши одно короткое сообщение в чат от своего лица, оставаясь в роли. ")
          .append("Только текст реплики, без кавычек и без имени в начале.");
        return sb.toString();
    }

    /** Отправляет реплику в чат с небольшой «человеческой» задержкой. */
    private void scheduleSay(Bot bot, String reply) {
        long delayMs = ThreadLocalRandom.current().nextLong(delayMinMs, Math.max(delayMinMs + 1, delayMaxMs));
        long delayTicks = Math.max(1L, delayMs / 50L);
        Bukkit.getScheduler().runTaskLater(plugin, () -> {
            Component msg = Component.text("<" + bot.getName() + "> ", NamedTextColor.GRAY)
                    .append(Component.text(reply, NamedTextColor.WHITE));
            Bukkit.getServer().broadcast(msg);

            // добавляем ответ бота в историю, чтобы диалог был связным
            synchronized (history) {
                history.addLast("<" + bot.getName() + "> " + reply);
                while (history.size() > historySize) {
                    history.removeFirst();
                }
            }
        }, delayTicks);
    }
}
