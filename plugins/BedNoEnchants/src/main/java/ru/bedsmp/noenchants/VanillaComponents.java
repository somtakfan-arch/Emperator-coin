package ru.bedsmp.noenchants;

import io.papermc.paper.datacomponent.DataComponentType;
import io.papermc.paper.registry.RegistryAccess;
import io.papermc.paper.registry.RegistryKey;
import org.bukkit.NamespacedKey;
import org.bukkit.Registry;
import org.bukkit.inventory.ItemStack;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.logging.Logger;

/**
 * Возвращает характеристики предмета к ванильным значениям.
 *
 * <p>Работает через Data Component API: {@code resetData} сбрасывает компонент
 * к тому значению, которое у этого предмета в обычной игре. Алмазный меч с уроном
 * 1000 снова становится обычным алмазным мечом, а обычный алмазный меч не меняется
 * вообще.</p>
 */
public final class VanillaComponents {

    private final List<DataComponentType> types;

    private VanillaComponents(List<DataComponentType> types) {
        this.types = types;
    }

    /** Превращает список ключей из конфига в реальные компоненты сервера. */
    public static VanillaComponents resolve(List<String> keys, Logger logger) {
        List<DataComponentType> resolved = new ArrayList<>();
        if (keys == null || keys.isEmpty()) return new VanillaComponents(resolved);

        Registry<DataComponentType> registry =
                RegistryAccess.registryAccess().getRegistry(RegistryKey.DATA_COMPONENT_TYPE);

        for (String raw : keys) {
            if (raw == null || raw.isBlank()) continue;
            NamespacedKey key = NamespacedKey.fromString(raw.trim().toLowerCase(Locale.ROOT));
            DataComponentType type = key == null ? null : registry.get(key);
            if (type == null) {
                logger.warning("Неизвестный компонент в vanilla-gear.components: " + raw + " — пропущен.");
                continue;
            }
            resolved.add(type);
        }
        return new VanillaComponents(resolved);
    }

    public boolean isEmpty() {
        return types.isEmpty();
    }

    public int size() {
        return types.size();
    }

    /**
     * Сбрасывает перечисленные компоненты предмета к ванильным значениям.
     *
     * @return {@code true}, если предмет реально изменился
     */
    public boolean restore(ItemStack item) {
        if (item == null || types.isEmpty()) return false;

        ItemStack before = null;
        for (DataComponentType type : types) {
            if (!item.hasData(type)) continue;
            if (before == null) before = item.clone();
            item.resetData(type);
        }
        // before != null означает лишь то, что компонент присутствовал (в том числе
        // ванильный по умолчанию), поэтому сверяем предмет до и после.
        return before != null && !before.isSimilar(item);
    }
}
