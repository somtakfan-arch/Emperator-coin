#!/usr/bin/env bash
#
# FiveM sandbox server - setup in one run, for a Linux VPS.
# Downloads FXServer, cfx-server-data and vMenu, writes a working server.cfg,
# wires up any add-on car packs and installs a systemd unit.
#
# Usage (as root, on a fresh Debian 11+ / Ubuntu 22.04+ box):
#     bash setup.sh
#     ROOT=/srv/fivem HOSTNAME_="Emperator crew" MAXCLIENTS=16 bash setup.sh
#     SKIP_CARS=1 bash setup.sh        # vanilla only
#     bash setup.sh --sync-packs        # re-scan car packs after adding new ones
#     bash setup.sh --real-cars         # (re)install the branded cars only

# pipefail is deliberately NOT set. This script is full of `find ... | head -n 1`
# pipelines; head closes the pipe after the first line, the producer takes a
# SIGPIPE, and with pipefail + set -e the whole script would die silently.
set -eu

ROOT="${ROOT:-/opt/fivem}"
LICENSE_KEY="${LICENSE_KEY:-}"
HOSTNAME_="${HOSTNAME_:-Emperator crew}"
MAXCLIENTS="${MAXCLIENTS:-16}"
SKIP_CARS="${SKIP_CARS:-0}"
SKIP_GARAGE="${SKIP_GARAGE:-0}"
SKIP_WEAPONS="${SKIP_WEAPONS:-0}"
SKIP_REAL_CARS="${SKIP_REAL_CARS:-0}"
SKIP_DB="${SKIP_DB:-0}"
DB_NAME="${DB_NAME:-fivem}"
DB_USER="${DB_USER:-fivem}"
DB_PASS="${DB_PASS:-}"
REPO_BRANCH="${REPO_BRANCH:-claude/gta5-rp-server-setup-fvdafy}"
SERVICE_USER="${SERVICE_USER:-fivem}"

VERSIONS_API='https://changelogs-live.fivem.net/api/changelog/versions/linux/server'
FALLBACK_ARTIFACT='https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/16742-c3ff6a20e0e2b24d10e0a05ee3e6dbc1cbf2e5a1/fx.tar.xz'
SERVER_DATA_ZIP='https://github.com/citizenfx/cfx-server-data/archive/refs/heads/master.zip'
VMENU_API='https://api.github.com/repos/TomGrobbe/vMenu/releases/latest'
OXMYSQL_API='https://api.github.com/repos/overextended/oxmysql/releases/latest'
PMA_VOICE_ZIP='https://github.com/AvarianKnight/pma-voice/archive/refs/heads/master.zip'

# Proximity ranges for pma-voice, in metres. The middle one is the default
# speaking distance and is what "15 m" means in practice.
VOICE_WHISPER=3.0
VOICE_NORMAL=15.0
VOICE_SHOUT=30.0
CAR_PACK_ZIP='https://github.com/Rymex47/free-modpack/archive/refs/heads/main.zip'
REPO_ZIP="https://github.com/somtakfan-arch/Emperator-coin/archive/refs/heads/${REPO_BRANCH}.zip"

# Branded real-life cars, hand-picked - a Divo and ten more of the fastest
# things with a real badge on the nose. Each entry is
#     repo | branch | folder inside the repo | resource name
# The source repos are multi-gigabyte whole-server dumps, so they are pulled
# with a blobless partial clone and only these folders are ever checked out;
# that costs a few seconds and ~260 MB rather than the whole repo.
REAL_CARS=(
    'bscal/rd2lrp|master|[Cars]/Bugatti_Divo|rc_bugatti_divo'
    'bscal/rd2lrp|master|[Cars]/Bugatti_Chiron|rc_bugatti_chiron'
    'bscal/rd2lrp|master|[Cars]/Bugatti_Veyron|rc_bugatti_veyron'
    'GamingPanthers/FiveM-Vehicles|main|[cars]/[civ]/[abolf]/jesko|rc_koenigsegg_jesko'
    'GamingPanthers/FiveM-Vehicles|main|[cars]/[civ]/[Dennissaurus]/hurper|rc_lamborghini_performante'
    'GamingPanthers/FiveM-Vehicles|main|[cars]/[civ]/[Huangh]/tecnica|rc_lamborghini_tecnica'
    'GamingPanthers/FiveM-Vehicles|main|[cars]/[civ]/[abolf]/pgt322|rc_porsche_gt3rs'
    'GamingPanthers/FiveM-Vehicles|main|[cars]/[civ]/[abolf]/agt12|rc_aston_gt12'
    'GamingPanthers/FiveM-Vehicles|main|[cars]/[civ]/[yca]/gtr|rc_nissan_gtr'
    'GamingPanthers/FiveM-Vehicles|main|[cars]/[civ]/[azam]/amg21|rc_mercedes_amggt'
    'GamingPanthers/FiveM-Vehicles|main|[cars]/[civ]/[other]/supra19|rc_toyota_supra'

    # Полицейские. Ставятся тем же способом; в автосалон не попадают -
    # каталог телефона это отдельный список.
    'KlovnenDEV/Fivem|main|server-data/resources/[Nethush-standalone]/[Police]/[PVehicles]/nethush-lp770cop|pc_lambo'
    'KlovnenDEV/Fivem|main|server-data/resources/[Nethush-standalone]/[Police]/[PVehicles]/nethush-911turboleo|pc_porsche'
    'KlovnenDEV/Fivem|main|server-data/resources/[Nethush-standalone]/[Police]/[PVehicles]/nethush-hellcat|pc_hellcat'
    'KlovnenDEV/Fivem|main|server-data/resources/[Nethush-standalone]/[Police]/[PVehicles]/nethush-2015polstang|pc_mustang'
    'KlovnenDEV/Fivem|main|server-data/resources/[Nethush-standalone]/[Police]/[PVehicles]/nethush-18charger|pc_charger'
    'KlovnenDEV/Fivem|main|server-data/resources/[Nethush-standalone]/[Police]/[PVehicles]/nethush-explorer|pc_explorer'
    'KlovnenDEV/Fivem|main|server-data/resources/[Nethush-standalone]/[Police]/[PVehicles]/nethush-1200RT|pc_bike'
)

