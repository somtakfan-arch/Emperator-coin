package me.bedsmp.bedahbots;

import me.elaineqheart.auctionHouse.data.StringUtils;
import me.elaineqheart.auctionHouse.data.persistentStorage.ItemNoteStorage;
import me.elaineqheart.auctionHouse.data.persistentStorage.ItemStackConverter;
import me.elaineqheart.auctionHouse.data.persistentStorage.local.SettingManager;
import me.elaineqheart.auctionHouse.data.ram.AuctionHouseStorage;
import me.elaineqheart.auctionHouse.data.ram.ItemNote;
import org.bukkit.inventory.ItemStack;
import sun.misc.Unsafe;

import java.lang.reflect.Field;
import java.util.*;
import java.util.logging.Logger;

/**
 * Forges an {@link ItemNote} without an online Player by using sun.misc.Unsafe
 * to allocate the object and set its final/private fields directly.
 *
 * Field layout verified from javap decompilation of AuctionHouse 1.4.5.
 *
 * getTimeLeft() formula (from bytecode):
 *   return auctionTime + SettingManager.auctionSetupTime - (now - dateCreated.getTime()) / 1000
 *
 * isOnWaitingList(): return getTimeLeft() > auctionTime
 *   → true when setupTime > elapsed, i.e. the lot hasn't "started" yet.
 *
 * To skip the waiting list we set dateCreated = now - (setupTime + 1) seconds.
 */
public final class NoteForger {

    private static final Unsafe UNSAFE;

    // Field offsets cached at class-load time
    private static final long OFF_BID_HISTORY;
    private static final long OFF_CLAIMED_PLAYERS;
    private static final long OFF_NOTE_ID;
    private static final long OFF_PLAYER_NAME;
    private static final long OFF_BUYER_NAME;
    private static final long OFF_BUYER_UUID;
    private static final long OFF_PLAYER_UUID;
    private static final long OFF_DATE_CREATED;
    private static final long OFF_ITEM_DATA;
    private static final long OFF_PRICE;
    private static final long OFF_IS_SOLD;
    private static final long OFF_AUCTION_TIME;
    private static final long OFF_ITEM_NAME;
    private static final long OFF_IS_BID_AUCTION;
    private static final long OFF_ADMIN_MESSAGE;
    private static final long OFF_PARTIALLY_SOLD;

    static {
        try {
            Field unsafeField = Unsafe.class.getDeclaredField("theUnsafe");
            unsafeField.setAccessible(true);
            UNSAFE = (Unsafe) unsafeField.get(null);

            OFF_BID_HISTORY       = fieldOffset("bidHistory");
            OFF_CLAIMED_PLAYERS   = fieldOffset("claimedPlayers");
            OFF_NOTE_ID           = fieldOffset("noteID");
            OFF_PLAYER_NAME       = fieldOffset("playerName");
            OFF_BUYER_NAME        = fieldOffset("buyerName");
            OFF_BUYER_UUID        = fieldOffset("buyerUUID");
            OFF_PLAYER_UUID       = fieldOffset("playerUUID");
            OFF_DATE_CREATED      = fieldOffset("dateCreated");
            OFF_ITEM_DATA         = fieldOffset("itemData");
            OFF_PRICE             = fieldOffset("price");
            OFF_IS_SOLD           = fieldOffset("isSold");
            OFF_AUCTION_TIME      = fieldOffset("auctionTime");
            OFF_ITEM_NAME         = fieldOffset("itemName");
            OFF_IS_BID_AUCTION    = fieldOffset("isBIDAuction");
            OFF_ADMIN_MESSAGE     = fieldOffset("adminMessage");
            OFF_PARTIALLY_SOLD    = fieldOffset("partiallySoldAmountLeft");
        } catch (Exception e) {
            throw new ExceptionInInitializerError("BedAHBots: Failed to initialise NoteForger — " + e.getMessage());
        }
    }

    private static long fieldOffset(String name) throws NoSuchFieldException {
        Field f = ItemNote.class.getDeclaredField(name);
        f.setAccessible(true);
        return UNSAFE.objectFieldOffset(f);
    }

