package pro.bedsmp.emperorsword;

import org.bukkit.plugin.java.JavaPlugin;
import pro.bedsmp.emperorsword.command.EmperorSwordCommand;
import pro.bedsmp.emperorsword.level.LevelConfig;
import pro.bedsmp.emperorsword.listener.BedListener;
import pro.bedsmp.emperorsword.listener.CombatListener;
import pro.bedsmp.emperorsword.listener.MiningListener;
import pro.bedsmp.emperorsword.listener.PlayerListener;
import pro.bedsmp.emperorsword.quest.QuestTracker;
import pro.bedsmp.emperorsword.sword.SwordData;
import pro.bedsmp.emperorsword.sword.SwordManager;

/**
 * Точка входа плагина EmperorSword.
 * BedSMP | bedsmp.pro
 */
public class EmperorSwordPlugin extends JavaPlugin {

    private LevelConfig levelConfig;
    private SwordData swordData;
    private SwordManager swordManager;
    private QuestTracker questTracker;
    private MiningListener miningListener;

    @Override
    public void onEnable() {
        // Сохраняем дефолтные конфиги из jar если их нет
        saveDefaultConfig();
        saveResource("levels.yml", false);

        // Инициализируем компоненты
        levelConfig  = new LevelConfig(this);
        levelConfig.load();

        swordData    = new SwordData(this);
        swordManager = new SwordManager(this, levelConfig, swordData);
        questTracker = new QuestTracker(swordManager);

        // Регистрируем листенеры
        miningListener = new MiningListener(questTracker);

        getServer().getPluginManager().registerEvents(new CombatListener(questTracker), this);
        getServer().getPluginManager().registerEvents(new BedListener(questTracker),    this);
        getServer().getPluginManager().registerEvents(miningListener,                   this);
        getServer().getPluginManager().registerEvents(
                new PlayerListener(swordManager, miningListener), this);

        // Регистрируем команду /es
        EmperorSwordCommand cmdHandler = new EmperorSwordCommand(this, swordManager, levelConfig);
        var cmd = getCommand("es");
        if (cmd != null) {
            cmd.setExecutor(cmdHandler);
            cmd.setTabCompleter(cmdHandler);
        } else {
            getLogger().severe("Команда 'es' не найдена в plugin.yml!");
        }

        getLogger().info("EmperorSword включён. Уровней загружено: " + levelConfig.getAllLevels().size());
    }

    @Override
    public void onDisable() {
        getLogger().info("EmperorSword выключен. Прогресс хранится в PDC предметов.");
    }

    // ——————————————————————————————————————————
    // Геттеры для внешнего доступа (если нужна интеграция с другими плагинами)
    // ——————————————————————————————————————————

    public LevelConfig getLevelConfig()   { return levelConfig; }
    public SwordData getSwordData()        { return swordData; }
    public SwordManager getSwordManager()  { return swordManager; }
    public QuestTracker getQuestTracker()  { return questTracker; }
}
