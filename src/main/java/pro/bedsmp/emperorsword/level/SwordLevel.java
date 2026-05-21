package pro.bedsmp.emperorsword.level;

import org.bukkit.enchantments.Enchantment;
import pro.bedsmp.emperorsword.quest.QuestType;

import java.util.Collections;
import java.util.Map;

/**
 * Модель одного уровня Меча Императора.
 * Загружается из levels.yml через LevelConfig.
 */
public class SwordLevel {

    private final int levelNumber;
    /** MiniMessage-строка имени меча на этом уровне */
    private final String name;
    /** MiniMessage-строка дополнительного описания (lore) */
    private final String loreTitle;
    /** Требования для перехода на этот уровень: тип квеста -> необходимое количество */
    private final Map<QuestType, Long> requirements;
    /** Чары и их уровни */
    private final Map<Enchantment, Integer> enchants;
    /** Нерушимость предмета */
    private final boolean unbreakable;

    public SwordLevel(
            int levelNumber,
            String name,
            String loreTitle,
            Map<QuestType, Long> requirements,
            Map<Enchantment, Integer> enchants,
            boolean unbreakable
    ) {
        this.levelNumber = levelNumber;
        this.name = name;
        this.loreTitle = loreTitle;
        this.requirements = Collections.unmodifiableMap(requirements);
        this.enchants = Collections.unmodifiableMap(enchants);
        this.unbreakable = unbreakable;
    }

    public int getLevelNumber() { return levelNumber; }
    public String getName() { return name; }
    public String getLoreTitle() { return loreTitle; }
    public Map<QuestType, Long> getRequirements() { return requirements; }
    public Map<Enchantment, Integer> getEnchants() { return enchants; }
    public boolean isUnbreakable() { return unbreakable; }

    /** Уровень без требований — выдаётся игроку сразу */
    public boolean isStartingLevel() {
        return requirements.isEmpty();
    }
}