    private NoteForger() {}

    /**
     * Creates a BIN lot visible in /ah owned by the given bot.
     *
     * @param botUUID      deterministic UUID of the bot seller
     * @param displayName  name shown in /ah (may contain colour codes)
     * @param item         item to list (will be cloned)
     * @param price        listing price (already rounded/validated by caller)
     * @param listingHours how long the lot stays active (hours)
     * @param log          logger for non-fatal warnings
     * @return the forged note, already registered in AuctionHouseStorage
     */
    public static ItemNote forge(UUID botUUID, String displayName, ItemStack item,
                                 double price, long listingHours, Logger log) throws Exception {
        // Encode the item FIRST — if this fails we abort cleanly before touching AH state
        String itemData = ItemStackConverter.encode(item);

        String itemName;
        try {
            itemName = StringUtils.getItemName(item);
        } catch (Exception e) {
            itemName = item.getType().name();
            log.warning("getItemName() failed for " + item.getType() + ": " + e.getMessage());
        }

        // Setup-time offset so the lot is immediately past the "waiting list" phase:
        //   getTimeLeft() = auctionTime + setupTime - elapsed
        //   isOnWaitingList() = timeLeft > auctionTime  →  setupTime > elapsed
        // We need elapsed > setupTime, so dateCreated = now - (setupTime + 1)s
        long setupTime = SettingManager.auctionSetupTime; // seconds (public static long)
        Date dateCreated = new Date(System.currentTimeMillis() - (setupTime + 1) * 1000L);

        UUID noteID = UUID.randomUUID();

        // Allocate ItemNote without calling its constructor (which needs an online Player)
        @SuppressWarnings("unchecked")
        ItemNote note = (ItemNote) UNSAFE.allocateInstance(ItemNote.class);

        // Set every field the constructor would have set, plus defaults for the rest
        UNSAFE.putObject(note, OFF_BID_HISTORY,     new ArrayList<>());
        UNSAFE.putObject(note, OFF_CLAIMED_PLAYERS, new HashSet<>());
        UNSAFE.putObject(note, OFF_NOTE_ID,         noteID);
        UNSAFE.putObject(note, OFF_PLAYER_NAME,     displayName);
        UNSAFE.putObject(note, OFF_BUYER_NAME,      null);
        UNSAFE.putObject(note, OFF_BUYER_UUID,      null);
        UNSAFE.putObject(note, OFF_PLAYER_UUID,     botUUID);
        UNSAFE.putObject(note, OFF_DATE_CREATED,    dateCreated);
        UNSAFE.putObject(note, OFF_ITEM_DATA,       itemData);
        UNSAFE.putDouble(note, OFF_PRICE,           price);
        UNSAFE.putBoolean(note, OFF_IS_SOLD,        false);
        UNSAFE.putLong(note, OFF_AUCTION_TIME,      listingHours * 3600L);
        UNSAFE.putObject(note, OFF_ITEM_NAME,       itemName);
        UNSAFE.putBoolean(note, OFF_IS_BID_AUCTION, false);
        UNSAFE.putObject(note, OFF_ADMIN_MESSAGE,   null);
        UNSAFE.putInt(note, OFF_PARTIALLY_SOLD,     0);

        // Mirror what the constructor does at the end: populate the items RAM-map
        ItemNoteStorage.addItem(noteID, item);

        // Register in AuctionHouseStorage (adds to sorted lists if isOnAuction() && !isExpired())
        AuctionHouseStorage.add(note);

        // Persist all notes (including this new one) — saveNotes serialises getAll() to JSON
        try {
            ItemNoteStorage.saveNotes();
        } catch (Exception e) {
            log.warning("saveNotes() failed after forging note: " + e.getMessage());
        }

        return note;
    }

    /**
     * Removes a bot note from AH cleanly.
     * ItemNoteStorage.deleteNote → AuctionHouseStorage.remove + saveNotes + removeItem.
     */
    public static void deleteNote(ItemNote note, Logger log) {
        try {
            ItemNoteStorage.deleteNote(note);
        } catch (Throwable t) {
            log.warning("deleteNote() failed: " + t);
        }
    }
}
