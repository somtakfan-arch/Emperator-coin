#!/usr/bin/env bash
#
# Снять слепок сервера или развернуть его обратно.
#
#     bash backup.sh                    # сделать архив
#     bash backup.sh restore <архив>    # развернуть на новом сервере
#
# В архив идёт только то, что нельзя скачать заново: данные игроков, база,
# лицензионный ключ и парковки. Сам FXServer, машины и ресурсы ставятся
# скриптом за пару минут, тащить их через интернет дважды незачем.

# pipefail не ставим: тут есть `... | head`, и SIGPIPE убил бы скрипт молча.
set -eu

ROOT="${ROOT:-/opt/fivem}"
DATA_DIR="$ROOT/server-data"
RES_DIR="$DATA_DIR/resources"
DB_NAME="${DB_NAME:-fivem}"
OUT_DIR="${OUT_DIR:-$ROOT}"

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m    OK  %s\033[0m\n' "$1"; }
warn() { printf '\033[33m    !   %s\033[0m\n' "$1"; }
die()  { printf '\033[31m    ОШИБКА: %s\033[0m\n' "$1" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die 'запускай от рута'

# --- восстановление ----------------------------------------------------------

if [[ "${1:-}" == "restore" ]]; then
    archive="${2:-}"
    [[ -n "$archive" && -f "$archive" ]] || die 'укажи файл: bash backup.sh restore /root/fivem-backup-....tar.gz'
    [[ -d "$DATA_DIR" ]] || die "$DATA_DIR не существует — сначала прогони setup.sh"

    step 'Разворачиваю слепок'
    work="$ROOT/tmp/restore"
    rm -rf "$work" && mkdir -p "$work"
    tar -xzf "$archive" -C "$work" || die 'архив битый'

    inner="$work"
    [[ -d "$work/backup" ]] && inner="$work/backup"

    # Данные игроков ложатся поверх: ресурсы уже установлены, в них только
    # подменяются json-файлы.
    restored=0
    while IFS= read -r file; do
        rel="${file#"$inner/resources/"}"
        target="$RES_DIR/$rel"
        if [[ -d "$(dirname "$target")" ]]; then
            cp "$file" "$target" && restored=$((restored + 1))
        else
            warn "ресурса для $rel нет, пропускаю"
        fi
    done < <(find "$inner/resources" -type f -name '*.json' 2>/dev/null)
    ok "файлов данных восстановлено: $restored"

    if [[ -f "$inner/server.cfg" ]]; then
        # Ключ и строка подключения к базе - самое ценное в конфиге.
        key="$(grep -oP 'sv_licenseKey\s+"\K[^"]+' "$inner/server.cfg" || true)"
        if [[ -n "$key" && "$key" != 'PASTE_YOUR_KEY_HERE' ]]; then
            sed -i "s#^sv_licenseKey .*#sv_licenseKey \"$key\"#" "$DATA_DIR/server.cfg"
            ok 'лицензионный ключ перенесён'
        fi
    fi

    if [[ -f "$inner/database.sql" ]] && command -v mysql >/dev/null 2>&1; then
        if mysql -u root "$DB_NAME" < "$inner/database.sql" 2>/dev/null; then
            ok 'база восстановлена'
        else
            warn "базу восстановить не вышло — вручную: mysql -u root $DB_NAME < $inner/database.sql"
        fi
    fi

    chown -R fivem:fivem "$DATA_DIR" 2>/dev/null || true
    rm -rf "$work"

    printf '\n\033[32m=== Готово. systemctl restart fivem\033[0m\n\n'
    exit 0
fi

# --- снятие слепка -----------------------------------------------------------

[[ -d "$DATA_DIR" ]] || die "$DATA_DIR не существует"

stamp="$(date +%Y%m%d-%H%M)"
work="$ROOT/tmp/backup-$stamp"
rm -rf "$work" && mkdir -p "$work/backup/resources"

step 'Собираю данные игроков'
saved=0
while IFS= read -r file; do
    rel="${file#"$RES_DIR/"}"
    mkdir -p "$work/backup/resources/$(dirname "$rel")"
    cp "$file" "$work/backup/resources/$rel" && saved=$((saved + 1))
done < <(find "$RES_DIR" -maxdepth 2 -type f -name '*.json' 2>/dev/null)
ok "файлов: $saved"

step 'Конфиг'
if [[ -f "$DATA_DIR/server.cfg" ]]; then
    cp "$DATA_DIR/server.cfg" "$work/backup/server.cfg"
    ok 'server.cfg (в нём лицензионный ключ)'
fi

step 'База данных'
if command -v mysqldump >/dev/null 2>&1; then
    if mysqldump -u root --single-transaction "$DB_NAME" > "$work/backup/database.sql" 2>/dev/null; then
        ok "$DB_NAME ($(du -h "$work/backup/database.sql" | cut -f1))"
    else
        warn 'дамп не снялся — полицейские ранги и смены не переедут'
        rm -f "$work/backup/database.sql"
    fi
else
    warn 'mysqldump не найден'
fi

step 'Упаковываю'
archive="$OUT_DIR/fivem-backup-$stamp.tar.gz"
tar -czf "$archive" -C "$work" backup
rm -rf "$work"

printf '\n\033[32m=== Готово: %s (%s)\033[0m\n' "$archive" "$(du -h "$archive" | cut -f1)"
cat <<TEXT

 Забрать на свой ПК (выполнять В POWERSHELL, не тут):
     scp root@$(hostname -I | awk '{print $1}'):$archive .

 На новом сервере:
     1. bash setup.sh          - поставить всё с нуля
     2. bash backup.sh restore $(basename "$archive")
     3. systemctl restart fivem

TEXT