# Free add-on gun packs. Each is tried on main, then master.
WEAPON_PACKS=(
    'Branqueador/GGC-Weapons'
    'YaBoiiNuggets/bl-weapons'
    'NoobySloth/Custom-Weapons'
)

SERVER_DIR="$ROOT/server"
DATA_DIR="$ROOT/server-data"
TMP_DIR="$ROOT/tmp"
RES_DIR="$DATA_DIR/resources"
CARS_DIR="$RES_DIR/[cars]"
WEAPONS_DIR="$RES_DIR/[weapons]"

step() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m    OK  %s\033[0m\n' "$1"; }
warn() { printf '\033[33m    !   %s\033[0m\n' "$1"; }
die()  { printf '\033[31m    ERROR: %s\033[0m\n' "$1" >&2; exit 1; }

# GitHub is reachable from some networks only in fits and starts, so every
# download retries before giving up. Callers decide whether a failure is fatal;
# nothing here may take the whole install down on its own.
fetch() {
    curl -fL --progress-bar \
        --connect-timeout 20 --retry 5 --retry-delay 3 --retry-all-errors \
        "$1" -o "$2"
}

# Same, for the small JSON API calls.
fetch_json() {
    curl -fsSL --connect-timeout 15 --max-time 60 \
        --retry 4 --retry-delay 2 --retry-all-errors \
        -H 'User-Agent: fivem-setup-script' "$1"
}



[[ $EUID -eq 0 ]] || die "run as root (sudo bash setup.sh)"

# Packs ship in every layout imaginable. Flatten them so that every resource
# sits directly in <dir>/<name> - the only depth FiveM scans.
flatten_into() {
    local dir="$1"
    mkdir -p "$dir"

    while IFS= read -r manifest; do
        local res_dir parent target
        res_dir="$(dirname "$manifest")"
        parent="$(dirname "$res_dir")"
        if [[ "$parent" != "$dir" ]]; then
            target="$dir/$(basename "$res_dir")"
            [[ -e "$target" ]] || mv "$res_dir" "$target"
        fi
    done < <(find "$dir" -type f \( -name fxmanifest.lua -o -name __resource.lua \) | sort -r)

    find "$dir" -mindepth 1 -type d -empty -delete 2>/dev/null || true
}

# Every resource sitting directly in <dir>, one per line.
list_resources() {
    find "$1" -mindepth 2 -maxdepth 2 -type f \
        \( -name fxmanifest.lua -o -name __resource.lua \) 2>/dev/null | sort
}

# Add-on cars ship with every manifest dialect there has ever been, and one
# that forgets a .meta file loads as an invisible wreck - or takes the server
# down with it, which is exactly how the gun packs died. So rather than trust
# what shipped, describe the folder from what is actually in it.
rewrite_car_manifest() {
    # `local a=1 b="$a"` does not work: bash creates every name first and only
    # then assigns, so $a is an unset local and set -u kills the script.
    local dir="$1"
    local out="$dir/fxmanifest.lua"
    local rel kind
    local -a metas=()

    while IFS= read -r meta; do
        metas+=("${meta#"$dir"/}")
    done < <(find "$dir" -type f -name '*.meta' | sort)

    [[ ${#metas[@]} -gt 0 ]] || return 1

    {
        echo "fx_version 'cerulean'"
        echo "game 'gta5'"
        echo
        echo 'files {'
        for rel in "${metas[@]}"; do printf "    '%s',\n" "$rel"; done
        echo '}'
        echo
        for rel in "${metas[@]}"; do
            case "$(basename "$rel")" in
                vehicles.meta)       kind='VEHICLE_METADATA_FILE' ;;
                carvariations.meta)  kind='VEHICLE_VARIATION_FILE' ;;
                carcols.meta)        kind='CARCOLS_FILE' ;;
                handling.meta)       kind='HANDLING_FILE' ;;
                vehiclelayouts.meta) kind='VEHICLE_LAYOUTS_FILE' ;;
                dlctext.meta)        kind='DLC_TEXT_FILE' ;;
                contentunlocks.meta) kind='CONTENT_UNLOCKING_META_FILE' ;;
                *)                   continue ;;
            esac
            printf "data_file '%s' '%s'\n" "$kind" "$rel"
        done
        # Some packs ship their dashboard name as a client script. Keep it.
        [[ -f "$dir/vehicle_names.lua" ]] && echo "client_script 'vehicle_names.lua'"
        true
    } > "$out"

    rm -f "$dir/__resource.lua"
}

