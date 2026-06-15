package pro.bedsmp.bedbots;

import net.citizensnpcs.api.CitizensAPI;
import net.citizensnpcs.api.npc.NPC;
import net.citizensnpcs.trait.LookClose;
import net.citizensnpcs.trait.SkinTrait;
import org.bukkit.Bukkit;
import org.bukkit.Location;
import org.bukkit.World;
import org.bukkit.configuration.ConfigurationSection;
import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.entity.EntityType;
import org.bukkit.scheduler.BukkitTask;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ThreadLocalRandom;

/** Создаёт ботов как Citizens-NPC и заставляет их бродить по миру. */
public class BotManager {

    private static final String MARKER = "bedbot-managed";

    private final BedBots plugin;
    private final List<Bot> bots = new ArrayList<>();
    private BukkitTask wanderTask;

    private boolean wander;
    private int wanderRadius;
    private boolean lookAtPlayers;
    private int spreadRadius;

    public BotManager(BedBots plugin) {
        this.plugin = plugin;
    }

    public List<Bot> getBots() {
        return bots;
    }

    /** Бот, чьё имя упомянуто в сообщении (или null). */
    public Bot findMentioned(String message) {
        String low = message.toLowerCase(Locale.ROOT);
        for (Bot b : bots) {
            if (low.contains(b.getName().toLowerCase(Locale.ROOT))) {
                return b;
            }
        }
        return null;
    }

    public Bot randomBot() {
        if (bots.isEmpty()) return null;
        return bots.get(ThreadLocalRandom.current().nextInt(bots.size()));
    }

    /** Загружает список ботов из конфига (без спавна). */
    public void load(FileConfiguration cfg) {
        bots.clear();
        wander = cfg.getBoolean("presence.wander", true);
        wanderRadius = cfg.getInt("presence.wander-radius", 12);
        lookAtPlayers = cfg.getBoolean("presence.look-at-players", true);
        spreadRadius = cfg.getInt("presence.spread-radius", 6);

        List<?> list = cfg.getList("bots");
        if (list == null) return;
        for (Object o : list) {
            if (!(o instanceof java.util.Map<?, ?> map)) continue;
            Object name = map.get("name");
            if (name == null) continue;
            String skin = map.get("skin") != null ? String.valueOf(map.get("skin")) : "Steve";
            String pers = map.get("personality") != null ? String.valueOf(map.get("personality")) : "";
            bots.add(new Bot(String.valueOf(name), skin, pers));
        }
    }

    public int botCount() {
        return bots.size();
    }

    /** Удаляет ранее созданных нами ботов (чтобы не плодились при перезапуске). */
    public void cleanup() {
        if (!CitizensAPI.hasImplementation()) return;
        List<NPC> toRemove = new ArrayList<>();
        for (NPC npc : CitizensAPI.getNPCRegistry()) {
            if (npc.data().has(MARKER)) {
                toRemove.add(npc);
            }
        }
        for (NPC npc : toRemove) {
            npc.destroy();
        }
        for (Bot b : bots) {
            b.setNpc(null);
        }
    }

    /** Спавнит всех ботов вокруг точки спавна. */
    public void spawnAll(FileConfiguration cfg) {
        if (!CitizensAPI.hasImplementation()) {
            plugin.getLogger().warning("Citizens не готов — боты не заспавнены.");
            return;
        }
        World world;
        String worldName = cfg.getString("presence.world", "");
        if (worldName != null && !worldName.isBlank()) {
            world = Bukkit.getWorld(worldName);
            if (world == null) {
                plugin.getLogger().warning("Мир '" + worldName + "' не найден, беру первый мир.");
                world = Bukkit.getWorlds().get(0);
            }
        } else {
            world = Bukkit.getWorlds().get(0);
        }
        Location base = world.getSpawnLocation();

        for (Bot bot : bots) {
            Location loc = scatter(base);
            NPC npc = CitizensAPI.getNPCRegistry().createNPC(EntityType.PLAYER, bot.getName());
            npc.data().setPersistent(MARKER, true);

            SkinTrait skin = npc.getOrAddTrait(SkinTrait.class);
            skin.setSkinName(bot.getSkin());

            if (lookAtPlayers) {
                LookClose look = npc.getOrAddTrait(LookClose.class);
                look.lookClose(true);
            }

            npc.setProtected(true);
            npc.spawn(loc);

            bot.setNpc(npc);
            bot.setHome(loc.clone());
        }
        plugin.getLogger().info("Заспавнено ботов: " + bots.size());
    }

    private Location scatter(Location base) {
        ThreadLocalRandom r = ThreadLocalRandom.current();
        double dx = (r.nextDouble() * 2 - 1) * spreadRadius;
        double dz = (r.nextDouble() * 2 - 1) * spreadRadius;
        Location loc = base.clone().add(dx, 0, dz);
        World w = loc.getWorld();
        if (w != null) {
            loc.setY(w.getHighestBlockYAt(loc) + 1);
        }
        return loc;
    }

    /** Запускает периодическое блуждание ботов. */
    public void startWander(int intervalSeconds) {
        if (!wander) return;
        long ticks = Math.max(1L, intervalSeconds) * 20L;
        wanderTask = Bukkit.getScheduler().runTaskTimer(plugin, this::tickWander, ticks, ticks);
    }

    private void tickWander() {
        if (!CitizensAPI.hasImplementation()) return;
        ThreadLocalRandom r = ThreadLocalRandom.current();
        for (Bot bot : bots) {
            NPC npc = bot.getNpc();
            if (npc == null || !npc.isSpawned()) continue;
            if (npc.getNavigator().isNavigating()) continue;
            // 50% шанс начать идти — чтобы не суетились постоянно
            if (r.nextBoolean()) continue;

            Location home = bot.getHome();
            if (home == null) continue;
            double dx = (r.nextDouble() * 2 - 1) * wanderRadius;
            double dz = (r.nextDouble() * 2 - 1) * wanderRadius;
            Location target = home.clone().add(dx, 0, dz);
            World w = target.getWorld();
            if (w != null) {
                target.setY(w.getHighestBlockYAt(target) + 1);
            }
            npc.getNavigator().setTarget(target);
        }
    }

    public void shutdown() {
        if (wanderTask != null) {
            wanderTask.cancel();
            wanderTask = null;
        }
        cleanup();
    }
}
