package me.bedsmp.bedahbots;

import me.bedsmp.bedahbots.GrokParser.EnchantPick;
import me.bedsmp.bedahbots.GrokParser.ParseResult;
import org.bukkit.ChatColor;
import org.bukkit.Material;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.player.AsyncPlayerChatEvent;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

/**
 * Listens to chat for configured trigger phrases (e.g. "пж выстави"),
 * asks Grok to parse the item request, then has a bot list the item on /ah.
 */
public final class ChatRequestListener implements Listener {

    private final JavaPlugin plugin;
    private final BotManager botManager;
    private final WorthLoader worth;
    private final Logger log;

    // Per-player cooldown to prevent spam
    private final Map<UUID, Long> lastRequest = new ConcurrentHashMap<>();

    private boolean enabled;
    private List<String> triggers;
    private GrokParser parser;
    private double minPrice;
    private double roundTo;
    private long listingHours;
    private double priceMarkup;
    private double unknownBasePrice;
    private long cooldownMillis;

    public ChatRequestListener(JavaPlugin plugin, BotManager botManager, WorthLoader worth) {
        this.plugin = plugin;
        this.botManager = botManager;
        this.worth = worth;
        this.log = plugin.getLogger();
        this.triggers = new ArrayList<>();
    }

    public void reloadConfig(FileConfiguration cfg) {
        enabled = cfg.getBoolean("chat-requests.enabled", false);

        triggers = cfg.getStringList("chat-requests.triggers");
        if (triggers.isEmpty()) triggers = List.of("пж выстави", "выстави");

        String apiKey = cfg.getString("chat-requests.grok-api-key", "");
        String model  = cfg.getString("chat-requests.grok-model", "grok-3-mini");
        parser = apiKey.isBlank() ? null : new GrokParser(apiKey, model, log);

        listingHours     = cfg.getLong("listing.listing-hours", 12);
        minPrice         = cfg.getDouble("pricing.min-price", 1.0);
        roundTo          = cfg.getDouble("pricing.round-to", 0.01);
        priceMarkup      = cfg.getDouble("chat-requests.price-markup", 1.2);
        unknownBasePrice = cfg.getDouble("chat-requests.unknown-base-price", 10.0);
        cooldownMillis   = cfg.getLong("chat-requests.cooldown-seconds", 30) * 1000L;
    }

    @EventHandler(ignoreCancelled = true)
    public void onChat(AsyncPlayerChatEvent event) {
        if (!enabled) return;
        if (parser == null) return;

        String msg = event.getMessage().trim();
        String lower = msg.toLowerCase();
        String extracted = null;
        for (String trigger : triggers) {
            if (lower.startsWith(trigger.toLowerCase())) {
                extracted = msg.substring(trigger.length()).trim();
                break;
            }
        }
        if (extracted == null || extracted.isEmpty()) return;

        Player player = event.getPlayer();
        UUID uid = player.getUniqueId();

        long now = System.currentTimeMillis();
        Long last = lastRequest.get(uid);
        if (last != null && now - last < cooldownMillis) {
            long remaining = (cooldownMillis - (now - last)) / 1000;
            player.sendMessage(ChatColor.YELLOW + "[Боты] Подожди ещё " + remaining + " сек.");
            return;
        }
        lastRequest.put(uid, now);

        final String itemRequest = extracted;

        // Already on an async thread (AsyncPlayerChatEvent) — block here for the HTTP call.
        try {
            ParseResult result = parser.parse(itemRequest);
            plugin.getServer().getScheduler().runTask(plugin, () -> {
                try {
                    fulfillRequest(player, result);
                } catch (Exception e) {
                    player.sendMessage(ChatColor.RED + "[Боты] Ошибка при выставлении: " + e.getMessage());
                    log.warning("ChatRequest: fulfill failed — " + e.getMessage());
                }
            });
        } catch (Exception e) {
            player.sendMessage(ChatColor.RED + "[Боты] Не смог разобрать запрос: " + e.getMessage());
            log.warning("ChatRequest: Grok parse failed — " + e.getMessage());
        }
    }

    /** Must run on the main thread. */
    private void fulfillRequest(Player player, ParseResult result) throws Exception {
        Material mat = result.material();
        int amount = result.amount();
        List<EnchantPick> enchants = result.enchants();

        // Base price from worth, fallback to unknownBasePrice
        double unitWorth = worth.getWorth(mat);
        if (unitWorth <= 0) unitWorth = unknownBasePrice;

        // Compute enchant price bonus (same logic as EnchantApplier)
        double enchantMult = 1.0;
        for (EnchantPick ep : enchants) enchantMult += ep.level() * 0.15;

        double price = roundPrice(unitWorth * amount * priceMarkup * enchantMult);
        price = Math.max(price, minPrice);

        // Build the item
        ItemStack item = new ItemStack(mat, amount);
        if (!enchants.isEmpty()) {
            ItemMeta meta = item.getItemMeta();
            if (meta != null) {
                for (EnchantPick ep : enchants) {
                    boolean overLeveled = ep.level() > ep.enchantment().getMaxLevel();
                    meta.addEnchant(ep.enchantment(), ep.level(), overLeveled);
                }
                item.setItemMeta(meta);
            }
        }

        // Pick a random bot and forge the listing
        String botName = botManager.randomName();
        UUID botUUID = botManager.uuidFor(botName);
        String displayName = botManager.displayName(botName);

        NoteForger.forge(botUUID, displayName, item, price, listingHours, log);

        // Build a readable enchant label for the chat confirmation
        String enchantLabel = "";
        if (!enchants.isEmpty()) {
            StringBuilder sb = new StringBuilder(" (");
            for (int i = 0; i < enchants.size(); i++) {
                EnchantPick ep = enchants.get(i);
                if (i > 0) sb.append(", ");
                sb.append(ep.enchantment().getName()).append(" ").append(ep.level());
            }
            sb.append(")");
            enchantLabel = sb.toString();
        }

        String msg = ChatColor.GREEN + "[" + ChatColor.AQUA + botName + ChatColor.GREEN + "] "
                + ChatColor.WHITE + "Выставил " + amount + "x " + mat.name()
                + enchantLabel
                + " за " + ChatColor.YELLOW + String.format("%.2f", price);
        player.sendMessage(msg);
        log.info("[ChatRequest] " + player.getName() + " → " + botName + " выставил "
                + amount + "x " + mat.name() + enchantLabel + " за " + String.format("%.2f", price));
    }

    private double roundPrice(double price) {
        if (roundTo <= 0) return price;
        return Math.round(price / roundTo) * roundTo;
    }
}