install_real_cars() {
    mkdir -p "$CARS_DIR" "$TMP_DIR/realcars"

    local entry repo branch path name slug clone dest size added=0
    for entry in "${REAL_CARS[@]}"; do
        repo="${entry%%|*}"
        branch="$(cut -d'|' -f2 <<<"$entry")"
        path="$(cut -d'|' -f3 <<<"$entry")"
        name="${entry##*|}"
        dest="$CARS_DIR/$name"

        if [[ -f "$dest/fxmanifest.lua" ]]; then
            ok "$name (already there)"
            added=$((added + 1))
            continue
        fi

        slug="${repo//\//_}"
        clone="$TMP_DIR/realcars/$slug"
        if [[ ! -d "$clone/.git" ]]; then
            rm -rf "$clone"
            printf '        cloning %s\n' "$repo"
            # --filter=blob:none downloads the tree only; the checkout below
            # then pulls the blobs for one car and nothing else.
            if ! git -c gc.auto=0 clone --quiet --depth 1 --filter=blob:none \
                    --no-checkout --branch "$branch" \
                    "https://github.com/$repo.git" "$clone"; then
                warn "$repo is unreachable, its cars are skipped"
                rm -rf "$clone"
                continue
            fi
        fi

        # gc.auto=0: these clones are throwaway, and a background repack in
        # the middle of the run just burns the box's RAM.
        if ! git -C "$clone" -c gc.auto=0 checkout --quiet HEAD -- "$path"; then
            warn "$path is not in $repo, skipped"
            continue
        fi

        rm -rf "$dest"
        mv "$clone/$path" "$dest"

        if rewrite_car_manifest "$dest"; then
            size="$(du -sh "$dest" | cut -f1)"
            ok "$name ($size)"
            added=$((added + 1))
        else
            warn "$name carries no .meta file, dropped"
            rm -rf "$dest"
        fi
    done

    rm -rf "$TMP_DIR/realcars"
    ok "branded cars installed: $added of ${#REAL_CARS[@]}"
}

sync_cars() {
    flatten_into "$CARS_DIR"

    local count
    count="$(list_resources "$CARS_DIR" | wc -l)"
    ok "car resources found: $count"

    # Spawn names live in the vehicles*.meta files as <modelName>foo</modelName>.
    local models
    models="$(find "$CARS_DIR" -type f -name '*vehicles*.meta' -print0 2>/dev/null \
        | xargs -0 -r grep -hoE '<modelName>[^<]+</modelName>' 2>/dev/null \
        | sed -E 's#</?modelName>##g' \
        | tr '[:upper:]' '[:lower:]' \
        | tr -d '\r' \
        | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' \
        | grep -v '^$' \
        | sort -u || true)"

    local n=0
    [[ -n "$models" ]] && n="$(printf '%s\n' "$models" | wc -l)"
    ok "spawn names found: $n"

    # vMenu only lists add-on vehicles that are named in its addons.json.
    local addons="$RES_DIR/vMenu/config/addons.json"
    if [[ -f "$addons" ]]; then
        {
            echo '{'
            echo '  "vehicles": ['
            printf '%s\n' "$models" | grep -v '^$' | sed 's/^/    "/; s/$/",/' | sed '$ s/,$//'
            echo '  ],'
            echo '  "peds": [],'
            echo '  "weapons": []'
            echo '}'
        } > "$addons"
        ok "vMenu addons.json updated"
    else
        warn "vMenu addons.json not found, skipped"
    fi

    if [[ -n "$models" ]]; then
        printf '%s\n' "$models" > "$ROOT/spawn-names.txt"
        ok "spawn name list: $ROOT/spawn-names.txt"
    fi
}

sync_weapons() {
    flatten_into "$WEAPONS_DIR"

    local count
    count="$(list_resources "$WEAPONS_DIR" | wc -l)"
    ok "weapon resources found: $count"

    # Weapon ids live in weapons.meta as <Name>WEAPON_FOO</Name>. Two packs
    # shipping the same id would fight over it, so collisions are reported.
    local pairs
    pairs="$(find "$WEAPONS_DIR" -type f -name '*weapon*.meta' 2>/dev/null | while read -r meta; do
        # The resource name is the first path segment under [weapons], not the
        # folder the .meta happens to sit in.
        local rel owner
        rel="${meta#"$WEAPONS_DIR"/}"
        owner="${rel%%/*}"
        grep -hoE '<Name>WEAPON_[A-Z0-9_]+</Name>' "$meta" 2>/dev/null \
            | sed -E 's#</?Name>##g' \
            | while read -r name; do printf '%s\t%s\n' "$name" "$owner"; done
    done | sort -u || true)"

    local names
    names="$(printf '%s\n' "$pairs" | cut -f1 | grep -v '^$' | sort -u || true)"

    local dupes
    dupes="$(printf '%s\n' "$pairs" | cut -f1 | grep -v '^$' | sort | uniq -d || true)"
    if [[ -n "$dupes" ]]; then
        warn 'the same weapon id is defined by more than one pack:'
        printf '%s\n' "$dupes" | sed 's/^/        /'
        warn 'delete one of the packs or the server will pick whichever loads last'
    fi

    local n=0
    [[ -n "$names" ]] && n="$(printf '%s\n' "$names" | wc -l)"
    ok "add-on weapons found: $n"

    # ls_inventory reads this and registers each one as a buyable item.
    local out="$RES_DIR/ls_shops/addon_weapons.json"
    if [[ -d "$RES_DIR/ls_shops" ]]; then
        {
            echo '['
            printf '%s\n' "$names" | grep -v '^$' \
                | sed 's/^/  { "name": "/; s/$/" },/' | sed '$ s/,$//'
            echo ']'
        } > "$out"
        ok "add-on weapon catalog: $out"
    else
        warn 'ls_shops is not installed, add-on weapon catalog skipped'
    fi

    if [[ -n "$names" ]]; then
        printf '%s\n' "$names" > "$ROOT/weapon-names.txt"
        ok "weapon name list: $ROOT/weapon-names.txt"
    fi
}

