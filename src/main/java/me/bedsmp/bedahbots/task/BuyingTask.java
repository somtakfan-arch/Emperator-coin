package me.bedsmp.bedahbots.task;

import me.bedsmp.bedahbots.BotManager;
import me.bedsmp.bedahbots.BotStock;
import me.bedsmp.bedahbots.NoteForger;
import me.bedsmp.bedahbots.WorthLoader;
import me.elaineqheart.auctionHouse.data.ram.AuctionHouseStorage;
import me.elaineqheart.auctionHouse.data.ram.ItemNote;
import me.elaineqheart.auctionHouse.pluginDependencies.VaultHook;
import net.milkbowl.vault.economy.Economy;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.inventory.ItemStack;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.logging.Logger;

/** Timer B — scans /ah for cheap lots and buys them into bot stock. */
public final class BuyingTask {

    private final JavaPlugin plugin;
    private final BotManager botManager;
    private final WorthLoader worth;
    private final BotStock stock;
    private final Logger log;

    private int perCycle;
    private double buyThreshold;
    private boolean buyFromBots;
    private boolean paySellers;

    public BuyingTask(JavaPlugin plugin, BotManager botManager, WorthLoader worth, BotStock stock) {
        this.plugin = plugin;
        this.botManager = botManager;
        this.worth = worth;
        this.stock = stock;
        this.log = plugin.getLogger();
    }

    public void reloadConfig(FileConfiguration cfg) {
        perCycle     = cfg.getInt("buying.per-cycle", 3);
        buyThreshold = cfg.getDouble("buying.buy-threshold", 1.05);
        buyFromBots  = cfg.getBoolean("buying.buy-from-bots", false);
        paySellers   = cfg.getBoolean("buying.pay-sellers", true);
    }

    /** Called by the scheduler and by /ahbots buy. Runs on the main thread. */
    public void runCycle() {
        List<ItemNote> candidates = collectCandidates();
        int bought = 0;
        for (ItemNote note : candidates) {
            if (bought >= perCycle) break;
            try {
                if (buyNote(note)) bought++;
            } catch (Exception e) {
                log.warning("BuyingTask: error on note " + note.getNoteID() + " — " + e.getMessage());
            }
        }
    }

    private List<ItemNote> collectCandidates() {
        List<ItemNote> all;
        try {
            all = AuctionHouseStorage.getAll();
        } catch (Exception e) {
            log.warning("BuyingTask: getAll() failed — " + e.getMessage());
            return List.of();
        }

        List<ItemNote> result = new ArrayList<>();
        for (ItemNote note : all) {
            if (note.isBIDAuction()) continue;
            if (note.isExpired())     continue;
            if (note.isSold())        continue;
            if (!buyFromBots && botManager.isBotUUID(note.getPlayerUUID())) continue;

            ItemStack item;
            try {
                item = note.getItem();
            } catch (Exception e) {
                continue;
            }
            if (item == null || item.getType().isAir()) continue;

            double unitWorth = worth.getWorth(item.getType());
            if (unitWorth <= 0) continue;

            double fair = unitWorth * item.getAmount();
            if (note.getPrice() <= fair * buyThreshold) {
                result.add(note);
            }
        }

        // Cheapest relative to worth first
        result.sort((a, b) -> Double.compare(relativePrice(a), relativePrice(b)));
        return result;
    }

    private double relativePrice(ItemNote note) {
        try {
            ItemStack item = note.getItem();
            if (item == null) return Double.MAX_VALUE;
            double unitWorth = worth.getWorth(item.getType());
            if (unitWorth <= 0) return Double.MAX_VALUE;
            double fair = unitWorth * item.getAmount();
            return fair > 0 ? note.getPrice() / fair : Double.MAX_VALUE;
        } catch (Exception e) {
            return Double.MAX_VALUE;
        }
    }

    private boolean buyNote(ItemNote note) throws Exception {
        // Re-validate — the note might have been removed since we scanned
        ItemNote live = AuctionHouseStorage.getNote(note.getNoteID());
        if (live == null || live.isSold() || live.isExpired()) return false;

        ItemStack item = live.getItem();
        if (item == null || item.getType().isAir()) return false;

        double price = live.getPrice();
        UUID sellerUUID = live.getPlayerUUID();
        boolean sellerIsBot = botManager.isBotUUID(sellerUUID);

        // Pay real-player sellers
        if (paySellers && !sellerIsBot) {
            try {
                Economy eco = VaultHook.getEconomy();
                if (eco != null) {
                    eco.depositPlayer(Bukkit.getOfflinePlayer(sellerUUID), price);
                }
            } catch (Exception e) {
                log.warning("BuyingTask: failed to pay seller " + sellerUUID + " — " + e.getMessage());
            }
        }

        // Remove from AH (internally: AuctionHouseStorage.remove + saveNotes + removeItem)
        NoteForger.deleteNote(live, log);

        stock.addItem(item);
        return true;
    }
}
