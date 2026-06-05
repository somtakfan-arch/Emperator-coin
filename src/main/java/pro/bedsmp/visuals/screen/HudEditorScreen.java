package pro.bedsmp.visuals.screen;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import pro.bedsmp.visuals.BedSMPVisualsClient;
import pro.bedsmp.visuals.config.ConfigManager;
import pro.bedsmp.visuals.config.ModConfig;

import java.util.ArrayList;
import java.util.List;
import java.util.function.IntConsumer;
import java.util.function.IntSupplier;

/**
 * Редактор позиций HUD. Открывается по клавише H.
 * Перетаскивайте блоки — позиции сохраняются при закрытии.
 */
@Environment(EnvType.CLIENT)
public class HudEditorScreen extends Screen {

    private static final int BW = 92;
    private static final int BH = 18;

    private record Widget(
            String name,
            IntSupplier screenX,
            IntSupplier screenY,
            IntConsumer addDX,
            IntConsumer addDY
    ) {}

    private final List<Widget> widgets = new ArrayList<>();
    private Widget  dragging;
    private double  dragLastX, dragLastY;

    public HudEditorScreen() {
        super(Component.literal("HUD Editor"));
    }

    @Override
    protected void init() {
        ModConfig cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null) return;
        widgets.clear();

        add("Водяной знак",   () -> cfg.watermark.anchor.resolveX(cfg.watermark.offsetX, BW),           () -> cfg.watermark.anchor.resolveY(cfg.watermark.offsetY, BH),           dx -> cfg.watermark.offsetX += dx,      dy -> cfg.watermark.offsetY += dy);
        add("Ping/FPS",       () -> cfg.pingFps.anchor.resolveX(cfg.pingFps.offsetX, BW),               () -> cfg.pingFps.anchor.resolveY(cfg.pingFps.offsetY, BH),               dx -> cfg.pingFps.offsetX += dx,        dy -> cfg.pingFps.offsetY += dy);
        add("Координаты",     () -> cfg.coordinates.anchor.resolveX(cfg.coordinates.offsetX, BW),       () -> cfg.coordinates.anchor.resolveY(cfg.coordinates.offsetY, BH),       dx -> cfg.coordinates.offsetX += dx,    dy -> cfg.coordinates.offsetY += dy);
        add("Target HUD",     () -> cfg.targetHud.anchor.resolveX(cfg.targetHud.offsetX, BW),           () -> cfg.targetHud.anchor.resolveY(cfg.targetHud.offsetY, BH),           dx -> cfg.targetHud.offsetX += dx,      dy -> cfg.targetHud.offsetY += dy);
        add("Статус кровати", () -> cfg.bedStatus.anchor.resolveX(cfg.bedStatus.offsetX, BW),           () -> cfg.bedStatus.anchor.resolveY(cfg.bedStatus.offsetY, BH),           dx -> cfg.bedStatus.offsetX += dx,      dy -> cfg.bedStatus.offsetY += dy);
        add("Таймер боя",     () -> cfg.combatTimer.anchor.resolveX(cfg.combatTimer.offsetX, BW),       () -> cfg.combatTimer.anchor.resolveY(cfg.combatTimer.offsetY, BH),       dx -> cfg.combatTimer.offsetX += dx,    dy -> cfg.combatTimer.offsetY += dy);
        add("Тотем",          () -> cfg.totemCounter.anchor.resolveX(cfg.totemCounter.offsetX, BW),     () -> cfg.totemCounter.anchor.resolveY(cfg.totemCounter.offsetY, BH),     dx -> cfg.totemCounter.offsetX += dx,   dy -> cfg.totemCounter.offsetY += dy);
        add("Kill Feed",      () -> cfg.killFeed.anchor.resolveX(cfg.killFeed.offsetX, BW),             () -> cfg.killFeed.anchor.resolveY(cfg.killFeed.offsetY, BH),             dx -> cfg.killFeed.offsetX += dx,       dy -> cfg.killFeed.offsetY += dy);
        add("CPS",            () -> cfg.cpsCounter.anchor.resolveX(cfg.cpsCounter.offsetX, BW),         () -> cfg.cpsCounter.anchor.resolveY(cfg.cpsCounter.offsetY, BH),         dx -> cfg.cpsCounter.offsetX += dx,     dy -> cfg.cpsCounter.offsetY += dy);
        add("Комбо",          () -> cfg.comboCounter.anchor.resolveX(cfg.comboCounter.offsetX, BW),     () -> cfg.comboCounter.anchor.resolveY(cfg.comboCounter.offsetY, BH),     dx -> cfg.comboCounter.offsetX += dx,   dy -> cfg.comboCounter.offsetY += dy);
        add("Дальность",      () -> cfg.reachDisplay.anchor.resolveX(cfg.reachDisplay.offsetX, BW),     () -> cfg.reachDisplay.anchor.resolveY(cfg.reachDisplay.offsetY, BH),     dx -> cfg.reachDisplay.offsetX += dx,   dy -> cfg.reachDisplay.offsetY += dy);
        add("Эффекты",        () -> cfg.effectsHud.anchor.resolveX(cfg.effectsHud.offsetX, BW),         () -> cfg.effectsHud.anchor.resolveY(cfg.effectsHud.offsetY, BH),         dx -> cfg.effectsHud.offsetX += dx,     dy -> cfg.effectsHud.offsetY += dy);
        add("Броня",          () -> cfg.armorHud.anchor.resolveX(cfg.armorHud.offsetX, BW),             () -> cfg.armorHud.anchor.resolveY(cfg.armorHud.offsetY, BH),             dx -> cfg.armorHud.offsetX += dx,       dy -> cfg.armorHud.offsetY += dy);
        add("Булава PvP",     () -> cfg.macePvp.anchor.resolveX(cfg.macePvp.offsetX, BW),               () -> cfg.macePvp.anchor.resolveY(cfg.macePvp.offsetY, BH),               dx -> cfg.macePvp.offsetX += dx,        dy -> cfg.macePvp.offsetY += dy);
        add("Кристалл PvP",   () -> cfg.crystalPvp.anchor.resolveX(cfg.crystalPvp.offsetX, BW),         () -> cfg.crystalPvp.anchor.resolveY(cfg.crystalPvp.offsetY, BH),         dx -> cfg.crystalPvp.offsetX += dx,     dy -> cfg.crystalPvp.offsetY += dy);
        add("Откат атаки",    () -> cfg.attackCooldown.anchor.resolveX(cfg.attackCooldown.offsetX, BW), () -> cfg.attackCooldown.anchor.resolveY(cfg.attackCooldown.offsetY, BH), dx -> cfg.attackCooldown.offsetX += dx, dy -> cfg.attackCooldown.offsetY += dy);
        add("Скорость",       () -> cfg.speedDisplay.anchor.resolveX(cfg.speedDisplay.offsetX, BW),     () -> cfg.speedDisplay.anchor.resolveY(cfg.speedDisplay.offsetY, BH),     dx -> cfg.speedDisplay.offsetX += dx,   dy -> cfg.speedDisplay.offsetY += dy);
        add("Урон от падения",() -> cfg.fallDamagePreview.anchor.resolveX(cfg.fallDamagePreview.offsetX, BW), () -> cfg.fallDamagePreview.anchor.resolveY(cfg.fallDamagePreview.offsetY, BH), dx -> cfg.fallDamagePreview.offsetX += dx, dy -> cfg.fallDamagePreview.offsetY += dy);
        add("W-Tap",          () -> cfg.wTapIndicator.anchor.resolveX(cfg.wTapIndicator.offsetX, BW),   () -> cfg.wTapIndicator.anchor.resolveY(cfg.wTapIndicator.offsetY, BH),   dx -> cfg.wTapIndicator.offsetX += dx,  dy -> cfg.wTapIndicator.offsetY += dy);
        add("Серия убийств",  () -> cfg.killStreak.anchor.resolveX(cfg.killStreak.offsetX, BW),         () -> cfg.killStreak.anchor.resolveY(cfg.killStreak.offsetY, BH),         dx -> cfg.killStreak.offsetX += dx,     dy -> cfg.killStreak.offsetY += dy);
        add("Абсорбция",      () -> cfg.absorptionDisplay.anchor.resolveX(cfg.absorptionDisplay.offsetX, BW), () -> cfg.absorptionDisplay.anchor.resolveY(cfg.absorptionDisplay.offsetY, BH), dx -> cfg.absorptionDisplay.offsetX += dx, dy -> cfg.absorptionDisplay.offsetY += dy);
        add("Еда/насыщение",  () -> cfg.foodDisplay.anchor.resolveX(cfg.foodDisplay.offsetX, BW),       () -> cfg.foodDisplay.anchor.resolveY(cfg.foodDisplay.offsetY, BH),       dx -> cfg.foodDisplay.offsetX += dx,    dy -> cfg.foodDisplay.offsetY += dy);
        add("Зелья",          () -> cfg.potionTimers.anchor.resolveX(cfg.potionTimers.offsetX, BW),     () -> cfg.potionTimers.anchor.resolveY(cfg.potionTimers.offsetY, BH),     dx -> cfg.potionTimers.offsetX += dx,   dy -> cfg.potionTimers.offsetY += dy);
        add("Прочность брони",() -> cfg.armorDurability.anchor.resolveX(cfg.armorDurability.offsetX, BW), () -> cfg.armorDurability.anchor.resolveY(cfg.armorDurability.offsetY, BH), dx -> cfg.armorDurability.offsetX += dx, dy -> cfg.armorDurability.offsetY += dy);
        add("Прочность предм",() -> cfg.itemDurability.anchor.resolveX(cfg.itemDurability.offsetX, BW), () -> cfg.itemDurability.anchor.resolveY(cfg.itemDurability.offsetY, BH), dx -> cfg.itemDurability.offsetX += dx, dy -> cfg.itemDurability.offsetY += dy);
        add("Опыт",           () -> cfg.expDisplay.anchor.resolveX(cfg.expDisplay.offsetX, BW),         () -> cfg.expDisplay.anchor.resolveY(cfg.expDisplay.offsetY, BH),         dx -> cfg.expDisplay.offsetX += dx,     dy -> cfg.expDisplay.offsetY += dy);
        add("Заморозка",      () -> cfg.freezeTimer.anchor.resolveX(cfg.freezeTimer.offsetX, BW),       () -> cfg.freezeTimer.anchor.resolveY(cfg.freezeTimer.offsetY, BH),       dx -> cfg.freezeTimer.offsetX += dx,    dy -> cfg.freezeTimer.offsetY += dy);
        add("Чанк",           () -> cfg.chunkInfo.anchor.resolveX(cfg.chunkInfo.offsetX, BW),           () -> cfg.chunkInfo.anchor.resolveY(cfg.chunkInfo.offsetY, BH),           dx -> cfg.chunkInfo.offsetX += dx,      dy -> cfg.chunkInfo.offsetY += dy);
        add("Время суток",    () -> cfg.dayTime.anchor.resolveX(cfg.dayTime.offsetX, BW),               () -> cfg.dayTime.anchor.resolveY(cfg.dayTime.offsetY, BH),               dx -> cfg.dayTime.offsetX += dx,        dy -> cfg.dayTime.offsetY += dy);
        add("Игроки рядом",   () -> cfg.nearbyPlayers.anchor.resolveX(cfg.nearbyPlayers.offsetX, BW),   () -> cfg.nearbyPlayers.anchor.resolveY(cfg.nearbyPlayers.offsetY, BH),   dx -> cfg.nearbyPlayers.offsetX += dx,  dy -> cfg.nearbyPlayers.offsetY += dy);
        add("Часы",           () -> cfg.realClock.anchor.resolveX(cfg.realClock.offsetX, BW),           () -> cfg.realClock.anchor.resolveY(cfg.realClock.offsetY, BH),           dx -> cfg.realClock.offsetX += dx,      dy -> cfg.realClock.offsetY += dy);
        add("Освещение",      () -> cfg.lightLevel.anchor.resolveX(cfg.lightLevel.offsetX, BW),         () -> cfg.lightLevel.anchor.resolveY(cfg.lightLevel.offsetY, BH),         dx -> cfg.lightLevel.offsetX += dx,     dy -> cfg.lightLevel.offsetY += dy);
        add("Компас",         () -> cfg.compassDisplay.anchor.resolveX(cfg.compassDisplay.offsetX, BW), () -> cfg.compassDisplay.anchor.resolveY(cfg.compassDisplay.offsetY, BH), dx -> cfg.compassDisplay.offsetX += dx, dy -> cfg.compassDisplay.offsetY += dy);
        add("Глубина",        () -> cfg.swimDepth.anchor.resolveX(cfg.swimDepth.offsetX, BW),           () -> cfg.swimDepth.anchor.resolveY(cfg.swimDepth.offsetY, BH),           dx -> cfg.swimDepth.offsetX += dx,      dy -> cfg.swimDepth.offsetY += dy);
        add("Время сессии",   () -> cfg.playtime.anchor.resolveX(cfg.playtime.offsetX, BW),             () -> cfg.playtime.anchor.resolveY(cfg.playtime.offsetY, BH),             dx -> cfg.playtime.offsetX += dx,       dy -> cfg.playtime.offsetY += dy);
        add("Урон за сессию", () -> cfg.damageSummary.anchor.resolveX(cfg.damageSummary.offsetX, BW),   () -> cfg.damageSummary.anchor.resolveY(cfg.damageSummary.offsetY, BH),   dx -> cfg.damageSummary.offsetX += dx,  dy -> cfg.damageSummary.offsetY += dy);
        add("Яблоки",         () -> cfg.gappleCount.anchor.resolveX(cfg.gappleCount.offsetX, BW),       () -> cfg.gappleCount.anchor.resolveY(cfg.gappleCount.offsetY, BH),       dx -> cfg.gappleCount.offsetX += dx,    dy -> cfg.gappleCount.offsetY += dy);
        add("Тотем статус",   () -> cfg.totemStatus.anchor.resolveX(cfg.totemStatus.offsetX, BW),       () -> cfg.totemStatus.anchor.resolveY(cfg.totemStatus.offsetY, BH),       dx -> cfg.totemStatus.offsetX += dx,    dy -> cfg.totemStatus.offsetY += dy);
        add("Инвентарь",      () -> cfg.inventoryCount.anchor.resolveX(cfg.inventoryCount.offsetX, BW), () -> cfg.inventoryCount.anchor.resolveY(cfg.inventoryCount.offsetY, BH), dx -> cfg.inventoryCount.offsetX += dx, dy -> cfg.inventoryCount.offsetY += dy);
        add("Движение WASD",  () -> cfg.strafingDisplay.anchor.resolveX(cfg.strafingDisplay.offsetX, BW), () -> cfg.strafingDisplay.anchor.resolveY(cfg.strafingDisplay.offsetY, BH), dx -> cfg.strafingDisplay.offsetX += dx, dy -> cfg.strafingDisplay.offsetY += dy);
        add("Скорость XYZ",   () -> cfg.velocityDisplay.anchor.resolveX(cfg.velocityDisplay.offsetX, BW), () -> cfg.velocityDisplay.anchor.resolveY(cfg.velocityDisplay.offsetY, BH), dx -> cfg.velocityDisplay.offsetX += dx, dy -> cfg.velocityDisplay.offsetY += dy);
        add("Жемчуг откат",   () -> cfg.pearlCooldown.anchor.resolveX(cfg.pearlCooldown.offsetX, BW),   () -> cfg.pearlCooldown.anchor.resolveY(cfg.pearlCooldown.offsetY, BH),   dx -> cfg.pearlCooldown.offsetX += dx,  dy -> cfg.pearlCooldown.offsetY += dy);
        add("Стрелы",         () -> cfg.arrowCount.anchor.resolveX(cfg.arrowCount.offsetX, BW),         () -> cfg.arrowCount.anchor.resolveY(cfg.arrowCount.offsetY, BH),         dx -> cfg.arrowCount.offsetX += dx,     dy -> cfg.arrowCount.offsetY += dy);
        add("TPS",            () -> cfg.tpsDisplay.anchor.resolveX(cfg.tpsDisplay.offsetX, BW),         () -> cfg.tpsDisplay.anchor.resolveY(cfg.tpsDisplay.offsetY, BH),         dx -> cfg.tpsDisplay.offsetX += dx,     dy -> cfg.tpsDisplay.offsetY += dy);
        add("K/D сессии",     () -> cfg.sessionKD.anchor.resolveX(cfg.sessionKD.offsetX, BW),           () -> cfg.sessionKD.anchor.resolveY(cfg.sessionKD.offsetY, BH),           dx -> cfg.sessionKD.offsetX += dx,      dy -> cfg.sessionKD.offsetY += dy);
        add("Щит",            () -> cfg.shieldStatus.anchor.resolveX(cfg.shieldStatus.offsetX, BW),     () -> cfg.shieldStatus.anchor.resolveY(cfg.shieldStatus.offsetY, BH),     dx -> cfg.shieldStatus.offsetX += dx,   dy -> cfg.shieldStatus.offsetY += dy);
        add("Спринт",         () -> cfg.sprintStatus.anchor.resolveX(cfg.sprintStatus.offsetX, BW),     () -> cfg.sprintStatus.anchor.resolveY(cfg.sprintStatus.offsetY, BH),     dx -> cfg.sprintStatus.offsetX += dx,   dy -> cfg.sprintStatus.offsetY += dy);
    }

    private void add(String name, IntSupplier gx, IntSupplier gy, IntConsumer sx, IntConsumer sy) {
        widgets.add(new Widget(name, gx, gy, sx, sy));
    }

    @Override
    public void render(GuiGraphics gfx, int mouseX, int mouseY, float delta) {
        gfx.fill(0, 0, width, height, 0x99000000);

        String hint = "Перетащите элементы HUD  ●  ESC — сохранить";
        gfx.drawString(font, hint, (width - font.width(hint)) / 2, 6, 0xFFFFDD00, true);

        for (Widget w : widgets) {
            int wx = Math.max(0, Math.min(width  - BW, w.screenX().getAsInt()));
            int wy = Math.max(0, Math.min(height - BH, w.screenY().getAsInt()));

            boolean hovered = mouseX >= wx && mouseX < wx + BW && mouseY >= wy && mouseY < wy + BH;
            boolean active  = dragging == w;

            int bg     = active ? 0xCC4466CC : hovered ? 0xAA224488 : 0x88112255;
            int border = active ? 0xFFFFFFFF : hovered ? 0xFFCCCCCC : 0xFF666688;

            gfx.fill(wx, wy, wx + BW, wy + BH, bg);
            gfx.fill(wx,          wy,          wx + BW, wy + 1,      border);
            gfx.fill(wx,          wy + BH - 1, wx + BW, wy + BH,     border);
            gfx.fill(wx,          wy,          wx + 1,  wy + BH,     border);
            gfx.fill(wx + BW - 1, wy,          wx + BW, wy + BH,     border);

            String label = w.name().length() > 13 ? w.name().substring(0, 13) : w.name();
            gfx.drawString(font, label, wx + 4, wy + 5, 0xFFFFFFFF, true);
        }

        super.render(gfx, mouseX, mouseY, delta);
    }

    @Override
    public boolean mouseClicked(MouseButtonEvent event, boolean consumed) {
        if (!consumed && event.button() == 0) {
            for (int i = widgets.size() - 1; i >= 0; i--) {
                Widget w = widgets.get(i);
                int wx = Math.max(0, Math.min(width  - BW, w.screenX().getAsInt()));
                int wy = Math.max(0, Math.min(height - BH, w.screenY().getAsInt()));
                if (event.x() >= wx && event.x() < wx + BW && event.y() >= wy && event.y() < wy + BH) {
                    dragging  = w;
                    dragLastX = event.x();
                    dragLastY = event.y();
                    return true;
                }
            }
        }
        return super.mouseClicked(event, consumed);
    }

    @Override
    public boolean mouseDragged(MouseButtonEvent event, double dx, double dy) {
        if (dragging != null && event.button() == 0) {
            double curX = event.x();
            double curY = event.y();
            int idX = (int)(curX - dragLastX);
            int idY = (int)(curY - dragLastY);
            if (idX != 0) { dragging.addDX().accept(idX); dragLastX = curX; }
            if (idY != 0) { dragging.addDY().accept(idY); dragLastY = curY; }
            return true;
        }
        return super.mouseDragged(event, dx, dy);
    }

    @Override
    public boolean mouseReleased(MouseButtonEvent event) {
        if (event.button() == 0) dragging = null;
        return super.mouseReleased(event);
    }

    @Override
    public void onClose() {
        ConfigManager.save(BedSMPVisualsClient.CONFIG);
        super.onClose();
    }

    @Override
    public boolean isPauseScreen() { return false; }
}