# A full install rewrites server.cfg from scratch. The sync flags only ever
# add cars, so top the existing file up instead - rewriting it would throw
# away the license key that is already in there.
top_up_car_ensures() {
    local cfg="$DATA_DIR/server.cfg" manifest name missing=""
    [[ -f "$cfg" ]] || return 0

    while IFS= read -r manifest; do
        name="$(basename "$(dirname "$manifest")")"
        grep -qE "^[[:space:]]*ensure[[:space:]]+${name}[[:space:]]*$" "$cfg" \
            || missing+="ensure $name"$'\n'
    done < <(list_resources "$CARS_DIR")

    if [[ -n "$missing" ]]; then
        printf '\n## --- cars added later --------------------------------------------\n%s' \
            "$missing" >> "$cfg"
        ok "server.cfg: $(printf '%s' "$missing" | grep -c .) new car(s) enabled"
    else
        ok 'server.cfg already lists every car'
    fi
}

if [[ "${1:-}" == "--real-cars" ]]; then
    command -v git >/dev/null 2>&1 || {
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq && apt-get install -y -qq git >/dev/null
    }
    step 'Branded cars'
    install_real_cars
    step 'Wiring up cars'
    sync_cars
    top_up_car_ensures
    chown -R "$SERVICE_USER":"$SERVICE_USER" "$DATA_DIR" 2>/dev/null || true
    printf '\n\033[32mDone. systemctl restart fivem\033[0m\n\n'
    exit 0
fi

if [[ "${1:-}" == "--sync-cars" || "${1:-}" == "--sync-packs" ]]; then
    step 'Re-scanning car packs'
    sync_cars
    step 'Re-scanning weapon packs'
    sync_weapons
    top_up_car_ensures
    chown -R "$SERVICE_USER":"$SERVICE_USER" "$DATA_DIR" 2>/dev/null || true
    printf '\n\033[32mDone. systemctl restart fivem\033[0m\n\n'
    exit 0
fi

step 'Dependencies'
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl xz-utils unzip jq ca-certificates screen git >/dev/null
ok 'curl, xz-utils, unzip, jq, screen, git'

step "Preparing $ROOT"
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd -r -m -d "$ROOT" -s /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$SERVER_DIR" "$DATA_DIR" "$TMP_DIR"
ok 'folders and service user ready'

if [[ "$SKIP_DB" != "1" ]]; then
    step 'MariaDB'
    if ! command -v mysqld >/dev/null 2>&1 && ! command -v mariadbd >/dev/null 2>&1; then
        apt-get install -y -qq mariadb-server >/dev/null
        ok 'mariadb-server installed'
    else
        ok 'mariadb already present'
    fi

    systemctl enable --now mariadb >/dev/null 2>&1 || systemctl enable --now mysql >/dev/null 2>&1 || true

    if [[ -z "$DB_PASS" ]]; then
        # od reads a fixed number of bytes and exits on its own, so nothing
        # here can take a SIGPIPE the way `... | head -c` does.
        DB_PASS="$(od -An -tx1 -N18 /dev/urandom | tr -d ' \n')"
        ok 'generated a database password'
    fi

    # Root over the unix socket: no root password needed on a fresh install.
    if mysql -u root <<SQL 2>/dev/null
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
ALTER USER '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'localhost';
FLUSH PRIVILEGES;
SQL
    then
        ok "database $DB_NAME and user $DB_USER ready"
    else
        die 'could not reach MariaDB as root - set a root password and rerun with SKIP_DB=1, then create the database by hand'
    fi

    # Defaults assume a big box. On a small VPS the buffer pool and the
    # performance schema alone eat most of the RAM the game server needs.
    total_mb="$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)"
    if [[ "$total_mb" -lt 6000 ]]; then
        conf_dir='/etc/mysql/mariadb.conf.d'
        [[ -d "$conf_dir" ]] || conf_dir='/etc/mysql/conf.d'
        [[ -d "$conf_dir" ]] || mkdir -p "$conf_dir"

        cat > "$conf_dir/99-fivem-small.cnf" <<'CNF'
