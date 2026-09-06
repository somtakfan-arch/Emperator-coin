package ru.bedsmp.noenchants;

import java.util.concurrent.atomic.AtomicLong;

/** Счётчики очистки — показываются в /noenchants stats. */
public final class Stats {

    private final AtomicLong items = new AtomicLong();
    private final AtomicLong containers = new AtomicLong();
    private final AtomicLong chunks = new AtomicLong();
    private final AtomicLong players = new AtomicLong();
    private final AtomicLong blockedEnchants = new AtomicLong();

    public void addItem() { items.incrementAndGet(); }
    public void addContainer() { containers.incrementAndGet(); }
    public void addChunk() { chunks.incrementAndGet(); }
    public void addPlayer() { players.incrementAndGet(); }
    public void addBlockedEnchant() { blockedEnchants.incrementAndGet(); }

    public long items() { return items.get(); }
    public long containers() { return containers.get(); }
    public long chunks() { return chunks.get(); }
    public long players() { return players.get(); }
    public long blockedEnchants() { return blockedEnchants.get(); }

    public void reset() {
        items.set(0);
        containers.set(0);
        chunks.set(0);
        players.set(0);
        blockedEnchants.set(0);
    }
}
