package pro.bedsmp.visuals.client.state;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/** Лента убийств: очередь записей. */
@Environment(EnvType.CLIENT)
public class KillFeedState {

    private static KillFeedState INSTANCE;

    public static KillFeedState get() {
        if (INSTANCE == null) INSTANCE = new KillFeedState();
        return INSTANCE;
    }

    public static class Entry {
        public final String killer;
        public final String victim;
        public final String weapon;   // null если неизвестно
        public final long addedTick;

        public Entry(String killer, String victim, String weapon, long tick) {
            this.killer = killer;
            this.victim = victim;
            this.weapon = weapon;
            this.addedTick = tick;
        }
    }

    private final Deque<Entry> entries = new ArrayDeque<>();

    public void add(String killer, String victim, String weapon, long tick, int maxLines) {
        entries.addFirst(new Entry(killer, victim, weapon, tick));
        while (entries.size() > maxLines) entries.removeLast();
    }

    public List<Entry> getEntries() {
        return new ArrayList<>(entries);
    }

    /** Удалить устаревшие записи (ticks > lifeTicks). */
    public void purge(long currentTick, int lifeTicks) {
        entries.removeIf(e -> currentTick - e.addedTick > lifeTicks);
    }

    public void clear() {
        entries.clear();
    }
}