# Подогнано под маленький VPS (меньше 6 ГБ RAM).
# Удали этот файл, если переедешь на машину пожирнее.
[mysqld]
innodb_buffer_pool_size = 128M
innodb_log_file_size    = 64M
innodb_flush_method     = O_DIRECT
performance_schema      = OFF
max_connections         = 50
key_buffer_size         = 16M
tmp_table_size          = 16M
max_heap_table_size     = 16M
table_open_cache        = 256
CNF
        systemctl restart mariadb >/dev/null 2>&1 || systemctl restart mysql >/dev/null 2>&1 || true
        ok "tuned MariaDB for a ${total_mb} MB box (~200 MB saved)"

        # A little swap keeps a 4 GB box from being killed by a memory spike
        # during startup, when every resource streams in at once.
        if [[ "$(swapon --show --noheadings | wc -l)" -eq 0 && ! -f /swapfile ]]; then
            if fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none; then
                chmod 600 /swapfile
                mkswap /swapfile >/dev/null 2>&1
                if swapon /swapfile 2>/dev/null; then
                    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
                    ok 'added 2 GB swap'
                else
                    rm -f /swapfile
                    warn 'swap could not be enabled (common on OpenVZ/LXC) - skipped'
                fi
            fi
        fi
    fi

    # The schema ships with the repo; it is fetched with the resources below.
    ok 'schema will be applied once the repo is downloaded'
fi

step 'FXServer artifact'
artifact_url="$(curl -fsSL --max-time 20 "$VERSIONS_API" 2>/dev/null \
    | jq -r '.recommended_download // .optional_download // .latest_download // empty' || true)"
if [[ -z "$artifact_url" ]]; then
    warn 'version API unreachable, using the pinned build'
    artifact_url="$FALLBACK_ARTIFACT"
fi
echo "    $artifact_url"
# A rerun after a dropped download should not pull 300 MB again.
if [[ -f "$SERVER_DIR/run.sh" ]]; then
    ok 'FXServer already unpacked, skipping'
else
    fetch "$artifact_url" "$TMP_DIR/fx.tar.xz" \
        || die 'could not download FXServer - check the network and rerun'
    tar -xJf "$TMP_DIR/fx.tar.xz" -C "$SERVER_DIR"
    [[ -f "$SERVER_DIR/run.sh" ]] || die "run.sh missing after extraction - check $SERVER_DIR"
fi
chmod +x "$SERVER_DIR/run.sh"
ok 'FXServer unpacked'

step 'Base resources (cfx-server-data)'
if [[ -d "$RES_DIR" && -d "$DATA_DIR/resources/[system]" ]]; then
    ok 'base resources already in place, skipping'
    skip_base=1
else
    skip_base=0
    fetch "$SERVER_DATA_ZIP" "$TMP_DIR/server-data.zip" \
        || die 'could not download cfx-server-data - check the network and rerun'
fi
if [[ "$skip_base" == "0" ]]; then
    rm -rf "$TMP_DIR/sd" && mkdir -p "$TMP_DIR/sd"
    unzip -qo "$TMP_DIR/server-data.zip" -d "$TMP_DIR/sd"
    inner="$(find "$TMP_DIR/sd" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
    cp -rn "$inner"/. "$DATA_DIR"/
    ok 'base resources in place'
fi

step 'vMenu'
if [[ -f "$RES_DIR/vMenu/fxmanifest.lua" ]]; then
    ok 'vMenu already installed, skipping'
elif vmenu_url="$(fetch_json "$VMENU_API" \
        | jq -r '.assets[] | select(.name | endswith(".zip")) | .browser_download_url' | head -n 1)" \
   && [[ -n "$vmenu_url" ]] \
   && fetch "$vmenu_url" "$TMP_DIR/vmenu.zip"; then
    rm -rf "$TMP_DIR/vm" && mkdir -p "$TMP_DIR/vm"
    unzip -qo "$TMP_DIR/vmenu.zip" -d "$TMP_DIR/vm"
    vmenu_src="$(dirname "$(find "$TMP_DIR/vm" -type f -name fxmanifest.lua | head -n 1)")"
    if [[ -n "$vmenu_src" && -d "$vmenu_src" ]]; then
        rm -rf "$RES_DIR/vMenu"
        mv "$vmenu_src" "$RES_DIR/vMenu"
        ok 'vMenu installed'
    else
        warn 'no fxmanifest.lua inside the vMenu archive'
    fi
else
    warn 'vMenu install failed - grab it from https://github.com/TomGrobbe/vMenu/releases'
fi

step 'oxmysql'
if [[ -f "$RES_DIR/oxmysql/fxmanifest.lua" ]]; then
    ok 'oxmysql already installed, skipping'
