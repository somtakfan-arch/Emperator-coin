package com.bedsmp.thornsward;

import org.bukkit.command.PluginCommand;
import org.bukkit.plugin.java.JavaPlugin;

public final class ThornsWardPlugin extends JavaPlugin {

    private ThornsWardItem     thornsWardItem;
    private CrystallerSwordItem crystallerSwordItem;
    private AmethystAxeItem     amethystAxeItem;
    private NemesisItem         nemesisItem;
    private PhantomItem         phantomItem;
    private MirrorShieldItem    mirrorShieldItem;
    private InstantAppleItem    instantAppleItem;
    private RevengeThornItem    revengeThornItem;
    private SoulLanternItem     soulLanternItem;
    private DragonRoarItem      dragonRoarItem;
    private ZeusTridentItem     zeusTridentItem;
    private SpiritMaskItem      spiritMaskItem;
    private ShadowCloakItem     shadowCloakItem;
    private IronCanopyItem      ironCanopyItem;
    private LeviathanArmorItem  leviathanArmorItem;
    private ThiefsHoodItem      thiefsHoodItem;
    private ChronoStoneItem     chronoStoneItem;
    private SpiderThreadItem    spiderThreadItem;
    private PhoenixAshItem      phoenixAshItem;
    private EchoPastItem        echoPastItem;
    private GravityTrapItem     gravityTrapItem;
    private ChaosWhistleItem    chaosWhistleItem;
    private ServerHeartItem     serverHeartItem;
    private VoodooDollItem      voodooDollItem;
    private ChaosFeatherItem    chaosFeatherItem;
    private SuperTntItem        superTntItem;

