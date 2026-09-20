#!/usr/bin/env bash
#
# Обновить ресурсы до текущего состояния репозитория, перезапустить сервер
# и сказать прямым текстом, что сломано.
#
#     bash deploy.sh                 # обновить, перезапустить, проверить
#     bash deploy.sh --check         # ничего не трогать, только диагноз
#     bash deploy.sh --no-restart    # обновить файлы, но не перезапускать
#
# Данные игроков (characters.json, inventories.json, документы, машины,
# деньги, тюнинг) лежат ВНУТРИ папок ресурсов. Скрипт их переносит, а не
# затирает. Машины, стволы, vMenu и лицензионный ключ не трогаются вообще.

# pipefail не ставим намеренно: тут полно `... | head -n 1`, head закрывает
# трубу, продюсер ловит SIGPIPE, и скрипт умер бы молча.
set -eu

ROOT="${ROOT:-/opt/fivem}"
REPO_BRANCH="${REPO_BRANCH:-claude/gta5-rp-server-setup-fvdafy}"
SERVICE_USER="${SERVICE_USER:-fivem}"
REPO_ZIP="https://github.com/somtakfan-arch/Emperator-coin/archive/refs/heads/${REPO_BRANCH}.zip"

DATA_DIR="$ROOT/server-data"
RES_DIR="$DATA_DIR/resources"
CFG="$DATA_DIR/server.cfg"
LOG="$ROOT/server.log"
TMP="$ROOT/tmp/deploy"

RESOURCES=(phone_garage ls_character ls_inventory ls_shops ls_medical ls_tuning ls_rp ls_police ls_gangs ls_crime ls_property ls_interact ls_armoury ls_forum ls_turf ls_city ls_business ls_fuel ls_jobs ls_wild ls_world)

SERVER_DIR="$ROOT/server"
CARS_DIR="$RES_DIR/[cars]"
DB_NAME="${DB_NAME:-fivem}"
PACKAGES=(curl xz-utils unzip jq ca-certificates screen git tmux)

VERSIONS_API='https://changelogs-live.fivem.net/api/changelog/versions/linux/server'
SERVER_DATA_ZIP='https://github.com/citizenfx/cfx-server-data/archive/refs/heads/master.zip'
VMENU_API='https://api.github.com/repos/TomGrobbe/vMenu/releases/latest'
OXMYSQL_API='https://api.github.com/repos/overextended/oxmysql/releases/latest'
PMA_VOICE_ZIP='https://github.com/AvarianKnight/pma-voice/archive/refs/heads/master.zip'
CAR_PACK_ZIP='https://github.com/Rymex47/free-modpack/archive/refs/heads/main.zip'
SETUP_URL="https://raw.githubusercontent.com/somtakfan-arch/Emperator-coin/${REPO_BRANCH}/gta5-server/setup.sh"

MODE=update
case "${1:-}" in
    --check)      MODE=check ;;
    --no-restart) MODE=norestart ;;
    --key)        MODE=key ;;
    '')           ;;
    *)            printf 'usage: bash deploy.sh [--check|--no-restart|--key]\n' >&2; exit 2 ;;
