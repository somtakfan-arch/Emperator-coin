package com.bedsmp.thornsward;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import org.bukkit.Bukkit;
import org.bukkit.Material;
import org.bukkit.Sound;
import org.bukkit.entity.Player;
import org.bukkit.inventory.Inventory;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Supplier;

public final class ThornsWardShop {

    static final Component TITLE = Component.text("✦ Магазин Перьев ✦")
            .color(NamedTextColor.GOLD)
            .decoration(TextDecoration.ITALIC, false);

    // 26 inner slots across rows 1-4 of a 54-slot chest
    private static final int[] INNER_SLOTS = {
            10, 11, 12, 13, 14, 15, 16,
            19, 20, 21, 22, 23, 24, 25,
            28, 29, 30, 31, 32, 33, 34,
            37, 38, 39, 40, 41
    };

    private record Entry(Supplier<ItemStack> creator, String configKey) {}

    private final JavaPlugin plugin;
    private final List<Entry> entries = new ArrayList<>();
    private final PlayerPointsHook ppHook;

    public ThornsWardShop(JavaPlugin plugin) {
        this.plugin  = plugin;
        this.ppHook  = PlayerPointsHook.create(plugin);

        entries.add(new Entry(new ThornsWardItem(plugin)::create,      "shop.thornsward"));
        entries.add(new Entry(new CrystallerSwordItem(plugin)::create, "shop.crystallersword"));
        entries.add(new Entry(new AmethystAxeItem(plugin)::create,     "shop.amethystaxe"));
        entries.add(new Entry(new NemesisItem(plugin)::create,         "shop.nemesis"));
        entries.add(new Entry(new PhantomItem(plugin)::create,         "shop.phantom"));
        entries.add(new Entry(new MirrorShieldItem(plugin)::create,    "shop.mirrorshield"));
        entries.add(new Entry(new InstantAppleItem(plugin)::create,    "shop.instantapple"));
        entries.add(new Entry(new RevengeThornItem(plugin)::create,    "shop.revengethorn"));
        entries.add(new Entry(new SoulLanternItem(plugin)::create,     "shop.soullantern"));
        entries.add(new Entry(new DragonRoarItem(plugin)::create,      "shop.dragonroar"));
        entries.add(new Entry(new ZeusTridentItem(plugin)::create,     "shop.zeustrident"));
        entries.add(new Entry(new SpiritMaskItem(plugin)::create,      "shop.spiritmask"));
        entries.add(new Entry(new ShadowCloakItem(plugin)::create,     "shop.shadowcloak"));
        entries.add(new Entry(new IronCanopyItem(plugin)::create,      "shop.ironcanopy"));
        entries.add(new Entry(new LeviathanArmorItem(plugin)::create,  "shop.leviathanarmor"));
        entries.add(new Entry(new ThiefsHoodItem(plugin)::create,      "shop.thiefhood"));
        entries.add(new Entry(new ChronoStoneItem(plugin)::create,     "shop.chronostone"));
        entries.add(new Entry(new SpiderThreadItem(plugin)::create,    "shop.spiderthread"));
        entries.add(new Entry(new PhoenixAshItem(plugin)::create,      "shop.phoenixash"));
        entries.add(new Entry(new EchoPastItem(plugin)::create,        "shop.echopast"));
        entries.add(new Entry(new GravityTrapItem(plugin)::create,     "shop.gravitytrap"));
        entries.add(new Entry(new ChaosWhistleItem(plugin)::create,    "shop.chaoswhistle"));
        entries.add(new Entry(new ServerHeartItem(plugin)::create,     "shop.serverheart"));
        entries.add(new Entry(new VoodooDollItem(plugin)::create,      "shop.voodoodoll"));
        entries.add(new Entry(new ChaosFeatherItem(plugin)::create,    "shop.chaosfeather"));
        entries.add(new Entry(new SuperTntItem(plugin)::create,        "shop.supertnt"));
    }

    public Inventory buildInventory() {
        Inventory inv = Bukkit.createInventory(new ShopHolder(), 54, TITLE);

        // Fill all slots with glass pane border
        ItemStack pane = new ItemStack(Material.PURPLE_STAINED_GLASS_PANE);
        ItemMeta pm = pane.getItemMeta();
        pm.displayName(Component.empty());
        pane.setItemMeta(pm);
        for (int i = 0; i < 54; i++) inv.setItem(i, pane);

        // Place shop items in inner slots
        for (int i = 0; i < entries.size(); i++) {
            int slot = INNER_SLOTS[i];
            Entry entry = entries.get(i);
            int price = plugin.getConfig().getInt(entry.configKey(), 500);
            inv.setItem(slot, withPriceLore(entry.creator().get(), price));
        }

        return inv;
    }

    void handleClick(int rawSlot, UUID playerId, Player player) {
        int idx = indexOf(rawSlot);
        if (idx < 0) return;

        if (ppHook == null) {
            player.sendMessage(Component.text("Магазин недоступен: PlayerPoints не установлен.", NamedTextColor.RED));
            return;
        }

        Entry entry = entries.get(idx);
        int price   = plugin.getConfig().getInt(entry.configKey(), 500);
        int balance = ppHook.look(playerId);

        if (balance < price) {
            player.sendMessage(Component.text("Недостаточно перьев! Нужно: ", NamedTextColor.RED)
                    .append(Component.text(price + "", NamedTextColor.YELLOW))
                    .append(Component.text(", у вас: ", NamedTextColor.RED))
                    .append(Component.text(balance + "", NamedTextColor.YELLOW)));
            player.playSound(player.getLocation(), Sound.ENTITY_VILLAGER_NO, 1f, 1f);
            return;
        }

        if (!ppHook.take(playerId, price)) {
            player.sendMessage(Component.text("Ошибка списания перьев!", NamedTextColor.RED));
            return;
        }

        ItemStack bought = entry.creator().get();
        player.getInventory().addItem(bought).values()
                .forEach(i -> player.getWorld().dropItemNaturally(player.getLocation(), i));

        player.closeInventory();
        player.sendMessage(Component.text("Куплено за ", NamedTextColor.GREEN)
                .append(Component.text(price + " перьев!", NamedTextColor.YELLOW)));
        player.playSound(player.getLocation(), Sound.ENTITY_PLAYER_LEVELUP, 1f, 1.2f);
    }

    private int indexOf(int slot) {
        for (int i = 0; i < INNER_SLOTS.length; i++) {
            if (INNER_SLOTS[i] == slot && i < entries.size()) return i;
        }
        return -1;
    }

    private ItemStack withPriceLore(ItemStack item, int price) {
        ItemStack display = item.clone();
        ItemMeta meta = display.getItemMeta();
        List<Component> lore = new ArrayList<>(meta.lore() != null ? meta.lore() : List.of());
        lore.add(Component.empty());
        lore.add(Component.text("Цена: ", NamedTextColor.GOLD)
                .append(Component.text(price + " перьев", NamedTextColor.YELLOW))
                .decoration(TextDecoration.ITALIC, false));
        meta.lore(lore);
        display.setItemMeta(meta);
        return display;
    }
}
