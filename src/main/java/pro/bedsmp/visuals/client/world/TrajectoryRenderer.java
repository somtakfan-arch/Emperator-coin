package pro.bedsmp.visuals.client.world;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.Camera;
import net.minecraft.client.DeltaTracker;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.CrossbowItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.Vec3;

import pro.bedsmp.visuals.BedSMPVisualsClient;

/**
 * Предсказание траектории снарядов — рендерится как 2D HUD через проекцию.
 * ВНИМАНИЕ: выключена по умолчанию — может нарушать правила сервера.
 */
@Environment(EnvType.CLIENT)
public class TrajectoryRenderer {

    /** HUD-рендер: проецирует мировую траекторию в экранные координаты. */
    public static void renderHud(GuiGraphics gfx, DeltaTracker tc) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.trajectory.enabled || !cfg.hudVisible) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null || mc.gameRenderer == null) return;

        Player player = mc.player;
        ItemStack mainHand = player.getMainHandItem();
        ItemStack offHand  = player.getOffhandItem();

        ProjectileData data = getProjectileData(player, mainHand, offHand);
        if (data == null) return;

        float partialTick = mc.getDeltaTracker().getGameTimeDeltaPartialTick(false);
        Vec3 start = player.getEyePosition(partialTick);
        Vec3 look  = player.getViewVector(partialTick);

        Vec3 vel    = look.scale(data.speed());
        double grav = data.gravity();

        int color      = cfg.trajectory.color;
        int markColor  = cfg.trajectory.landingMarkColor;

        int sw = mc.getWindow().getGuiScaledWidth();
        int sh = mc.getWindow().getGuiScaledHeight();
        Camera cam = mc.gameRenderer.getMainCamera();

        Vec3 prev = start;
        Vec3 vx   = vel;
        Vec3 landing = null;

        for (int i = 0; i < cfg.trajectory.predictionTicks; i++) {
            Vec3 next = prev.add(vx);
            vx = vx.add(0, -grav, 0).scale(0.99);

            var hit = mc.level.clip(new net.minecraft.world.level.ClipContext(
                    prev, next,
                    net.minecraft.world.level.ClipContext.Block.COLLIDER,
                    net.minecraft.world.level.ClipContext.Fluid.NONE,
                    player));

            if (i % 2 == 0) {
                double[] sp = project(prev, cam, sw, sh);
                if (sp != null) {
                    gfx.fill((int) sp[0] - 1, (int) sp[1] - 1, (int) sp[0] + 2, (int) sp[1] + 2, color);
                }
            }

            if (hit.getType() != net.minecraft.world.phys.HitResult.Type.MISS) {
                landing = hit.getLocation();
                break;
            }
            prev = next;
        }

        if (landing != null && cfg.trajectory.showLandingMark) {
            double[] sp = project(landing, cam, sw, sh);
            if (sp != null) {
                int lx = (int) sp[0];
                int ly = (int) sp[1];
                int s = 5;
                gfx.fill(lx - s, ly - 1, lx + s + 1, ly + 2, markColor);
                gfx.fill(lx - 1, ly - s, lx + 2, ly + s + 1, markColor);
            }
        }
    }

    /** Проецирует мировую точку в экранные координаты (null = за камерой). */
    private static double[] project(Vec3 world, Camera cam, int sw, int sh) {
        Vec3 rel = world.subtract(cam.position());

        float yaw   = cam.yRot();
        float pitch = cam.xRot();
        float cosY  = (float) Math.cos(Math.toRadians(-yaw));
        float sinY  = (float) Math.sin(Math.toRadians(-yaw));
        float cosP  = (float) Math.cos(Math.toRadians(-pitch));
        float sinP  = (float) Math.sin(Math.toRadians(-pitch));

        float lx = (float) rel.x;
        float ly = (float) rel.y;
        float lz = (float) rel.z;

        float vx = lx * cosY - lz * sinY;
        float vz = lx * sinY + lz * cosY;
        float vy = ly * cosP - vz * sinP;
        float vd = ly * sinP + vz * cosP;

        if (vd <= 0) return null;

        double fov       = Minecraft.getInstance().options.fov().get();
        double fovFactor = 1.0 / Math.tan(Math.toRadians(fov / 2.0));
        double aspect    = (double) sw / sh;

        double nx = (vx / vd) * fovFactor / aspect;
        double ny = -(vy / vd) * fovFactor;

        return new double[]{(nx + 1.0) * sw / 2.0, (ny + 1.0) * sh / 2.0};
    }

    private record ProjectileData(double speed, double gravity) {}

    private static ProjectileData getProjectileData(Player player, ItemStack main, ItemStack off) {
        if (player.isUsingItem()) {
            ItemStack active = player.getUseItem();
            if (active.getItem() instanceof BowItem) {
                int useTime = active.getUseDuration(player) - player.getUseItemRemainingTicks();
                float power = BowItem.getPowerForTime(useTime);
                if (power > 0.1f) return new ProjectileData(power * 3.0, 0.05);
            }
            if (active.getItem() instanceof CrossbowItem && CrossbowItem.isCharged(active)) {
                return new ProjectileData(3.15, 0.05);
            }
        }

        if (main.is(Items.ENDER_PEARL) || off.is(Items.ENDER_PEARL))
            return new ProjectileData(1.5, 0.03);
        if (main.is(Items.SNOWBALL) || off.is(Items.SNOWBALL))
            return new ProjectileData(1.5, 0.03);
        if (main.is(Items.EGG) || off.is(Items.EGG))
            return new ProjectileData(1.5, 0.03);
        if (main.is(Items.SPLASH_POTION) || off.is(Items.SPLASH_POTION))
            return new ProjectileData(0.5, 0.045);
        if ((main.is(Items.TRIDENT) || off.is(Items.TRIDENT)) && player.isUsingItem()) {
            int useTime = player.getUseItem().getUseDuration(player) - player.getUseItemRemainingTicks();
            if (useTime >= 10) return new ProjectileData(2.5, 0.05);
        }

        return null;
    }
}