elif ox_url="$(fetch_json "$OXMYSQL_API" \
        | jq -r '.assets[] | select(.name | endswith(".zip")) | .browser_download_url' | head -n 1)" \
   && [[ -n "$ox_url" ]] \
   && fetch "$ox_url" "$TMP_DIR/oxmysql.zip"; then
    rm -rf "$TMP_DIR/ox" && mkdir -p "$TMP_DIR/ox"
    unzip -qo "$TMP_DIR/oxmysql.zip" -d "$TMP_DIR/ox"
    ox_src="$(dirname "$(find "$TMP_DIR/ox" -type f -name fxmanifest.lua | head -n 1)")"
    if [[ -n "$ox_src" && -d "$ox_src" ]]; then
        rm -rf "$RES_DIR/oxmysql"
        mv "$ox_src" "$RES_DIR/oxmysql"
        ok 'oxmysql installed'
    else
        warn 'no fxmanifest.lua inside the oxmysql archive'
    fi
else
    warn 'oxmysql download failed - the server will not start without it'
fi

step 'pma-voice'
if fetch "$PMA_VOICE_ZIP" "$TMP_DIR/pma.zip"; then
    rm -rf "$TMP_DIR/pma" && mkdir -p "$TMP_DIR/pma"
    unzip -qo "$TMP_DIR/pma.zip" -d "$TMP_DIR/pma"
    pma_src="$(dirname "$(find "$TMP_DIR/pma" -type f -name fxmanifest.lua | head -n 1)")"
    if [[ -n "$pma_src" && -d "$pma_src" ]]; then
        rm -rf "$RES_DIR/pma-voice"
        mv "$pma_src" "$RES_DIR/pma-voice"
        ok 'pma-voice installed'

        # Proximity ranges live in a Lua table in its shared config. Rewrite the
        # three distances rather than the labels, and say so if the shape moved.
        voice_cfg="$RES_DIR/pma-voice/configuration.lua"
        [[ -f "$voice_cfg" ]] || voice_cfg="$(find "$RES_DIR/pma-voice" -name '*config*.lua' | head -n 1)"

        if [[ -n "$voice_cfg" && -f "$voice_cfg" ]] && grep -q 'voiceModes' "$voice_cfg"; then
            python3 - "$voice_cfg" "$VOICE_WHISPER" "$VOICE_NORMAL" "$VOICE_SHOUT" <<'PYEOF'
import io, re, sys
path, whisper, normal, shout = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
text = io.open(path, encoding='utf-8').read()
block = re.search(r'voiceModes\s*=\s*\{.*?\n\s*\}', text, re.S)
if not block:
    sys.exit(3)
replacement = (
    "voiceModes = {\n"
    "\t{%s, 'Шёпот'},\n"
    "\t{%s, 'Обычный'},\n"
    "\t{%s, 'Крик'},\n"
    "}" % (whisper, normal, shout)
)
io.open(path, 'w', encoding='utf-8').write(text[:block.start()] + replacement + text[block.end():])
PYEOF
            case $? in
                0) ok "proximity set to ${VOICE_NORMAL} m (whisper ${VOICE_WHISPER}, shout ${VOICE_SHOUT})" ;;
                3) warn 'pma-voice config changed shape - set voiceModes by hand' ;;
                *) warn 'could not rewrite the pma-voice config' ;;
            esac
        else
            warn 'pma-voice config not found - set the proximity range by hand'
        fi
    else
        warn 'no fxmanifest.lua inside the pma-voice archive'
    fi
else
    warn 'pma-voice download failed'
fi

