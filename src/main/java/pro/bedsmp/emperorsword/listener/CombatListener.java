package pro.bedsmp.emperorsword.listener;

import org.bukkit.entity.*;
import org.bukkit.event.EventHandler;
import org.bukkit.event.EventPriority;
import org.bukkit.event.Listener;
import org.bukkit.event.entity.EntityDamageByEntityEvent;
import org.bukkit.event.entity.EntityDeathEvent;
import pro.bedsmp.emperorsword.quest.QuestTracker;
import pro.bedsmp.emperorsword.quest.QuestType;

/**
 * Листенер боевых событий: убийства игроков/мобов и нанесённый урон.
 */
public class CombatListener implements Listener {

    private final QuestTracker tracker;

    public CombatListener(QuestTracker tracker) {
        this.tracker = tracker;
    }

    /**
     * Убийство любой сущности.
     * Разделяем: игрок или враждебный моб.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onEntityDeath(EntityDeathEvent event) {
        Player killer = event.getEntity().getKiller();
        if (killer == null) return;

        Entity dead = event.getEntity();

        if (dead instanceof Player) {
            // PvP-убийство (убийца ≠ жертва — исключаем суицид)
            if (!dead.getUniqueId().equals(killer.getUniqueId())) {
                tracker.track(killer, QuestType.PLAYER_KILLS);
            }
        } else if (isHostileMob(dead)) {
            tracker.track(killer, QuestType.MOB_KILLS);
        }
    }

    /**
     * Нанесение урона мечом: учитываем DAMAGE_DEALT.
     * Проверяем что оружие в основной руке — именно Меч Императора.
     */
    @EventHandler(priority = EventPriority.MONITOR, ignoreCancelled = true)
    public void onEntityDamageByEntity(EntityDamageByEntityEvent event) {
        if (!(event.getDamager() instanceof Player attacker)) return;
        if (event.getEntity().equals(attacker)) return; // самоурон пропускаем

        // Урон в половинах сердца, округляем вверх
        long damage = (long) Math.ceil(event.getFinalDamage() * 2);
        if (damage <= 0) return;

        // track() внутри проверит, есть ли меч в инвентаре
        tracker.track(attacker, QuestType.DAMAGE_DEALT, damage);
    }

    /**
     * Проверяет, является ли существо враждебным мобом.
     * Использует интерфейс Monster из Bukkit API.
     */
    private boolean isHostileMob(Entity entity) {
        return entity instanceof Monster
                || entity instanceof Slime
                || entity instanceof Ghast
                || entity instanceof Phantom
                || entity instanceof Shulker
                || entity instanceof ElderGuardian
                || entity instanceof Guardian
                || entity instanceof Hoglin
                || entity instanceof Zoglin
                || entity instanceof Evoker
                || entity instanceof Illusioner
                || entity instanceof Ravager
                || entity instanceof Vex;
    }
}
