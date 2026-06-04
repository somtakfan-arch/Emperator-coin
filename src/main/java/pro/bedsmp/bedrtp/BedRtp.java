package pro.bedsmp.bedrtp;

import org.bukkit.*;
import org.bukkit.block.Block;
import org.bukkit.entity.Player;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.player.PlayerJoinEvent;
import org.bukkit.event.player.PlayerRespawnEvent;
import org.bukkit.plugin.java.JavaPlugin;

import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;

public final class BedRtp extends JavaPlugin implements Listener {

    private static final Set<Material> DANGEROUS = Set.of(
            Material.LAVA,
            Material.WATER,
            Material.FIRE,
            Material.CACTUS,
            Material.MAGMA_BLOCK,
            Material.POWDER_SNOW,
            Material.CAMPFIRE,
            Material.SOUL_CAMPFIRE,
            Material.SWEET_BERRY_BUSH,
            Material.WITHER_ROSE
    );

    private String worldName;
    private int centerX;
    private int centerZ;
    private int minRadius;
    private int maxRadius;
    private int maxTries;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        loadConfig();
        getServer().getPluginManager().registerEvents(this, this);
        getLogger().info("BedRtp включён.");
    }

    @Override
    public void onDisable() {
        getLogger().info("BedRtp выключен.");
    }

    private void loadConfig() {
        worldName  = getConfig().getString("world",     "world");
        centerX    = getConfig().getInt("center-x",    0);
        centerZ    = getConfig().getInt("center-z",    0);
        minRadius  = getConfig().getInt("min-radius",  500);
        maxRadius  = getConfig().getInt("max-radius",  5000);
        maxTries   = getConfig().getInt("max-tries",   30);
    }

    // ---------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------

    @EventHandler(priority = EventPriority.MONITOR)
    public void onPlayerJoin(PlayerJoinEvent event) {
        Player player = event.getPlayer();
        if (!player.hasPlayedBefore()) {
            getServer().getScheduler().runTaskLater(this,
                    () -> startRtp(player, maxTries, 10),
                    10L);
        }
    }

    @EventHandler(priority = EventPriority.MONITOR)
    public void onPlayerRespawn(PlayerRespawnEvent event) {
        if (!event.isBedSpawn() && !event.isAnchorSpawn()) {
            Player player = event.getPlayer();
            getServer().getScheduler().runTaskLater(this,
                    () -> startRtp(player, maxTries, 2),
                    2L);
        }
    }

    // ---------------------------------------------------------------
    // RTP logic
    // ---------------------------------------------------------------

    private void startRtp(Player player, int tries, int delayTicks) {
        World world = getServer().getWorld(worldName);
        if (world == null) {
            player.sendMessage(ChatColor.RED + "[BedRtp] Мир «" + worldName + "» не найден. Обратитесь к администратору.");
            return;
        }
        tryRtp(player, world, tries, delayTicks);
    }

    private void tryRtp(Player player, World world, int triesLeft, int delayTicks) {
        if (triesLeft <= 0) {
            player.sendMessage(ChatColor.RED +
                    "§cНе удалось найти безопасное место. Используй §e/rtp §cвручную.");
            return;
        }

        ThreadLocalRandom rng = ThreadLocalRandom.current();
        double angle    = rng.nextDouble(0, 2 * Math.PI);
        double distance = rng.nextDouble(minRadius, maxRadius);
        int x = centerX + (int) (Math.cos(angle) * distance);
        int z = centerZ + (int) (Math.sin(angle) * distance);

        world.getChunkAtAsync(x >> 4, z >> 4).thenAccept(chunk -> {
            // Back to main thread for block inspection
            getServer().getScheduler().runTask(this, () -> {
                int y = findSafeY(world, x, z);
                if (y == Integer.MIN_VALUE) {
                    tryRtp(player, world, triesLeft - 1, delayTicks);
                    return;
                }
                Location dest = new Location(world, x + 0.5, y, z + 0.5,
                        player.getLocation().getYaw(),
                        player.getLocation().getPitch());
                getServer().getScheduler().runTaskLater(this, () -> {
                    player.teleport(dest);
                    player.sendMessage(ChatColor.GREEN +
                            "§aТелепортация выполнена! Координаты: §e" +
                            (x + 0) + "§a, §e" + y + "§a, §e" + z);
                }, delayTicks);
            });
        });
    }

    /**
     * Returns the Y for a safe standing position, or Integer.MIN_VALUE if none found.
     * Nether: scan top-down for an air pocket.
     * Overworld / End: use getHighestBlockYAt.
     */
    private int findSafeY(World world, int x, int z) {
        Environment env = world.getEnvironment();

        if (env == Environment.NETHER) {
            return findSafeYNether(world, x, z);
        } else {
            int topY = world.getHighestBlockYAt(x, z);
            // getHighestBlockYAt returns the Y of the surface block
            Block feet  = world.getBlockAt(x, topY + 1, z);
            Block head  = world.getBlockAt(x, topY + 2, z);
            Block floor = world.getBlockAt(x, topY,     z);

            if (isSafeFloor(floor) && isAir(feet) && isAir(head)) {
                return topY + 1;
            }
            return Integer.MIN_VALUE;
        }
    }

    private int findSafeYNether(World world, int x, int z) {
        int maxY = Math.min(world.getMaxHeight() - 2, 120);
        for (int y = maxY; y >= world.getMinHeight() + 1; y--) {
            Block feet  = world.getBlockAt(x, y,     z);
            Block head  = world.getBlockAt(x, y + 1, z);
            Block floor = world.getBlockAt(x, y - 1, z);

            if (isAir(feet) && isAir(head) && isSafeFloor(floor)) {
                return y;
            }
        }
        return Integer.MIN_VALUE;
    }

    private boolean isAir(Block block) {
        return block.getType().isAir();
    }

    private boolean isSafeFloor(Block block) {
        Material m = block.getType();
        return m.isSolid() && !DANGEROUS.contains(m);
    }
}
