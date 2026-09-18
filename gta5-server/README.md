# FiveM сервер за 10 минут

Готовый комплект чтобы поднять GTA 5 сервер-песочницу для игры с друзьями.
Один скрипт качает всё сам: FXServer, базовые ресурсы, vMenu и пак машин,
пишет рабочий `server.cfg` и создаёт `start.bat`.

Никакого ESX/QBCore, базы данных и RP-обвеса — только песочница: спавн любых
тачек, оружие, телепорт, погода, кастом персонажа.

---

## Что нужно заранее

- Windows 10/11, PowerShell 5.1 (стоит по умолчанию)
- Лицензионная GTA V у тебя и у друзей — **пиратка не подключится**
- У всех установлен [FiveM](https://fivem.net/)
- ~10 ГБ свободного места

## Шаг 1. Ключ (2 минуты)

1. Идёшь на [keymaster.fivem.net](https://keymaster.fivem.net), логинишься через форум Cfx.re
2. **New server** → тип **Development**, IP можно оставить `0.0.0.0`
3. Копируешь ключ — он понадобится через минуту

## Шаг 2. Запуск скрипта (5 минут)

Скачиваешь `setup.ps1` из этой папки, кидаешь, например, в `Загрузки`.
Открываешь PowerShell **в этой папке** (Shift + ПКМ → «Открыть окно PowerShell здесь») и:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\setup.ps1
```

Скрипт спросит лицензионный ключ и дальше сделает всё сам:

- скачает актуальный рекомендованный билд FXServer
- развернёт базовые ресурсы (`cfx-server-data`)
- поставит последнюю версию **vMenu**
- скачает пак машин (Bugatti Chiron, Huracan, GTR, Corvette Z06, BMW M4, Mustang, Charger и др.)
- **сам найдёт спавн-имена машин** в `.meta` файлах и пропишет их в `vMenu/config/addons.json`
- напишет `server.cfg` и `start.bat`

Параметры (все необязательные):

```powershell
.\setup.ps1 -Root "D:\FXServer" -Hostname "Emperator crew" -MaxClients 16
.\setup.ps1 -SkipCars          # без пака машин, только ванилла
.\setup.ps1 -SyncCarsOnly      # пересканировать машины после добавления новых паков
```

## Шаг 3. Играем (3 минуты)

1. Запускаешь `C:\FXServer\server-data\start.bat`
2. Ждёшь в консоли строчку про то, что сервер поднялся
3. В FiveM жмёшь **F8** и пишешь:
   ```
   connect 127.0.0.1
   ```
4. В игре **M** → Vehicle Spawner → **Addon Vehicles**

---

## Как пустить друзей

| Способ | Что делать | Кому |
|---|---|---|
| **Radmin VPN** | Ставите всей компанией, создаёшь сеть, друзья коннектятся `connect <твой_ip_в_radmin>` | Если у тебя серый IP (чаще всего так) — **самый простой путь** |
| **Проброс портов** | В роутере открываешь **30120 TCP + UDP**, друзья пишут `connect <твой_внешний_ip>` | Если IP белый. Пинг лучше |
| **VDS** | Арендуешь за ~5–10 €/мес, ставишь туда | Если хочешь чтобы сервер жил без твоего ПК |

Проверить свой внешний IP: [2ip.ru](https://2ip.ru). Если он не совпадает с тем,
что показывает роутер — IP серый, нужен Radmin VPN.

---

## Добавить ещё машин

1. Кидаешь папку пака в `C:\FXServer\server-data\resources\[cars]\`
2. Запускаешь:
   ```powershell
   .\setup.ps1 -SyncCarsOnly
   ```
3. Скрипт сам разложит ресурсы по нужной глубине, вытащит спавн-имена и обновит vMenu
4. Дописываешь `ensure <имя_ресурса>` в `server.cfg` (скрипт выведет список) и рестартишь

Где брать бесплатные паки:

- [PLOKMJNB/FiveM-Civ-Car-Pack](https://github.com/PLOKMJNB/FiveM-Civ-Car-Pack) — 161 машина, есть Bugatti Bolide
- [five-m/Vehicles](https://github.com/five-m/Vehicles) — FiveM-ready
- [DEVBenSon/FiveM-Car-Packs](https://github.com/DEVBenSon/FiveM-Car-Packs) — паки до 200+ машин
- [ThatGivensGuy/GIVENS_CARPACK](https://github.com/ThatGivensGuy/GIVENS_CARPACK)
- [gta5-mods.com](https://www.gta5-mods.com/vehicles) — поштучно, но почти всё под сингл, нужна конвертация

> ⚠️ Сайты со «слитыми» платными ресурсами (vag.gg, highleaks и подобные) — мимо.
> Там реально встречаются бэкдоры, которые уводят доступ к серверу.

---

## Если что-то пошло не так

| Симптом | Причина / решение |
|---|---|
| Машина спавнится как ванильная | В ресурсе потерялась строка `data_file 'VEHICLE_METADATA_FILE' 'data/vehicles.meta'` в `fxmanifest.lua` |
| Машины нет в меню vMenu | Спавн-имя не попало в `addons.json` — прогони `.\setup.ps1 -SyncCarsOnly` |
| `couldn't find resource` в консоли | Ресурс лежит слишком глубоко. FiveM сканирует только папки в квадратных скобках — прогони `-SyncCarsOnly`, он разложит правильно |
| Друзья не коннектятся | Порт 30120 (TCP **и** UDP) закрыт, либо серый IP → Radmin VPN |
| Новые DLC-тачки не спавнятся | Раскомментируй `set sv_enforceGameBuild 3407` в `server.cfg` |
| `Invalid license key` | Ключ не для того IP или тип сервера не Development — сделай новый в keymaster |
| Скрипт ругается на политику выполнения | `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force` |

---

## Файлы

| Файл | Что это |
|---|---|
| `setup.ps1` | Скрипт установки. Один запуск — готовый сервер |
| `server.cfg` | Референсная копия конфига, который генерит скрипт |
| `spawn-codes.md` | Шпаргалка по ванильным спавн-кодам (Bugatti и остальная экзотика) |
