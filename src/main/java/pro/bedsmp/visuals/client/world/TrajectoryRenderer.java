package pro.bedsmp.visuals.client.world;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderContext;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.rendertype.RenderType;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.CrossbowItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.util.ColorUtils;

/**
 * Предсказание траектории снарядов.
 * ВНИМАНИЕ: выключена по умолчанию — может нарушать правила сервера.
 */
@Environment(EnvType.CLIENT)
public class TrajectoryRenderer {

    private static final double ARROW_GRAVITY = 0.05;
    private static final double PEARL_GRAVITY = 0.03;
    private static final double SNOWBALL_GRAVITY = 0.03;
    private static final double TRIDENT_GRAVITY = 0.05;

    public static void render(WorldRenderContext context) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.trajectory.enabled) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;

        Player player = mc.player;
        ItemStack mainHand = player.getMainHandItem();
        ItemStack offHand = player.getOffhandItem();

        ProjectileData data = getProjectileData(player, mainHand, offHand);
        if (data == null) return;

        float partialTick = mc.getDeltaTracker().getGameTimeDeltaPartialTick(false);
        Vec3 start = player.getEyePosition(partialTick);
        Vec3 look = player.getViewVector(partialTick);

        Vec3 velocity = look.scale(data.speed());
        double gravity = data.gravity();

        PoseStack poseStack = context.matrices();
        Vec3 cameraPos = mc.gameRenderer.getMainCamera().position();

        poseStack.pushPose();

        MultiBufferSource consumers = context.consumers();
        if (consumers == null) {
            poseStack.popPose();
            return;
        }

        VertexConsumer consumer = consumers.getBuffer(RenderTypes.LINES);

        int color = cfg.trajectory.color;
        int a = ColorUtils.alpha(color);
        int r = ColorUtils.red(color);
        int g = ColorUtils.green(color);
        int b = ColorUtils.blue(color);

        Vec3 prev = start;
        Vec3 vx = velocity;

        for (int i = 0; i < cfg.trajectory.predictionTicks; i++) {
            Vec3 next = prev.add(vx);
            vx = vx.add(0, -gravity, 0);
            vx = vx.scale(0.99);

            var hitResult = mc.level.clip(
                    new net.minecraft.world.level.ClipContext(
                            prev, next,
                            net.minecraft.world.level.ClipContext.Block.COLLIDER,
                            net.minecraft.world.level.ClipContext.Fluid.NONE,
                            player
                    )
            );

            Matrix4f mat = poseStack.last().pose();

            if (i % 2 == 0) {
                float px = (float)(prev.x - cameraPos.x);
                float py = (float)(prev.y - cameraPos.y);
                float pz = (float)(prev.z - cameraPos.z);
                float nx = (float)(next.x - cameraPos.x);
                float ny = (float)(next.y - cameraPos.y);
                float nz = (float)(next.z - cameraPos.z);

                consumer.addVertex(mat, px, py, pz).setColor(r, g, b, a).setNormal(0, 1, 0);
                consumer.addVertex(mat, nx, ny, nz).setColor(r, g, b, a).setNormal(0, 1, 0);
            }

            if (hitResult.getType() != net.minecraft.world.phys.HitResult.Type.MISS) {
                if (cfg.trajectory.showLandingMark) {
                    Vec3 land = hitResult.getLocation();
                    float lx = (float)(land.x - cameraPos.x);
                    float ly = (float)(land.y - cameraPos.y);
                    float lz = (float)(land.z - cameraPos.z);
                    int mc2 = cfg.trajectory.landingMarkColor;
                    int la = ColorUtils.alpha(mc2);
                    int lr = ColorUtils.red(mc2);
                    int lg = ColorUtils.green(mc2);
                    int lb = ColorUtils.blue(mc2);
                    float s = 0.1f;
                    consumer.addVertex(mat, lx - s, ly, lz).setColor(lr, lg, lb, la).setNormal(1, 0, 0);
                    consumer.addVertex(mat, lx + s, ly, lz).setColor(lr, lg, lb, la).setNormal(1, 0, 0);
                    consumer.addVertex(mat, lx, ly, lz - s).setColor(lr, lg, lb, la).setNormal(0, 0, 1);
                    consumer.addVertex(mat, lx, ly, lz + s).setColor(lr, lg, lb, la).setNormal(0, 0, 1);
                }
                break;
            }

            prev = next;
        }

        poseStack.popPose();
    }

    private record ProjectileData(double speed, double gravity) {}

    private static ProjectileData getProjectileData(Player player, ItemStack main, ItemStack off) {
        if (player.isUsingItem()) {
            ItemStack active = player.getUseItem();
            if (active.getItem() instanceof BowItem) {
                int useTime = active.getUseDuration(player) - player.getUseItemRemainingTicks();
                float power = BowItem.getPowerForTime(useTime);
                if (power > 0.1f) return new ProjectileData(power * 3.0, ARROW_GRAVITY);
            }
            if (active.getItem() instanceof CrossbowItem && CrossbowItem.isCharged(active)) {
                return new ProjectileData(3.15, ARROW_GRAVITY);
            }
        }

        if (main.is(Items.ENDER_PEARL) || off.is(Items.ENDER_PEARL))
            return new ProjectileData(1.5, PEARL_GRAVITY);
        if (main.is(Items.SNOWBALL) || off.is(Items.SNOWBALL))
            return new ProjectileData(1.5, SNOWBALL_GRAVITY);
        if (main.is(Items.EGG) || off.is(Items.EGG))
            return new ProjectileData(1.5, SNOWBALL_GRAVITY);
        if (main.is(Items.SPLASH_POTION) || off.is(Items.SPLASH_POTION))
            return new ProjectileData(0.5, SNOWBALL_GRAVITY * 1.5);
        if ((main.is(Items.TRIDENT) || off.is(Items.TRIDENT)) && player.isUsingItem()) {
            int useTime = player.getUseItem().getUseDuration(player) - player.getUseItemRemainingTicks();
            if (useTime >= 10) return new ProjectileData(2.5, TRIDENT_GRAVITY);
        }

        return null;
    }
}
