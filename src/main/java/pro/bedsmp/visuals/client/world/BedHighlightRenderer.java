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
import net.minecraft.core.BlockPos;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BedBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import org.joml.Matrix4f;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.client.util.ColorUtils;

/**
 * Подсветка кроватей в радиусе.
 * ВНИМАНИЕ: выключена по умолчанию — аналог ESP.
 */
@Environment(EnvType.CLIENT)
public class BedHighlightRenderer {

    public static void render(WorldRenderContext context) {
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null || !cfg.bedHighlight.enabled) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;

        Level level = mc.level;
        BlockPos playerPos = mc.player.blockPosition();
        int radius = Math.min(cfg.bedHighlight.radius, 64);

        Vec3 camPos = mc.gameRenderer.getMainCamera().position();
        PoseStack poseStack = context.matrices();
        MultiBufferSource consumers = context.consumers();
        if (consumers == null) return;

        poseStack.pushPose();

        int color = cfg.bedHighlight.color;
        int a = ColorUtils.alpha(color);
        int r = ColorUtils.red(color);
        int g = ColorUtils.green(color);
        int b = ColorUtils.blue(color);

        for (BlockPos pos : BlockPos.betweenClosed(
                playerPos.offset(-radius, -radius, -radius),
                playerPos.offset(radius, radius, radius))) {
            BlockState state = level.getBlockState(pos);
            if (!(state.getBlock() instanceof BedBlock)) continue;

            AABB box = state.getShape(level, pos).bounds().move(pos);

            float x1 = (float)(box.minX - camPos.x);
            float y1 = (float)(box.minY - camPos.y);
            float z1 = (float)(box.minZ - camPos.z);
            float x2 = (float)(box.maxX - camPos.x);
            float y2 = (float)(box.maxY - camPos.y);
            float z2 = (float)(box.maxZ - camPos.z);

            drawBox(poseStack, consumers, x1, y1, z1, x2, y2, z2, r, g, b, a);
        }

        poseStack.popPose();
    }

    private static void drawBox(PoseStack poseStack, MultiBufferSource consumers,
                                 float x1, float y1, float z1,
                                 float x2, float y2, float z2,
                                 int r, int g, int b, int a) {
        VertexConsumer consumer = consumers.getBuffer(RenderTypes.LINES);
        Matrix4f mat = poseStack.last().pose();

        addLine(consumer, mat, x1, y1, z1, x2, y1, z1, r, g, b, a);
        addLine(consumer, mat, x2, y1, z1, x2, y1, z2, r, g, b, a);
        addLine(consumer, mat, x2, y1, z2, x1, y1, z2, r, g, b, a);
        addLine(consumer, mat, x1, y1, z2, x1, y1, z1, r, g, b, a);
        addLine(consumer, mat, x1, y2, z1, x2, y2, z1, r, g, b, a);
        addLine(consumer, mat, x2, y2, z1, x2, y2, z2, r, g, b, a);
        addLine(consumer, mat, x2, y2, z2, x1, y2, z2, r, g, b, a);
        addLine(consumer, mat, x1, y2, z2, x1, y2, z1, r, g, b, a);
        addLine(consumer, mat, x1, y1, z1, x1, y2, z1, r, g, b, a);
        addLine(consumer, mat, x2, y1, z1, x2, y2, z1, r, g, b, a);
        addLine(consumer, mat, x2, y1, z2, x2, y2, z2, r, g, b, a);
        addLine(consumer, mat, x1, y1, z2, x1, y2, z2, r, g, b, a);
    }

    private static void addLine(VertexConsumer consumer, Matrix4f mat,
                                 float x1, float y1, float z1,
                                 float x2, float y2, float z2,
                                 int r, int g, int b, int a) {
        consumer.addVertex(mat, x1, y1, z1).setColor(r, g, b, a).setNormal(1, 0, 0);
        consumer.addVertex(mat, x2, y2, z2).setColor(r, g, b, a).setNormal(1, 0, 0);
    }
}
