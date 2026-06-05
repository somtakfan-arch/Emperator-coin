package pro.bedsmp.visuals;

import net.fabricmc.api.EnvType;
import net.fabricmc.api.Environment;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;
import org.lwjgl.glfw.GLFW;

import pro.bedsmp.visuals.config.ConfigScreen;
import pro.bedsmp.visuals.screen.HudEditorScreen;

@Environment(EnvType.CLIENT)
public class KeyBindings {

    public static KeyMapping openMenu;
    public static KeyMapping quickToggle;
    public static KeyMapping openHudEditor;
    public static KeyMapping cycleBedStatus;

    private static final KeyMapping.Category CATEGORY =
            KeyMapping.Category.register(Identifier.fromNamespaceAndPath("bedsmpvisuals", "category"));

    public static void register() {
        openMenu = KeyBindingHelper.registerKeyBinding(new KeyMapping(
                "key.bedsmpvisuals.open_menu",
                GLFW.GLFW_KEY_V,
                CATEGORY
        ));

        quickToggle = KeyBindingHelper.registerKeyBinding(new KeyMapping(
                "key.bedsmpvisuals.quick_toggle",
                GLFW.GLFW_KEY_B,
                CATEGORY
        ));

        openHudEditor = KeyBindingHelper.registerKeyBinding(new KeyMapping(
                "key.bedsmpvisuals.open_hud_editor",
                GLFW.GLFW_KEY_H,
                CATEGORY
        ));

        cycleBedStatus = KeyBindingHelper.registerKeyBinding(new KeyMapping(
                "key.bedsmpvisuals.cycle_bed_status",
                GLFW.GLFW_KEY_UNKNOWN,
                CATEGORY
        ));

        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            if (openMenu.consumeClick()) {
                client.setScreen(ConfigScreen.create(client.screen));
            }
            if (quickToggle.consumeClick()) {
                handleQuickToggle(client);
            }
            if (openHudEditor.consumeClick()) {
                client.setScreen(new HudEditorScreen());
            }
        });
    }

    private static void handleQuickToggle(Minecraft client) {
        // Быстрый тогл — переключает основной режим HUD
        var cfg = BedSMPVisualsClient.CONFIG;
        if (cfg == null) return;
        cfg.hudVisible = !cfg.hudVisible;
        pro.bedsmp.visuals.config.ConfigManager.save(cfg);
    }
}
