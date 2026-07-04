package com.bedsmp.thornsward;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;
import org.bukkit.event.inventory.InventoryClickEvent;

public final class ThornsWardShopListener implements Listener {

    private final ThornsWardShop shop;

    public ThornsWardShopListener(ThornsWardShop shop) {
        this.shop = shop;
    }

    @EventHandler
    public void onInventoryClick(InventoryClickEvent event) {
        if (!(event.getView().getTopInventory().getHolder() instanceof ShopHolder)) return;
        if (!(event.getWhoClicked() instanceof Player player)) return;

        // Cancel everything (prevents item movement from player inventory too)
        event.setCancelled(true);

        // Only act on clicks within the chest itself
        if (event.getClickedInventory() == null) return;
        if (!(event.getClickedInventory().getHolder() instanceof ShopHolder)) return;

        shop.handleClick(event.getRawSlot(), player.getUniqueId(), player);
    }
}
