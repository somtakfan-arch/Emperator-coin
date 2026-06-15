package pro.bedsmp.bedbots;

import net.citizensnpcs.api.npc.NPC;
import org.bukkit.Location;

/** Один бот: его имя, скин, характер и привязанный Citizens-NPC. */
public class Bot {
    private final String name;
    private final String skin;
    private final String personality;

    private NPC npc;
    private Location home;            // точка, вокруг которой бот бродит
    private volatile long lastReplyMillis = 0L;

    public Bot(String name, String skin, String personality) {
        this.name = name;
        this.skin = skin;
        this.personality = personality;
    }

    public String getName() { return name; }
    public String getSkin() { return skin; }
    public String getPersonality() { return personality; }

    public NPC getNpc() { return npc; }
    public void setNpc(NPC npc) { this.npc = npc; }

    public Location getHome() { return home; }
    public void setHome(Location home) { this.home = home; }

    public long getLastReplyMillis() { return lastReplyMillis; }
    public void setLastReplyMillis(long t) { this.lastReplyMillis = t; }
}