esac

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m    OK  %s\033[0m\n' "$1"; }
warn() { printf '\033[33m    !   %s\033[0m\n' "$1"; }
bad()  { printf '\033[31m    ✗   %s\033[0m\n' "$1"; }
die()  { printf '\033[31m    ОШИБКА: %s\033[0m\n' "$1" >&2; exit 1; }

problems=0
note_problem() { problems=$((problems + 1)); }

# В ключе Cfx бывают только буквы, цифры и подчёркивание. Всё остальное -
# мусор из терминала: стрелки оставляют в буфере ^[[B, телефонные клавиатуры
# любят дорисовать пробел или перевод строки. Один такой символ - и svadhesive
# строит с ним адрес проверки, curl отвечает "code 3 (bad/illegal format)",
# сервер выходит, не дойдя до ресурсов.
#
# Выкинуть "всё, кроме букв и цифр" мало: ^[[B - это три байта, ESC и [
# отфильтруются, а B останется буквой и прилипнет к ключу.
#
# Разбирать ESC-последовательности регулярным выражением - лишний риск
# (первая версия этой функции съедала на символ больше, чем надо). Ключи Cfx
# начинаются с cfxk_, так что всё слева от этой метки - мусор по определению:
# режем по ней, и только потом убираем остатки вроде пробела и перевода
# строки. Ключ без метки чистим как умеем, о чём режим --key предупредит.
clean_key() {
    local text
    # Простая форма ESC-последовательности; она же снимает стрелку, нажатую
    # уже после вставки ключа.
    text="$(printf '%s' "$1" | sed 's/\x1b\[[0-9;]*[A-Za-z]//g')"
    case "$text" in
        *cfxk_*) text="cfxk_${text#*cfxk_}" ;;
    esac
    printf '%s' "$text" | tr -cd 'A-Za-z0-9_'
}

# Если служба упёрлась в лимит перезапусков (start-limit-hit), systemctl
# restart просто откажет: "Start request repeated too quickly". Счётчик надо
# сбросить, иначе починка ключа выглядит как ещё одна неудача.
reset_failed() { systemctl reset-failed fivem 2>/dev/null || true; }