if [[ "$SKIP_GARAGE" != "1" ]]; then
    step 'Phone garage and shops'
    if fetch "$REPO_ZIP" "$TMP_DIR/repo.zip"; then
        rm -rf "$TMP_DIR/repo" && mkdir -p "$TMP_DIR/repo"
        unzip -qo "$TMP_DIR/repo.zip" -d "$TMP_DIR/repo"
        # The schema ships in the same archive.
        # Every .sql in the repo, in name order: 001 creates, 002+ migrate.
        # Applying only the first one leaves later columns missing, and the
        # queries that need them fail silently.
        sql_dir="$(dirname "$(find "$TMP_DIR/repo" -type f -name '001_schema.sql' | head -n 1)")"
        if [[ -n "$sql_dir" && -d "$sql_dir" ]]; then
            mkdir -p "$ROOT/sql"
            cp "$sql_dir"/*.sql "$ROOT/sql"/ 2>/dev/null || true

            if [[ "$SKIP_DB" != "1" ]]; then
                applied=0
                while IFS= read -r migration; do
                    if mysql -u root "$DB_NAME" < "$migration" 2>/dev/null; then
                        applied=$((applied + 1))
                    else
                        warn "не применилось: $(basename "$migration")"
                    fi
                done < <(find "$ROOT/sql" -maxdepth 1 -name '*.sql' | sort)
                ok "миграций применено: $applied"
            fi
        else
            warn 'sql files not found in the repo archive'
        fi

        for resource in phone_garage ls_character ls_inventory ls_shops ls_medical ls_tuning ls_rp ls_police ls_gangs ls_crime ls_property ls_interact ls_armoury ls_forum ls_turf ls_city ls_business ls_world; do
            src="$(find "$TMP_DIR/repo" -type d -name "$resource" | head -n 1)"
            if [[ -n "$src" ]]; then
                # Player data lives inside the resource folder - characters,
                # inventories, documents, cars, money, tuning. Reinstalling
                # used to delete the lot, so it is carried across by hand.
                keep="$TMP_DIR/keep/$resource"
                rm -rf "$keep" && mkdir -p "$keep"
                find "$RES_DIR/$resource" -maxdepth 1 -type f -name '*.json' \
                    -exec cp {} "$keep/" \; 2>/dev/null || true

                rm -rf "${RES_DIR:?}/$resource"
                mv "$src" "$RES_DIR/$resource"

                # -n: anything the repo ships itself wins.
                cp -n "$keep"/*.json "$RES_DIR/$resource/" 2>/dev/null || true
                ok "$resource installed"
            else
                warn "$resource not found in the repo archive"
            fi
        done
    else
        warn 'phone garage download failed'
    fi
fi

if [[ "$SKIP_CARS" != "1" ]]; then
    step 'Car pack'
    if fetch "$CAR_PACK_ZIP" "$TMP_DIR/cars.zip"; then
        rm -rf "$TMP_DIR/cars" && mkdir -p "$TMP_DIR/cars" "$CARS_DIR"
        unzip -qo "$TMP_DIR/cars.zip" -d "$TMP_DIR/cars"
        inner="$(find "$TMP_DIR/cars" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
        cp -rn "$inner"/. "$CARS_DIR"/ 2>/dev/null || true
        ok 'car pack downloaded'
    else
        warn 'car pack download failed'
    fi
fi

if [[ "$SKIP_WEAPONS" != "1" ]]; then
    step 'Weapon packs'
    mkdir -p "$WEAPONS_DIR"
    for pack in "${WEAPON_PACKS[@]}"; do
        pack_name="${pack##*/}"
        got=0
        for branch in main master; do
            if fetch "https://github.com/${pack}/archive/refs/heads/${branch}.zip" \
                    "$TMP_DIR/${pack_name}.zip" 2>/dev/null; then
                got=1
                break
            fi
        done

        if [[ "$got" != "1" ]]; then
            warn "$pack could not be downloaded"
            continue
        fi

        rm -rf "$TMP_DIR/wp" && mkdir -p "$TMP_DIR/wp"
        unzip -qo "$TMP_DIR/${pack_name}.zip" -d "$TMP_DIR/wp"
        inner="$(find "$TMP_DIR/wp" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

        # A pack is usually one resource; move it in under the repo's name.
        if [[ -f "$inner/fxmanifest.lua" || -f "$inner/__resource.lua" ]]; then
            rm -rf "${WEAPONS_DIR:?}/$pack_name"
            mv "$inner" "$WEAPONS_DIR/$pack_name"
        else
            cp -rn "$inner"/. "$WEAPONS_DIR"/ 2>/dev/null || true
        fi
        ok "$pack"
    done
fi

if [[ "$SKIP_REAL_CARS" != "1" ]]; then
    step 'Branded cars'
    install_real_cars
fi

step 'Wiring up cars'
sync_cars

step 'Wiring up weapons'
sync_weapons

step 'server.cfg'
if [[ -z "$LICENSE_KEY" ]]; then
    echo '    Paste the key from https://keymaster.fivem.net (server type: Development).'
    # -s keeps the key off the screen: it ends up in scrollback and in every
    # screenshot otherwise, and a leaked key is a key someone else can run on.
    read -rs -p '    License key: ' LICENSE_KEY </dev/tty || true
    echo
fi
if [[ -z "$LICENSE_KEY" ]]; then
    warn 'no key entered - server.cfg gets a placeholder, fill it in before starting'
    LICENSE_KEY='PASTE_YOUR_KEY_HERE'
fi

car_ensure=""
while IFS= read -r manifest; do
    car_ensure+="ensure $(basename "$(dirname "$manifest")")"$'\n'
done < <(list_resources "$CARS_DIR")
[[ -n "$car_ensure" ]] || car_ensure="# no car resources yet - drop packs into resources/[cars] and rerun with --sync-packs"$'\n'

weapon_ensure=""
while IFS= read -r manifest; do
    weapon_ensure+="ensure $(basename "$(dirname "$manifest")")"$'\n'
done < <(list_resources "$WEAPONS_DIR")
[[ -n "$weapon_ensure" ]] || weapon_ensure="# no weapon resources yet - drop packs into resources/[weapons] and rerun with --sync-packs"$'\n'

cat > "$DATA_DIR/server.cfg" <<CFG
## ------------------------------------------------------------------
## FiveM sandbox server - generated by setup.sh
## ------------------------------------------------------------------

endpoint_add_tcp "0.0.0.0:30120"
endpoint_add_udp "0.0.0.0:30120"

sv_licenseKey "$LICENSE_KEY"
sv_hostname "$HOSTNAME_"
sv_maxclients $MAXCLIENTS
sv_scriptHookAllowed 0
sets locale "ru-RU"

# OneSync. Не опционально: без него серверные GetPlayerPed/GetEntityCoords
# возвращают ноль, и КАЖДАЯ проверка расстояния в ls_police падает в
# "слишком далеко" - надеть наручники нельзя вообще ни на кого. Он же нужен
# для NPC-гангстеров. До 48 слотов бесплатен.
set onesync on
set onesync_population true

## --- database -----------------------------------------------------------
set mysql_connection_string "mysql://$DB_USER:$DB_PASS@localhost/$DB_NAME?charset=utf8mb4"

