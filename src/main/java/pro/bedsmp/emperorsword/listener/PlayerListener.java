package pro.bedsmp.emperorsword.listener;

import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.PlayerDeathEvent;
import org.bukkit.event.player.PlayerQuitEvent;
import org.bukkit.inventory.ItemStack;
import pro.bedsmp.emperorsword.sword.SwordManager;

import java.util.UUID;

/**
 * Общие события игрока: выход, смерть.
 */
public class PlayerListener implements Listener {

    private final SwordManager swordManager;
    private final MiningListener miningListener;

    public PlayerListener(SwordManager swordManager, MiningListener miningListener) {
        this.swordManager = swordManager;
        this.miningListener = miningListener;
    }

    /** Очищаем кэш расстояния при выходе */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onPlayerQuit(PlayerQuitEvent event) {
        miningListener.clearPlayer(event.getPlayer().getUniqueId());
    }

    /**
     * Обновляем lore меча при смерти игрока чтобы прогресс
     * отображался корректно если меч поднимет другой игрок.
     */
    @EventHandler(priority = EventPriority.MONITOR)
    public void onPlayerDeath(PlayerDeathEvent event) {
        Player player = event.getEntity();
        ItemStack sword = swordManager.findSwordInInventory(player);
        if (sword == null) return;

        UUID ownerUuid = swordManager.getSwordData().getOwner(sword);
        swordManager.refreshLore(sword, ownerUuid);
    }
}
