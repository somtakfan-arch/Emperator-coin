-- Every line shown to a player lives here. Nothing user-facing belongs in the
-- code itself, so translating or rewording never means touching logic.

Locale = {
    -- служба
    onDuty            = 'Ты заступил на службу: %s',
    offDuty           = 'Ты снят со службы',
    notOnDuty         = 'Ты не на службе',
    notOfficer        = 'Ты не сотрудник полиции',
    noPermission      = 'Недостаточно прав. Нужен ранг выше',
    notAtStation      = 'Это можно сделать только в отделении',
    loadoutGiven      = 'Выдана форма и табельное снаряжение',
    loadoutNoRoom     = 'В инвентаре нет места под снаряжение',
    officersOnline    = 'На службе сейчас: %d',
    officersNone      = 'На службе никого нет',
    hired             = '%s принят в полицию, ранг: %s',
    fired             = '%s уволен из полиции',
    rankSet           = '%s — новый ранг: %s',

    -- наручники
    cuffedSoft        = 'На тебя надели стяжки. Можно попробовать вырваться',
    cuffedHard        = 'На тебя надели наручники. Снять может только сотрудник',
    cuffApplied       = 'Задержанный в наручниках',
    uncuffed          = 'С тебя сняли наручники',
    uncuffDone        = 'Наручники сняты',
    alreadyCuffed     = 'На нём уже наручники',
    notCuffed         = 'На нём нет наручников',
    cuffedBlocked     = 'В наручниках это недоступно',
    needCuffs         = 'Нужны наручники или стяжки',
    needKey           = 'Нужен ключ от наручников',

    -- побег
    escapeStart       = 'Пытаешься вырваться...',
    escapeSuccess     = 'Получилось! Ты свободен',
    escapeFail        = 'Не вышло. Следующая попытка через %d с',
    escapeCooldown    = 'Рано. Подожди ещё %d с',
    escapeHard        = 'Из наручников не вырваться — только ключом',

    -- конвоирование
    escortStart       = 'Ты ведёшь задержанного',
    escortStop        = 'Задержанный отпущен',
    escortBeing       = 'Тебя ведут',
    escortFreed       = 'Ты больше не на конвое',
    escortTooFar      = 'Задержанный отвязался — слишком далеко',
    putInCar          = 'Задержанный посажен в транспорт',
    pulledOut         = 'Задержанный вытащен из транспорта',
    noVehicleNear     = 'Рядом нет транспорта',
    kneelDown         = 'Задержанный поставлен на колени',
    standUp           = 'Задержанный поднят',

    -- обыск и изъятие
    searchOpened      = 'Обыск: %s',
    searchedBy        = 'Тебя обыскивает сотрудник',
    seized            = 'Изъято: %s',
    seizedFrom        = 'У тебя изъяли: %s',
    seizeNothing      = 'Нечего изымать',
    docsChecked       = 'Документы проверены',
    docsShown         = 'Сотрудник проверил твои документы',
    noDocs            = 'Документов нет',

    -- розыск
    wantedAdded       = 'Розыск: %s — уровень %d (%s)',
    wantedCleared     = 'Розыск с %s снят',
    wantedNone        = 'Разыскиваемых нет',
    wantedSelf        = 'Ты в розыске: уровень %d — %s',

    -- арест
    jailed            = 'Ты арестован на %d мин. Причина: %s',
    jailedBy          = '%s отправлен в тюрьму на %d мин',
    jailReleased      = 'Срок вышел, ты свободен',
    jailRemaining     = 'До освобождения: %d мин',
    jailNotIn         = 'Он не в тюрьме',
    jailBailPaid      = 'Залог внесён, ты свободен',
    jailBailCost      = 'Залог: $%d',
    jailBailNoMoney   = 'Не хватает денег на залог',
    jailBailBlocked   = 'При таком уровне розыска залог не положен',
    jailStayInside    = 'Из тюрьмы не выйти до конца срока',

    -- штрафы
    fineIssued        = 'Штраф выписан: $%d (%s)',
    fineReceived      = 'Тебе выписан штраф $%d — %s',
    fineCharged       = 'Списано со счёта: $%d',
    fineUnpaid        = 'Не хватило денег, штраф записан как долг',
    fineBadAmount     = 'Некорректная сумма',

    -- инструменты
    taserCooldown     = 'Тазер перезаряжается: %d с',
    taserHit          = 'Тебя оглушили',
    propPlaced        = 'Установлено: %s',
    propRemoved       = 'Убрано',
    propLimit         = 'Достигнут лимит объектов (%d)',
    propNone          = 'Рядом нет твоих объектов',

    -- штрафстоянка
    impounded         = 'Транспорт %s отправлен на штрафстоянку',
    impoundedOwner    = 'Твой транспорт %s на штрафстоянке. Выкуп: $%d',
    impoundNotFound   = 'Рядом нет транспорта',
    impoundNotOwned   = 'Этот транспорт ничей',
    impoundReleased   = 'Транспорт выкуплен',
    impoundNoMoney    = 'Не хватает денег на выкуп',
    impoundEmpty      = 'На штрафстоянке ничего нет',

    -- рация
    radioOn           = 'Рация включена, канал %d',
    radioOff          = 'Рация выключена',
    radioEmpty        = 'Пустое сообщение',

    -- планшет
    mdtNotFound       = 'Ничего не найдено',
    mdtNoAccess       = 'Нет доступа к базе',
    licenseRevoked    = 'Лицензия аннулирована: %s',
    licenseNotFound   = 'Такой лицензии нет',

    -- общее
    targetNotFound    = 'Игрок не найден',
    tooFar            = 'Слишком далеко',
    rateLimited       = 'Слишком часто. Помедленнее',
    dbError           = 'Ошибка базы данных, действие отменено',
}
