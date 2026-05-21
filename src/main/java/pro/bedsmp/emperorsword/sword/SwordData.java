package pro.bedsmp.emperorsword.sword;

import org.bukkit.NamespacedKey;
import org.bukkit.inventory.ItemStack;
import org.bukkit.inventory.meta.ItemMeta;
import org.bukkit.persistence.PersistentDataContainer;
import org.bukkit.persistence.PersistentDataType;
import org.bukkit.plugin.java.JavaPlugin;
import pro.bedsmp.emperorsword.quest.QuestType;

import java.util.UUID;

/**
 * Читает и записывает данные Меча Императора в PersistentDataContainer предмета.
 * Все данные хранятся прямо в предмете — переживают рестарты без доп. файлов.
 *
 * Ключи PDC:
 *   emperor_sword  (byte)   — маркер: 1 = это Меч Императора
 *   level          (int)    — текущий уровень
 *   owner          (string) — UUID владельца
 *   progress_*     (long)   — прогресс по каждому типу квеста
 */
public class SwordData {

    // PDC-ключи
    private final NamespacedKey keyMarker;
    private final NamespacedKey keyLevel;
    private final NamespacedKey keyOwner;

    /** Ключи прогресса квестов, по одному на каждый QuestType */
    private final NamespacedKey[] questKeys;

    public SwordData(JavaPlugin plugin) {
        keyMarker = new NamespacedKey(plugin, "emperor_sword");
        keyLevel   = new NamespacedKey(plugin, "level");
        keyOwner   = new NamespacedKey(plugin, "owner");

        QuestType[] types = QuestType.values();
        questKeys = new NamespacedKey[types.length];
        for (int i = 0; i < types.length; i++) {
            questKeys[i] = new NamespacedKey(plugin, types[i].getProgressKey());
        }
    }

    // ——————————————————————————————————————————
    // Проверка
    // ——————————————————————————————————————————

    /** Проверяет, является ли предмет Мечом Императора */
    public boolean isEmperorSword(ItemStack item) {
        if (item == null || !item.hasItemMeta()) return false;
        PersistentDataContainer pdc = item.getItemMeta().getPersistentDataContainer();
        return pdc.getOrDefault(keyMarker, PersistentDataType.BYTE, (byte) 0) == 1;
    }

    // ——————————————————————————————————————————
    // Чтение
    // ——————————————————————————————————————————

    public int getLevel(ItemStack item) {
        if (!isEmperorSword(item)) return 0;
        return item.getItemMeta().getPersistentDataContainer()
                .getOrDefault(keyLevel, PersistentDataType.INTEGER, 1);
    }

    /** Возвращает UUID владельца или null если не задан */
    public UUID getOwner(ItemStack item) {
        if (!isEmperorSword(item)) return null;
        String raw = item.getItemMeta().getPersistentDataContainer()
                .get(keyOwner, PersistentDataType.STRING);
        if (raw == null) return null;
        try {
            return UUID.fromString(raw);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    public long getProgress(ItemStack item, QuestType type) {
        if (!isEmperorSword(item)) return 0L;
        NamespacedKey key = questKeys[type.ordinal()];
        return item.getItemMeta().getPersistentDataContainer()
                .getOrDefault(key, PersistentDataType.LONG, 0L);
    }

    // ——————————————————————————————————————————
    // Запись (применяет изменения к ItemMeta)
    // ——————————————————————————————————————————

    /** Помечает предмет как Меч Императора и задаёт начальные данные */
    public void initSword(ItemStack item, UUID owner, int startLevel) {
        ItemMeta meta = item.getItemMeta();
        PersistentDataContainer pdc = meta.getPersistentDataContainer();
        pdc.set(keyMarker, PersistentDataType.BYTE, (byte) 1);
        pdc.set(keyLevel, PersistentDataType.INTEGER, startLevel);
        pdc.set(keyOwner, PersistentDataType.STRING, owner.toString());
        // Обнуляем прогресс всех квестов
        for (QuestType type : QuestType.values()) {
            pdc.set(questKeys[type.ordinal()], PersistentDataType.LONG, 0L);
        }
        item.setItemMeta(meta);
    }

    public void setLevel(ItemStack item, int level) {
        ItemMeta meta = item.getItemMeta();
        meta.getPersistentDataContainer().set(keyLevel, PersistentDataType.INTEGER, level);
        item.setItemMeta(meta);
    }

    /**
     * Сбрасывает прогресс всех квестов (при переходе на новый уровень
     * прогресс обнуляется, чтобы начать отсчёт для следующего уровня).
     */
    public void resetAllProgress(ItemStack item) {
        ItemMeta meta = item.getItemMeta();
        PersistentDataContainer pdc = meta.getPersistentDataContainer();
        for (QuestType type : QuestType.values()) {
            pdc.set(questKeys[type.ordinal()], PersistentDataType.LONG, 0L);
        }
        item.setItemMeta(meta);
    }

    /**
     * Атомарно прибавляет delta к прогрессу указанного квеста.
     * Возвращает новое значение.
     */
    public long addProgress(ItemStack item, QuestType type, long delta) {
        ItemMeta meta = item.getItemMeta();
        PersistentDataContainer pdc = meta.getPersistentDataContainer();
        NamespacedKey key = questKeys[type.ordinal()];
        long current = pdc.getOrDefault(key, PersistentDataType.LONG, 0L);
        long newValue = current + delta;
        pdc.set(key, PersistentDataType.LONG, newValue);
        item.setItemMeta(meta);
        return newValue;
    }

    public void setProgress(ItemStack item, QuestType type, long value) {
        ItemMeta meta = item.getItemMeta();
        meta.getPersistentDataContainer()
                .set(questKeys[type.ordinal()], PersistentDataType.LONG, value);
        item.setItemMeta(meta);
    }
}
