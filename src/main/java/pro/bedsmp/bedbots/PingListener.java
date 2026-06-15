package pro.bedsmp.bedbots;

import com.destroystokyo.paper.event.server.PaperServerListPingEvent;
import org.bukkit.event.EventHandler;
import org.bukkit.event.Listener;

/** Добавляет ботов в счётчик онлайна в списке серверов. */
public class PingListener implements Listener {

    private final BotManager bots;

    public PingListener(BotManager bots) {
        this.bots = bots;
    }

    @EventHandler
    public void onPing(PaperServerListPingEvent event) {
        event.setNumPlayers(event.getNumPlayers() + bots.botCount());
    }
}