## --- voice --------------------------------------------------------------
# Proximity is set in resources/pma-voice; these only pick the defaults.
setr voice_defaultVoiceMode 2
setr voice_enableProximityCycle true
setr voice_enableRadios true
setr voice_defaultRadioVolume 60

# Uncomment and bump if newer DLC vehicles refuse to spawn.
#set sv_enforceGameBuild 3407

## --- infrastructure -----------------------------------------------
# oxmysql must start before anything that touches the database.
ensure oxmysql
ensure pma-voice

## --- base resources -----------------------------------------------
# chat, sessionmanager and hardcap are NOT listed here. Modern artifacts ship
# them under citizen/system_resources and start them on their own; naming them
# here only logs "Couldn't find resource" on every boot.
ensure mapmanager
ensure spawnmanager
ensure basic-gamemode

## --- vMenu --------------------------------------------------------
ensure vMenu

# Friends-only sandbox: everyone gets the whole menu.
# To lock it down later, drop this line and hand out permissions per player instead.
add_ace builtin.everyone "vMenu.Everything" allow

# Make yourself an admin (find your identifier in the server console on join):
#add_principal identifier.fivem:1234567 group.admin
#add_ace group.admin command allow

## --- phone garage and shops ---------------------------------------
# F1 opens the phone. /park stores the called car, /parkhere records a spot.
# Shops are marked on the map; walk into a marker and press E.
ensure phone_garage
ensure ls_character
ensure ls_inventory
ensure ls_shops
ensure ls_medical
ensure ls_tuning
ensure ls_rp
ensure ls_police
# NPC-банды. Стартуют после ls_police: спрашивают у него, кто на смене.
ensure ls_gangs
# Криминал. Нужен ls_gangs (районы) и ls_police (розыск).
ensure ls_crime
# Семьи, недвижимость и аукцион. Телефон берёт данные отсюда.
ensure ls_property
# Одно меню на всё взаимодействие. Стартует последним: остальные к нему
# подключаются, а не наоборот.
ensure ls_interact
# Оружейка госфракции и форум.
ensure ls_armoury
ensure ls_forum
# Районы и город. ls_turf после ls_property: районы держат семьями.
ensure ls_turf
ensure ls_city
# Заведения игроков и живая карта. ls_world последним: в него шлют
# горячие точки все остальные.
ensure ls_business
ensure ls_world

# Police ranks are handed out in game with /police hire; this ace only guards
# the admin-side commands.
#add_ace group.admin police.admin allow

# Who may hand out money with /givemoney:
#add_ace group.admin garage.admin allow

## --- add-on cars --------------------------------------------------
$car_ensure
## --- add-on weapons -----------------------------------------------
$weapon_ensure
CFG
ok "written: $DATA_DIR/server.cfg"

step 'systemd unit'
# FXServer reads its console from stdin. Under systemd stdin is /dev/null,
# which EOFs immediately, and the server reads that as Ctrl-C and quits with
# "Quitting: Ctrl-C pressed in server console". Running it inside screen gives
# it a real pty, and as a bonus `screen -r fivem` attaches to the live console.
#
# -Logfile is not optional: everything the server prints goes to screen's pty,
# so journalctl sees systemd's own lines and nothing else. Without this file
# there is no way to find out why a resource refused to start.
cat > /etc/systemd/system/fivem.service <<UNIT
[Unit]
Description=FiveM server
After=network-online.target mariadb.service
Wants=network-online.target
StartLimitIntervalSec=600
StartLimitBurst=5

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$DATA_DIR
ExecStart=/usr/bin/screen -L -Logfile $ROOT/server.log -DmS fivem $SERVER_DIR/run.sh +exec server.cfg
# on-failure не годится: если FXServer отказался от лицензионного ключа или
# прочитал EOF со stdin, он выходит с кодом 0, systemd считает это штатным
# завершением и сервер просто лежит. always поднимает его в любом случае, а
# StartLimit (он в [Unit]) не даёт уйти в бесконечный цикл на сломанном
# конфиге: пять попыток за десять минут, дальше служба встаёт с 'failed'
# и ждёт человека.
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
ok 'fivem.service installed'

chown -R "$SERVICE_USER":"$SERVICE_USER" "$ROOT"
rm -rf "$TMP_DIR"

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
    ufw allow 30120/tcp >/dev/null && ufw allow 30120/udp >/dev/null
    ok 'ufw: port 30120 opened'
fi

ip_addr="$(curl -fsSL --max-time 10 https://api.ipify.org 2>/dev/null || echo '<server-ip>')"

cat <<DONE

=====================================================================
 Ready.

 Database: $DB_NAME / user $DB_USER
 Password: $DB_PASS
           (also written into server.cfg)

 Start:    systemctl enable --now fivem
 Logs:     journalctl -u fivem -f
 Console:  screen -r fivem   (detach with Ctrl-A then D)
 Restart:  systemctl restart fivem

 In FiveM press F8 and type:   connect $ip_addr

 Make sure TCP+UDP 30120 is open in the provider's firewall too.

 Added more car or weapon packs? Drop them in and run:
     bash setup.sh --sync-packs

 Branded cars (Divo, Chiron, Jesko, ...) on a server that already runs:
     bash setup.sh --real-cars
=====================================================================

DONE