if [[ "$MODE" == "key" ]]; then
    # Этот режим стоит раньше общей проверки на рута, так что проверяем сами.
    [[ $EUID -eq 0 ]] || die 'запускай от рута: sudo bash deploy.sh --key'
    [[ -f "$CFG" ]] || die "$CFG не найден - сначала прогони setup.sh"

    step 'Лицензионный ключ'
    printf '    Возьми новый на https://portal.cfx.re (тип: Development).\n'
    printf '    Ключ не будет виден при вводе - это нормально.\n'
    printf '    Ключ: '
    read -rs raw
    printf '\n'

    key="$(clean_key "$raw")"
    junk=$(( ${#raw} - ${#key} ))
    if [[ $junk -gt 0 ]]; then
        warn "выкинул мусорных символов: $junk (стрелки, пробелы, перевод строки)"
    fi

    if [[ ${#key} -lt 20 ]]; then
        die "ключ подозрительно короткий (${#key} символов) - скопируй его целиком и повтори"
    fi
    if [[ "$key" != cfxk_* ]]; then
        warn 'ключ не начинается с cfxk_ - если сервер его не примет, скопируй заново с portal.cfx.re'
    fi
    ok "длина ключа: ${#key} символов, посторонних символов не осталось"

    # Пишем через awk, а не sed: ключ идёт в шаблон замены, и оказавшийся в
    # нём слэш или амперсанд sed истолковал бы по-своему.
    awk -v key="$key" '
        /^[[:space:]]*sv_licenseKey/ { print "sv_licenseKey \"" key "\""; done = 1; next }
        { print }
        END { if (!done) print "sv_licenseKey \"" key "\"" }
    ' "$CFG" > "$CFG.new" && mv "$CFG.new" "$CFG"
    chown "$SERVICE_USER":"$SERVICE_USER" "$CFG" 2>/dev/null || true
    ok 'ключ записан в server.cfg'

    step 'Перезапускаю'
    # screen дописывает в лог, а не перезаписывает его, поэтому старая ошибка
    # про ключ никуда не делась. Запоминаем размер файла и смотрим только то,
    # что сервер напишет после этой секунды.
    mark=0
    [[ -f "$LOG" ]] && mark="$(wc -c < "$LOG")"
    reset_failed
    systemctl restart fivem

    printf '    жду сервер'
    verdict=wait
    for _ in $(seq 1 30); do
        sleep 2
        printf '.'
        fresh="$(tail -c "+$((mark + 1))" "$LOG" 2>/dev/null || true)"
        if printf '%s' "$fresh" | grep -qi 'license key' \
           && printf '%s' "$fresh" | grep -qiE 'error|CURL error'; then
            verdict=bad
            break
        fi
        # Ресурсы грузятся только после того, как ключ приняли: одна такая
        # строчка - доказательство надёжнее любого "Authenticating...".
        if printf '%s' "$fresh" | grep -q 'Started resource'; then
            verdict=good
            break
        fi
    done
    printf '\n'

    case "$verdict" in
        good)
            ok 'ключ принят, ресурсы грузятся'
            printf '\n    Проверка целиком:  bash deploy.sh --check\n\n'
            ;;
        bad)
            bad 'ключ снова не принят:'
            printf '%s' "$fresh" | grep -i 'license key' | tail -n 3 | sed 's/^/        /'
            printf '\n    Заведи новый ключ на https://portal.cfx.re и повтори: bash deploy.sh --key\n\n'
            exit 1
            ;;
        *)
            warn 'за минуту сервер не дошёл до ресурсов - смотри: bash deploy.sh --check'
            printf '\n'
            ;;
    esac
    exit 0
fi

[[ $EUID -eq 0 ]] || die "запускай от рута: sudo bash deploy.sh"
[[ -d "$DATA_DIR" ]] || die "$DATA_DIR не существует - сервер ещё не установлен, гоняй setup.sh"

fetch() {
    curl -fL --progress-bar --connect-timeout 20 \
        --retry 6 --retry-delay 3 --retry-all-errors "$1" -o "$2"
}

fetch_json() {
    curl -fsSL --connect-timeout 15 --max-time 60 \
        --retry 4 --retry-delay 2 --retry-all-errors \
        -H 'User-Agent: fivem-deploy' "$1"
}

fixing=0
missing=0

# Каждая проверка зовёт это. В режиме --check только докладывает.
# repair <название> <есть-ли> <команда-починки>
need() {
    local label="$1"
    shift
    if "$@"; then
        ok "$label"
        return 1
    fi
    missing=$((missing + 1))
    if [[ "$MODE" == "check" ]]; then
        bad "$label — НЕТ"
        note_problem
        return 1
    fi
    warn "$label — нет, ставлю"
    fixing=1
    return 0
}

# Распаковать архив и положить ресурс под нужным именем.
install_resource() {
    local url="$1" name="$2"
    local work="$TMP/res"
    rm -rf "$work" && mkdir -p "$work"

    fetch "$url" "$work/pack.zip" || return 1
    unzip -qo "$work/pack.zip" -d "$work/out" || return 1

    local src
    src="$(dirname "$(find "$work/out" -type f -name fxmanifest.lua | head -n 1)")"
    [[ -n "$src" && -d "$src" ]] || return 1

    rm -rf "${RES_DIR:?}/$name"
    mv "$src" "$RES_DIR/$name"
    return 0
}

# --- аудит: что стоит, чего не хватает --------------------------------------

mkdir -p "$TMP"

step 'Системные пакеты'
lack=""
for pkg in "${PACKAGES[@]}"; do
    dpkg -s "$pkg" >/dev/null 2>&1 || lack+="$pkg "
done
if [[ -z "$lack" ]]; then
    ok 'все на месте'
elif [[ "$MODE" == "check" ]]; then
    bad "не хватает: $lack"
    note_problem
else
    warn "ставлю: $lack"
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    # shellcheck disable=SC2086
    apt-get install -y -qq $lack >/dev/null && ok "поставлено: $lack" \
        || bad "не поставилось: $lack"
fi

step 'База данных'
has_db_server() { command -v mariadbd >/dev/null 2>&1 || command -v mysqld >/dev/null 2>&1; }
if need 'MariaDB' has_db_server; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get install -y -qq mariadb-server >/dev/null && ok 'MariaDB поставлена' \
        || bad 'MariaDB не поставилась'
fi

if command -v mysql >/dev/null 2>&1; then
    systemctl is-active --quiet mariadb 2>/dev/null || systemctl start mariadb 2>/dev/null || true

    if mysql -u root -e "use $DB_NAME" 2>/dev/null; then
        ok "база $DB_NAME есть"
    elif [[ "$MODE" == "check" ]]; then
        bad "базы $DB_NAME нет"
        note_problem
    else
        warn "создаю базу $DB_NAME"
        mysql -u root -e "CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4" 2>/dev/null \
            && ok 'база создана' || bad 'создать базу не вышло'
    fi
fi

step 'Ядро сервера'
if need 'FXServer' test -f "$SERVER_DIR/run.sh"; then
    mkdir -p "$SERVER_DIR"
    artifact="$(fetch_json "$VERSIONS_API" 2>/dev/null \
        | jq -r '.recommended_download // .latest_download // empty' || true)"
    if [[ -n "$artifact" ]] && fetch "$artifact" "$TMP/fx.tar.xz"; then
        tar -xJf "$TMP/fx.tar.xz" -C "$SERVER_DIR" && chmod +x "$SERVER_DIR/run.sh" \
            && ok 'FXServer распакован' || bad 'FXServer не распаковался'
    else
        bad 'FXServer не скачался'
    fi
fi

# cfx-server-data: без него не стартуют spawnmanager и mapmanager, и игрок
# просто висит в чёрном экране.
if need 'базовые ресурсы (cfx-server-data)' test -d "$RES_DIR/[system]"; then
    if fetch "$SERVER_DATA_ZIP" "$TMP/sd.zip"; then
        rm -rf "$TMP/sd" && mkdir -p "$TMP/sd"
        unzip -qo "$TMP/sd.zip" -d "$TMP/sd"
        inner="$(find "$TMP/sd" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
        cp -rn "$inner"/. "$DATA_DIR"/ 2>/dev/null || true
        ok 'базовые ресурсы на месте'
    else
        bad 'cfx-server-data не скачался'
    fi
fi

# chat живёт в системных ресурсах артефакта и иногда не подхватывается сам.
if [[ ! -d "$RES_DIR/chat" ]]; then
    chat_src="$(find "$SERVER_DIR" -type d -path '*system_resources/chat' 2>/dev/null | head -n 1)"
    if [[ -n "$chat_src" && "$MODE" != "check" ]]; then
        cp -r "$chat_src" "$RES_DIR/chat" && ok 'chat скопирован из артефакта'
    fi
fi

step 'Внешние ресурсы'
if need 'oxmysql' test -f "$RES_DIR/oxmysql/fxmanifest.lua"; then
    url="$(fetch_json "$OXMYSQL_API" | jq -r '.assets[]|select(.name|endswith(".zip")).browser_download_url' | head -n 1 || true)"
    if [[ -n "$url" ]] && install_resource "$url" oxmysql; then
        ok 'oxmysql поставлен'
    else
        bad 'oxmysql не поставился — без него база не работает'
    fi
fi

if need 'pma-voice' test -f "$RES_DIR/pma-voice/fxmanifest.lua"; then
    install_resource "$PMA_VOICE_ZIP" pma-voice && ok 'pma-voice поставлен' \
        || bad 'pma-voice не поставился'
fi

if need 'vMenu' test -f "$RES_DIR/vMenu/fxmanifest.lua"; then
    url="$(fetch_json "$VMENU_API" | jq -r '.assets[]|select(.name|endswith(".zip")).browser_download_url' | head -n 1 || true)"
    if [[ -n "$url" ]] && install_resource "$url" vMenu; then
        ok 'vMenu поставлен'
    else
        bad 'vMenu не поставился'
    fi
fi

step 'Машины'
car_count=0
if [[ -d "$CARS_DIR" ]]; then
    car_count="$(find "$CARS_DIR" -mindepth 2 -maxdepth 2 \
        \( -name fxmanifest.lua -o -name __resource.lua \) 2>/dev/null | wc -l)"
fi

if [[ "$car_count" -gt 0 ]]; then
    ok "машин установлено: $car_count"
elif [[ "$MODE" == "check" ]]; then
    bad 'машин нет вообще'
    note_problem
else
    warn 'машин нет, качаю бесплатный пак'
    mkdir -p "$CARS_DIR"
    if fetch "$CAR_PACK_ZIP" "$TMP/cars.zip"; then
        rm -rf "$TMP/cars" && mkdir -p "$TMP/cars"
        unzip -qo "$TMP/cars.zip" -d "$TMP/cars"
        inner="$(find "$TMP/cars" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
        cp -rn "$inner"/. "$CARS_DIR"/ 2>/dev/null || true
        ok 'пак машин скачан'
    else
        bad 'пак машин не скачался'
    fi
fi

# Брендовые ставит setup.sh: у него для этого точечный клон по папкам.
branded="$(find "$CARS_DIR" -maxdepth 1 -type d \( -name 'rc_*' -o -name 'pc_*' \) 2>/dev/null | wc -l || true)"
if [[ "$branded" -ge 18 ]]; then
    ok "брендовых и полицейских машин: $branded"
elif [[ "$MODE" == "check" ]]; then
    bad "брендовых и полицейских машин: $branded из 18"
    note_problem
else
    warn "брендовых и полицейских $branded из 18, доставляю"
    if fetch "${SETUP_URL}?v=$(date +%s)" "$TMP/setup.sh"; then
        ROOT="$ROOT" SERVICE_USER="$SERVICE_USER" bash "$TMP/setup.sh" --real-cars 2>&1 \
            | sed 's/^/        /'
    else
        bad 'setup.sh не скачался, брендовые не доставлены'
    fi
fi

step 'systemd'
if need 'юнит fivem.service' test -f /etc/systemd/system/fivem.service; then
    # Юнит пишет setup.sh вместе с путями и юзером. Восстанавливать его здесь
    # по кусочкам - верный способ получить второй, чуть-чуть другой сервер.
    bad 'юнита нет. Это полная установка:'
    printf '        cd /opt/fivem && curl -fL "%s?v=%s" -o setup.sh && bash setup.sh\n' \
        "$SETUP_URL" "$(date +%s)"
elif grep -q '^Restart=on-failure' /etc/systemd/system/fivem.service 2>/dev/null; then
    # on-failure означает: сервер, вышедший с кодом 0 (отказ лицензии, EOF на
    # stdin), лежит и никто его не поднимает. Правим на месте - это одна
    # строчка, полная переустановка ради неё не нужна.
    if [[ "$MODE" == "check" ]]; then
        warn 'юнит перезапускает сервер только при ошибке - deploy.sh без --check это починит'
    else
        sed -i 's/^Restart=on-failure/Restart=always/' /etc/systemd/system/fivem.service
        grep -q '^StartLimitBurst=' /etc/systemd/system/fivem.service \
            || sed -i '/^Wants=network-online.target/a StartLimitIntervalSec=600\nStartLimitBurst=5' \
                /etc/systemd/system/fivem.service
        systemctl daemon-reload
        ok 'юнит: Restart=always (раньше сервер не поднимался после чистого выхода)'
    fi
fi

if [[ "$fixing" == "1" ]]; then
    chown -R "$SERVICE_USER":"$SERVICE_USER" "$ROOT" 2>/dev/null || true
fi

if [[ $missing -eq 0 ]]; then
    ok 'ничего не пропало'
fi

# --- обновление ------------------------------------------------------------

if [[ "$MODE" != "check" ]]; then
    step 'Качаю репозиторий'
    rm -rf "$TMP" && mkdir -p "$TMP"
    # ?v= сбивает кеш CDN гитхаба, он умеет отдавать вчерашний файл.
    if ! curl -fL --progress-bar --connect-timeout 20 \
            --retry 6 --retry-delay 3 --retry-all-errors \
            "${REPO_ZIP}?v=$(date +%s)" -o "$TMP/repo.zip"; then
        die 'не скачалось - проверь интернет на сервере и повтори'
    fi
    unzip -qo "$TMP/repo.zip" -d "$TMP/repo" || die 'архив битый, повтори'
    ok 'скачано'

    step 'Обновляю ресурсы'
    for resource in "${RESOURCES[@]}"; do
        src="$(find "$TMP/repo" -type d -name "$resource" | head -n 1)"
        if [[ -z "$src" ]]; then
            warn "$resource нет в архиве, пропускаю"
            continue
        fi

        # Данные игроков живут внутри папки ресурса. Забираем их до сноса.
        keep="$TMP/keep/$resource"
        rm -rf "$keep" && mkdir -p "$keep"
        saved=0
        if [[ -d "$RES_DIR/$resource" ]]; then
            while IFS= read -r file; do
                cp "$file" "$keep/" && saved=$((saved + 1))
            done < <(find "$RES_DIR/$resource" -maxdepth 1 -type f -name '*.json')
        fi

        rm -rf "${RES_DIR:?}/$resource"
        mv "$src" "$RES_DIR/$resource"

        # -n: если репозиторий привёз свой json, побеждает он.
        cp -n "$keep"/*.json "$RES_DIR/$resource/" 2>/dev/null || true

        if [[ $saved -gt 0 ]]; then
            ok "$resource (данных сохранено: $saved)"
        else
            ok "$resource"
        fi
    done

    # Все миграции по порядку имён: 001 создаёт, 002+ дополняют. Применять
    # только первую - значит не досчитаться колонок, которые добавили позже.
    sql_dir="$(dirname "$(find "$TMP/repo" -type f -name '001_schema.sql' | head -n 1)")"
    if [[ -n "$sql_dir" && -d "$sql_dir" ]] && command -v mysql >/dev/null 2>&1; then
        applied=0
        while IFS= read -r migration; do
            mysql -u root "$DB_NAME" < "$migration" 2>/dev/null && applied=$((applied + 1))
        done < <(find "$sql_dir" -maxdepth 1 -name '*.sql' | sort)
        ok "миграций применено: $applied"
    fi

    step 'Проверяю server.cfg'

    # Без OneSync серверные GetPlayerPed/GetEntityCoords возвращают ноль,
    # и каждая проверка расстояния в ls_police падает в "слишком далеко":
    # наручники не надеваются ни на кого. Он же нужен NPC-гангстерам.
    if ! grep -qE '^[[:space:]]*set[[:space:]]+onesync[[:space:]]+on' "$CFG"; then
        printf '\n## OneSync - без него полиция не может проверить расстояние\nset onesync on\nset onesync_population true\n' >> "$CFG"
        ok 'включён OneSync'
    else
        ok 'OneSync уже включён'
    fi

    # Наши ресурсы плюс инфраструктура. Инфраструктуру дописываем только
    # если она реально лежит на диске: ensure на отсутствующий ресурс ничего
    # не ломает, но засоряет лог "Couldn't find resource" на каждом старте.
    missing=""
    for resource in "${RESOURCES[@]}"; do
        grep -qE "^[[:space:]]*ensure[[:space:]]+${resource}[[:space:]]*$" "$CFG" \
            || missing+="ensure $resource"$'\n'
    done
    for resource in oxmysql pma-voice vMenu chat mapmanager spawnmanager basic-gamemode; do
        [[ -d "$RES_DIR/$resource" ]] || continue
        grep -qE "^[[:space:]]*ensure[[:space:]]+${resource}[[:space:]]*$" "$CFG" \
            || missing+="ensure $resource"$'\n'
    done

    # Без строки подключения oxmysql молча не находит базу, и всё, что
    # хранится в SQL, тихо не работает.
    if ! grep -q 'mysql_connection_string' "$CFG"; then
        bad 'в server.cfg нет mysql_connection_string — ресурсы с базой работать не будут'
        printf '        добавь строкой:  set mysql_connection_string "mysql://fivem:ПАРОЛЬ@localhost/%s?charset=utf8mb4"\n' "$DB_NAME"
        note_problem
    fi
    if [[ -n "$missing" ]]; then
        printf '\n## --- дописано deploy.sh --------------------------------------\n%s' \
            "$missing" >> "$CFG"
        ok "дописано строк ensure: $(printf '%s' "$missing" | grep -c .)"
    else
        ok 'все ресурсы уже включены'
    fi

    # Без логфайла сервер пишет в pty внутри screen, и консоль просто пропадает:
    # journalctl видит только строки самого systemd.
    UNIT=/etc/systemd/system/fivem.service
    if [[ -f "$UNIT" ]] && ! grep -q 'Logfile' "$UNIT"; then
        sed -i 's#ExecStart=/usr/bin/screen -DmS#ExecStart=/usr/bin/screen -L -Logfile '"$LOG"' -DmS#' "$UNIT"
        systemctl daemon-reload
        ok "сервер теперь пишет лог в $LOG"
    fi

    chown -R "$SERVICE_USER":"$SERVICE_USER" "$DATA_DIR" 2>/dev/null || true
    rm -rf "$TMP"
fi

# --- перезапуск ------------------------------------------------------------

if [[ "$MODE" == "update" ]]; then
    step 'Перезапускаю'
    : > "$LOG" 2>/dev/null || true
    chown "$SERVICE_USER":"$SERVICE_USER" "$LOG" 2>/dev/null || true
    reset_failed
    systemctl restart fivem

    # Ждать надо не первый стартовавший ресурс, а последний: они поднимаются
    # по очереди, и проверка через две секунды после первого объявляла
    # мёртвым всё, что просто ещё не дошло до своей строчки.
    printf '    жду старта'
    for _ in $(seq 1 45); do
        sleep 2
        printf '.'
        up=0
        for resource in "${RESOURCES[@]}"; do
            grep -q "Started resource $resource" "$LOG" 2>/dev/null && up=$((up + 1))
        done
        [[ $up -eq ${#RESOURCES[@]} ]] && break
    done
    printf '\n'
fi

# --- диагноз ---------------------------------------------------------------

step 'Что с сервером'

if systemctl is-active --quiet fivem 2>/dev/null; then
    ok "служба запущена с $(systemctl show -p ActiveEnterTimestamp --value fivem 2>/dev/null)"
else
    bad "служба лежит (состояние: $(systemctl is-active fivem 2>/dev/null || echo недоступна))"
    note_problem
    if systemctl show -p Result --value fivem 2>/dev/null | grep -q 'start-limit-hit'; then
        warn 'она упёрлась в лимит перезапусков - после починки: systemctl reset-failed fivem'
    fi
    printf '\n'
    systemctl status fivem --no-pager -n 15 2>&1 | sed 's/^/        /'
fi

if ss -lntu 2>/dev/null | grep -q ':30120'; then
    ok 'порт 30120 слушается'
else
    bad 'порт 30120 не слушается - зайти в игру нельзя'
    note_problem
fi

# Известные причины, по которым FXServer умирает, не дойдя до ресурсов.
# Слева - что искать в логе, справа - что это значит человеку.
diagnose_log() {
    local found=0 pattern meaning
    while IFS='|' read -r pattern meaning; do
        [[ -z "$pattern" ]] && continue
        if grep -qiE "$pattern" "$LOG" 2>/dev/null; then
            bad "причина: $meaning"
            found=1
        fi
    done <<'REASONS'
CURL error code 3|в лицензионном ключе посторонний символ (стрелки, пробел). Перепиши: bash deploy.sh --key
error.*checking server license key|сервер не смог проверить лицензионный ключ. Перепиши его: bash deploy.sh --key
invalid license key|лицензионный ключ не принят. Возьми новый на portal.cfx.re и впиши в server.cfg (строка sv_licenseKey)
license key.*(not valid|expired|revoked)|лицензионный ключ недействителен или отозван - заведи новый на portal.cfx.re
could not fetch.*license|сервер не смог проверить ключ - нет связи с Cfx или ключ сломан
Ctrl-C pressed|сервер прочитал конец ввода со stdin и вышел. Значит screen не дал ему терминал
(address|adress) already in use|порт 30120 уже занят. Проверь: ss -lntup | grep 30120
could not bind|сервер не смог занять порт 30120
error parsing.*server\.cfg|в server.cfg синтаксическая ошибка
couldn.t find resource|в server.cfg включён ресурс, которого нет на диске
no such file or directory.*run\.sh|FXServer распакован не до конца - перекачай ядро
REASONS
    return $((1 - found))
}

if [[ ! -s "$LOG" ]]; then
    warn "лог пуст ($LOG) - если сервер только что перезапущен, подожди минуту"
    warn 'запусти руками, он напечатает причину:'
    printf '        cd %s && timeout 40 sudo -u %s %s/run.sh +exec server.cfg 2>&1 | tail -n 30\n' \
        "$DATA_DIR" "$SERVICE_USER" "$SERVER_DIR"
else
    # Какие ресурсы реально поднялись.
    down=""
    for resource in "${RESOURCES[@]}"; do
        grep -q "Started resource $resource" "$LOG" 2>/dev/null || down+="$resource "
    done
    if [[ -n "$down" ]]; then
        bad "не стартовали: $down"
        note_problem
        # Если не поднялся вообще никто, дело не в ресурсах: сервер умер
        # раньше, чем дошёл до них. Хвост лога тут полезнее списка имён.
        if [[ $(printf '%s' "$down" | wc -w) -eq ${#RESOURCES[@]} ]]; then
            bad 'не стартовал ни один - сервер умер до загрузки ресурсов'
            diagnose_log || warn 'знакомых причин в логе нет, смотри хвост ниже'
            printf '\n        --- последние 25 строк %s ---\n' "$LOG"
            tail -n 25 "$LOG" 2>/dev/null | sed 's/^/        /'
            printf '\n'
        else
            printf '        причина:  grep -iA3 %s %s\n' "'${down%% *}'" "$LOG"
        fi
    else
        ok 'все ресурсы стартовали'
    fi

    # Ошибки скриптов. grep -c возвращает 1 при нуле совпадений, поэтому || true.
    errors="$(grep -iE 'SCRIPT ERROR|Failed to load script|error parsing|Couldn.t find resource' \
        "$LOG" 2>/dev/null | sort -u | head -n 25 || true)"
    if [[ -n "$errors" ]]; then
        bad 'ошибки в логе:'
        printf '%s\n' "$errors" | sed 's/^/        /'
        note_problem
    else
        ok 'ошибок скриптов в логе нет'
    fi
fi

# Ключ - самая частая причина "сервер поднялся, но никто не заходит".
if grep -q 'PASTE_YOUR_KEY_HERE' "$CFG" 2>/dev/null; then
    bad "в server.cfg не вписан лицензионный ключ - возьми на portal.cfx.re"
    note_problem
else
    cfg_key="$(grep -oP 'sv_licenseKey\s+"\K[^"]*' "$CFG" 2>/dev/null | head -n 1 || true)"
    if [[ -z "$cfg_key" ]]; then
        bad 'строки sv_licenseKey в server.cfg нет вообще'
        note_problem
    elif [[ "$(clean_key "$cfg_key")" != "$cfg_key" ]]; then
        # Сам ключ не печатаем: он секретный, а длины и факта поломки хватает.
        bad 'в ключе посторонние символы - сервер не сможет его проверить'
        printf '        перепиши:  bash deploy.sh --key\n'
        note_problem
    elif [[ ${#cfg_key} -lt 20 ]]; then
        bad "ключ обрезан (${#cfg_key} символов) - перепиши: bash deploy.sh --key"
        note_problem
    fi
fi

printf '\n'
if [[ $problems -eq 0 ]]; then
    ip_addr="$(curl -fsSL --max-time 10 https://api.ipify.org 2>/dev/null || echo '<ip>')"
    printf '\033[32m=== Всё чисто. В FiveM нажми F8 и введи:  connect %s\033[0m\n\n' "$ip_addr"
else
    printf '\033[31m=== Проблем: %d. Скинь этот вывод целиком.\033[0m\n' "$problems"
    printf '    Последние 40 строк лога:  tail -n 40 %s\n\n' "$LOG"
fi
