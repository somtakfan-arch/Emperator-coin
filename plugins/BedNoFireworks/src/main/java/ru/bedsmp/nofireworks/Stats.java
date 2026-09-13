package ru.bedsmp.nofireworks;

import java.util.concurrent.atomic.AtomicLong;

/** Счётчики очистки — показываются в /nofireworks stats. */
public final class Stats {

    private final AtomicLong items = new AtomicLong();
    private final AtomicLong containers = new AtomicLong();
    private final AtomicLong chunks = new AtomicLong();
    private final AtomicLong players = new AtomicLong();
    private final AtomicLong entities = new AtomicLong();
    private final AtomicLong blockedUses = new AtomicLong();

    public void addItem(int amount) { items.addAndGet(amount); }
    public void addContainer() { containers.incrementAndGet(); }
    public void addChunk() { chunks.incrementAndGet(); }
    public void addPlayer() { players.incrementAndGet(); }
    public void addEntity() { entities.incrementAndGet(); }
    public void addBlockedUse() { blockedUses.incrementAndGet(); }

    public long items() { return items.get(); }
    public long containers() { return containers.get(); }
    public long chunks() { return chunks.get(); }
    public long players() { return players.get(); }
    public long entities() { return entities.get(); }
    public long blockedUses() { return blockedUses.get(); }
}