    @Override
    public void onEnable() {
        saveDefaultConfig();

        thornsWardItem      = new ThornsWardItem(this);
        crystallerSwordItem = new CrystallerSwordItem(this);
        amethystAxeItem     = new AmethystAxeItem(this);
        nemesisItem         = new NemesisItem(this);
        phantomItem         = new PhantomItem(this);
        mirrorShieldItem    = new MirrorShieldItem(this);
        instantAppleItem    = new InstantAppleItem(this);
        revengeThornItem    = new RevengeThornItem(this);
        soulLanternItem     = new SoulLanternItem(this);
        dragonRoarItem      = new DragonRoarItem(this);
        zeusTridentItem     = new ZeusTridentItem(this);
        spiritMaskItem      = new SpiritMaskItem(this);
        shadowCloakItem     = new ShadowCloakItem(this);
        ironCanopyItem      = new IronCanopyItem(this);
        leviathanArmorItem  = new LeviathanArmorItem(this);
        thiefsHoodItem      = new ThiefsHoodItem(this);
        chronoStoneItem     = new ChronoStoneItem(this);
        spiderThreadItem    = new SpiderThreadItem(this);
        phoenixAshItem      = new PhoenixAshItem(this);
        echoPastItem        = new EchoPastItem(this);
        gravityTrapItem     = new GravityTrapItem(this);
        chaosWhistleItem    = new ChaosWhistleItem(this);
        serverHeartItem     = new ServerHeartItem(this);
        voodooDollItem      = new VoodooDollItem(this);
        chaosFeatherItem    = new ChaosFeatherItem(this);
        superTntItem        = new SuperTntItem(this);

        getServer().getPluginManager().registerEvents(new ThornsWardListener(this, thornsWardItem), this);
        getServer().getPluginManager().registerEvents(new CrystallerSwordListener(this, crystallerSwordItem), this);
        getServer().getPluginManager().registerEvents(new AmethystAxeListener(this, amethystAxeItem), this);
        getServer().getPluginManager().registerEvents(new NemesisListener(this, nemesisItem), this);
        getServer().getPluginManager().registerEvents(new PhantomListener(this, phantomItem), this);
        getServer().getPluginManager().registerEvents(new MirrorShieldListener(this, mirrorShieldItem), this);
        getServer().getPluginManager().registerEvents(new InstantAppleListener(this, instantAppleItem), this);
        getServer().getPluginManager().registerEvents(new RevengeThornListener(this, revengeThornItem), this);
        getServer().getPluginManager().registerEvents(new SoulLanternListener(this, soulLanternItem), this);
        getServer().getPluginManager().registerEvents(new DragonRoarListener(this, dragonRoarItem), this);
        getServer().getPluginManager().registerEvents(new ZeusTridentListener(this, zeusTridentItem), this);
        getServer().getPluginManager().registerEvents(new SpiritMaskListener(spiritMaskItem), this);
        getServer().getPluginManager().registerEvents(new ShadowCloakListener(this, shadowCloakItem), this);
        getServer().getPluginManager().registerEvents(new IronCanopyListener(this, ironCanopyItem), this);
        getServer().getPluginManager().registerEvents(new LeviathanArmorListener(this, leviathanArmorItem), this);
        getServer().getPluginManager().registerEvents(new ThiefsHoodListener(this, thiefsHoodItem), this);
        getServer().getPluginManager().registerEvents(new ChronoStoneListener(this, chronoStoneItem), this);
        getServer().getPluginManager().registerEvents(new SpiderThreadListener(this, spiderThreadItem), this);
        getServer().getPluginManager().registerEvents(new PhoenixAshListener(this, phoenixAshItem), this);
        getServer().getPluginManager().registerEvents(new EchoPastListener(this, echoPastItem), this);
        getServer().getPluginManager().registerEvents(new GravityTrapListener(this, gravityTrapItem), this);
        getServer().getPluginManager().registerEvents(new ChaosWhistleListener(this, chaosWhistleItem), this);
        getServer().getPluginManager().registerEvents(new ServerHeartListener(this, serverHeartItem), this);
        getServer().getPluginManager().registerEvents(new VoodooDollListener(this, voodooDollItem), this);
        getServer().getPluginManager().registerEvents(new ChaosFeatherListener(this, chaosFeatherItem), this);
        getServer().getPluginManager().registerEvents(new SuperTntListener(this, superTntItem), this);

        ThornsWardCommand thornsWardCommand = new ThornsWardCommand(thornsWardItem);
        registerCommand("thornsward", thornsWardCommand, thornsWardCommand);

        CrystallerSwordCommand crystallerSwordCommand = new CrystallerSwordCommand(crystallerSwordItem);
        registerCommand("crystallersword", crystallerSwordCommand, crystallerSwordCommand);

        AmethystAxeCommand amethystAxeCommand = new AmethystAxeCommand(amethystAxeItem);
        registerCommand("amethystaxe", amethystAxeCommand, amethystAxeCommand);

        NemesisCommand nemesisCommand = new NemesisCommand(nemesisItem);
        registerCommand("nemesis", nemesisCommand, nemesisCommand);

        PhantomCommand phantomCommand = new PhantomCommand(phantomItem);
        registerCommand("phantom", phantomCommand, phantomCommand);

        MirrorShieldCommand mirrorShieldCommand = new MirrorShieldCommand(mirrorShieldItem);
        registerCommand("mirrorshield", mirrorShieldCommand, mirrorShieldCommand);

        InstantAppleCommand instantAppleCommand = new InstantAppleCommand(instantAppleItem);
        registerCommand("instantapple", instantAppleCommand, instantAppleCommand);

        RevengeThornCommand revengeThornCommand = new RevengeThornCommand(revengeThornItem);
        registerCommand("revengethorn", revengeThornCommand, revengeThornCommand);

        SoulLanternCommand soulLanternCommand = new SoulLanternCommand(soulLanternItem);
        registerCommand("soullantern", soulLanternCommand, soulLanternCommand);

        DragonRoarCommand dragonRoarCommand = new DragonRoarCommand(dragonRoarItem);
        registerCommand("dragonroar", dragonRoarCommand, dragonRoarCommand);

        ZeusTridentCommand zeusTridentCommand = new ZeusTridentCommand(zeusTridentItem);
        registerCommand("zeustrident", zeusTridentCommand, zeusTridentCommand);

        SpiritMaskCommand spiritMaskCommand = new SpiritMaskCommand(spiritMaskItem);
        registerCommand("spiritmask", spiritMaskCommand, spiritMaskCommand);

        ShadowCloakCommand shadowCloakCommand = new ShadowCloakCommand(shadowCloakItem);
        registerCommand("shadowcloak", shadowCloakCommand, shadowCloakCommand);

        IronCanopyCommand ironCanopyCommand = new IronCanopyCommand(ironCanopyItem);
        registerCommand("ironcanopy", ironCanopyCommand, ironCanopyCommand);

        LeviathanArmorCommand leviathanArmorCommand = new LeviathanArmorCommand(leviathanArmorItem);
        registerCommand("leviathanarmor", leviathanArmorCommand, leviathanArmorCommand);

        ThiefsHoodCommand thiefsHoodCommand = new ThiefsHoodCommand(thiefsHoodItem);
        registerCommand("thiefhood", thiefsHoodCommand, thiefsHoodCommand);

        ChronoStoneCommand chronoStoneCommand = new ChronoStoneCommand(chronoStoneItem);
        registerCommand("chronostone", chronoStoneCommand, chronoStoneCommand);

        SpiderThreadCommand spiderThreadCommand = new SpiderThreadCommand(spiderThreadItem);
        registerCommand("spiderthread", spiderThreadCommand, spiderThreadCommand);

        PhoenixAshCommand phoenixAshCommand = new PhoenixAshCommand(phoenixAshItem);
        registerCommand("phoenixash", phoenixAshCommand, phoenixAshCommand);

        EchoPastCommand echoPastCommand = new EchoPastCommand(echoPastItem);
        registerCommand("echopast", echoPastCommand, echoPastCommand);

        GravityTrapCommand gravityTrapCommand = new GravityTrapCommand(gravityTrapItem);
        registerCommand("gravitytrap", gravityTrapCommand, gravityTrapCommand);

        ChaosWhistleCommand chaosWhistleCommand = new ChaosWhistleCommand(chaosWhistleItem);
        registerCommand("chaoswhistle", chaosWhistleCommand, chaosWhistleCommand);

        ServerHeartCommand serverHeartCommand = new ServerHeartCommand(serverHeartItem);
        registerCommand("serverheart", serverHeartCommand, serverHeartCommand);

        VoodooDollCommand voodooDollCommand = new VoodooDollCommand(voodooDollItem);
        registerCommand("voodoodoll", voodooDollCommand, voodooDollCommand);

        ChaosFeatherCommand chaosFeatherCommand = new ChaosFeatherCommand(chaosFeatherItem);
        registerCommand("chaosfeather", chaosFeatherCommand, chaosFeatherCommand);

        SuperTntCommand superTntCommand = new SuperTntCommand(superTntItem);
        registerCommand("supertnt", superTntCommand, superTntCommand);

        ThornsWardShop shop = new ThornsWardShop(this);
        getServer().getPluginManager().registerEvents(new ThornsWardShopListener(shop), this);
        ThornsWardShopCommand shopCommand = new ThornsWardShopCommand(shop);
        registerCommand("thornswardshop", shopCommand, shopCommand);

        getLogger().info("ThornsWard включен.");
    }

    private void registerCommand(String name, org.bukkit.command.CommandExecutor executor,
                                  org.bukkit.command.TabCompleter tabCompleter) {
        PluginCommand command = getCommand(name);
        if (command != null) {
            command.setExecutor(executor);
            command.setTabCompleter(tabCompleter);
        } else {
            getLogger().warning("Команда '" + name + "' не зарегистрирована — проверьте plugin.yml.");
        }
    }

    public ThornsWardItem getThornsWardItem() {
        return thornsWardItem;
    }

    public CrystallerSwordItem getCrystallerSwordItem() {
        return crystallerSwordItem;
    }
}
