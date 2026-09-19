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

RESOURCES=(phone_garage ls_character ls_inventory ls_shops ls_medical ls_tuning ls_rp ls_police)

MODE=update
case "${1:-}" in
    --check)      MODE=check ;;
    --no-restart) MODE=norestart ;;
    '')           ;;
    *)            printf 'usage: bash deploy.sh [--check|--no-restart]\n' >&2; exit 2 ;;
esac

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m    OK  %s\033[0m\n' "$1"; }
warn() { printf '\033[33m    !   %s\033[0m\n' "$1"; }
bad()  { printf '\033[31m    ✗   %s\033[0m\n' "$1"; }
die()  { printf '\033[31m    ОШИБКА: %s\033[0m\n' "$1" >&2; exit 1; }

problems=0
note_problem() { problems=$((problems + 1)); }

[[ $EUID -eq 0 ]] || die "запускай от рута: sudo bash deploy.sh"
[[ -d "$DATA_DIR" ]] || die "$DATA_DIR не существует - сервер ещё не установлен, гоняй setup.sh"

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

    # Схема БД - на случай, если появились новые таблицы.
    schema="$(find "$TMP/repo" -type f -name '001_schema.sql' | head -n 1)"
    if [[ -n "$schema" ]] && command -v mysql >/dev/null 2>&1; then
        if mysql -u root fivem < "$schema" 2>/dev/null; then
            ok 'схема БД применена'
        else
            warn 'схему применить не вышло (не страшно, если таблицы уже есть)'
        fi
    fi

    step 'Проверяю server.cfg'
    missing=""
    for resource in "${RESOURCES[@]}"; do
        grep -qE "^[[:space:]]*ensure[[:space:]]+${resource}[[:space:]]*$" "$CFG" \
            || missing+="ensure $resource"$'\n'
    done
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
    systemctl restart fivem

    printf '    жду старта'
    for _ in $(seq 1 40); do
        sleep 2
        printf '.'
        grep -qi 'server started\|Started resource' "$LOG" 2>/dev/null && break
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
    printf '\n'
    systemctl status fivem --no-pager -n 15 2>&1 | sed 's/^/        /'
fi

if ss -lntu 2>/dev/null | grep -q ':30120'; then
    ok 'порт 30120 слушается'
else
    bad 'порт 30120 не слушается - зайти в игру нельзя'
    note_problem
fi

if [[ ! -s "$LOG" ]]; then
    warn "лог пуст ($LOG) - если сервер только что перезапущен, подожди минуту"
else
    # Какие ресурсы реально поднялись.
    down=""
    for resource in "${RESOURCES[@]}"; do
        grep -q "Started resource $resource" "$LOG" 2>/dev/null || down+="$resource "
    done
    if [[ -n "$down" ]]; then
        bad "не стартовали: $down"
        note_problem
    else
        ok 'все восемь ресурсов стартовали'
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
fi

printf '\n'
if [[ $problems -eq 0 ]]; then
    ip_addr="$(curl -fsSL --max-time 10 https://api.ipify.org 2>/dev/null || echo '<ip>')"
    printf '\033[32m=== Всё чисто. В FiveM нажми F8 и введи:  connect %s\033[0m\n\n' "$ip_addr"
else
    printf '\033[31m=== Проблем: %d. Скинь этот вывод целиком.\033[0m\n' "$problems"
    printf '    Последние 40 строк лога:  tail -n 40 %s\n\n' "$LOG"
fi
