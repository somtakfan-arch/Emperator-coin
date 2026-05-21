package pro.bedsmp.emperorsword.quest;

/**
 * Типы квестов для прогресса Меча Императора.
 * Каждый тип соответствует определённому игровому действию.
 */
public enum QuestType {

    /** Убийства враждебных мобов */
    MOB_KILLS("Убийства мобов", "mob_kills"),

    /** Убийства игроков в PvP */
    PLAYER_KILLS("Убийства игроков", "player_kills"),

    /** Уничтожение чужих кроватей — главная фишка BedSMP */
    BEDS_DESTROYED("Кровати уничтожены", "beds_destroyed"),

    /** Добыча алмазной руды */
    DIAMONDS_MINED("Алмазов добыто", "diamonds_mined"),

    /** Пройденное расстояние в метрах */
    DISTANCE_WALKED("Пройдено метров", "distance_walked"),

    /** Суммарный урон нанесённый мечом (в половинах сердца) */
    DAMAGE_DEALT("Нанесено урона", "damage_dealt");

    /** Название для отображения в lore и /es info */
    private final String displayName;

    /** Ключ для хранения прогресса в PDC предмета */
    private final String pdcKey;

    QuestType(String displayName, String pdcKey) {
        this.displayName = displayName;
        this.pdcKey = pdcKey;
    }

    public String getDisplayName() {
        return displayName;
    }

    /** Ключ прогресса в PDC: "progress_<pdcKey>" */
    public String getProgressKey() {
        return "progress_" + pdcKey;
    }

    /**
     * Разбирает тип квеста из строки конфига (регистронезависимо).
     * Возвращает null если тип не найден.
     */
    public static QuestType fromConfigKey(String key) {
        for (QuestType type : values()) {
            if (type.name().equalsIgnoreCase(key)) {
                return type;
            }
        }
        return null;
    }
}
