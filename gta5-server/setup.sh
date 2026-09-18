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

set -euo pipefail

ROOT="${ROOT:-/opt/fivem}"
LICENSE_KEY="${LICENSE_KEY:-}"
HOSTNAME_="${HOSTNAME_:-Emperator crew}"
MAXCLIENTS="${MAXCLIENTS:-16}"
SKIP_CARS="${SKIP_CARS:-0}"
SKIP_GARAGE="${SKIP_GARAGE:-0}"
SKIP_WEAPONS="${SKIP_WEAPONS:-0}"
REPO_BRANCH="${REPO_BRANCH:-claude/gta5-rp-server-setup-fvdafy}"
SERVICE_USER="${SERVICE_USER:-fivem}"

VERSIONS_API='https://changelogs-live.fivem.net/api/changelog/versions/linux/server'
FALLBACK_ARTIFACT='https://runtime.fivem.net/artifacts/fivem/build_proot_linux/master/16742-c3ff6a20e0e2b24d10e0a05ee3e6dbc1cbf2e5a1/fx.tar.xz'
SERVER_DATA_ZIP='https://github.com/citizenfx/cfx-server-data/archive/refs/heads/master.zip'
VMENU_API='https://api.github.com/repos/TomGrobbe/vMenu/releases/latest'
CAR_PACK_ZIP='https://github.com/Rymex47/free-modpack/archive/refs/heads/main.zip'
REPO_ZIP="https://github.com/somtakfan-arch/Emperator-coin/archive/refs/heads/${REPO_BRANCH}.zip"

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

if [[ "${1:-}" == "--sync-cars" || "${1:-}" == "--sync-packs" ]]; then
    step 'Re-scanning car packs'
    sync_cars
    step 'Re-scanning weapon packs'
    sync_weapons
    chown -R "$SERVICE_USER":"$SERVICE_USER" "$DATA_DIR" 2>/dev/null || true
    printf '\n\033[32mDone. systemctl restart fivem\033[0m\n\n'
    exit 0
fi

step 'Dependencies'
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl xz-utils unzip jq ca-certificates >/dev/null
ok 'curl, xz-utils, unzip, jq'

step "Preparing $ROOT"
id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd -r -m -d "$ROOT" -s /usr/sbin/nologin "$SERVICE_USER"
mkdir -p "$SERVER_DIR" "$DATA_DIR" "$TMP_DIR"
ok 'folders and service user ready'

step 'FXServer artifact'
artifact_url="$(curl -fsSL --max-time 20 "$VERSIONS_API" 2>/dev/null \
    | jq -r '.recommended_download // .optional_download // .latest_download // empty' || true)"
if [[ -z "$artifact_url" ]]; then
    warn 'version API unreachable, using the pinned build'
    artifact_url="$FALLBACK_ARTIFACT"
fi
echo "    $artifact_url"
curl -fL --progress-bar "$artifact_url" -o "$TMP_DIR/fx.tar.xz"
tar -xJf "$TMP_DIR/fx.tar.xz" -C "$SERVER_DIR"
[[ -f "$SERVER_DIR/run.sh" ]] || die "run.sh missing after extraction - check $SERVER_DIR"
chmod +x "$SERVER_DIR/run.sh"
ok 'FXServer unpacked'

step 'Base resources (cfx-server-data)'
curl -fL --progress-bar "$SERVER_DATA_ZIP" -o "$TMP_DIR/server-data.zip"
rm -rf "$TMP_DIR/sd" && mkdir -p "$TMP_DIR/sd"
unzip -qo "$TMP_DIR/server-data.zip" -d "$TMP_DIR/sd"
inner="$(find "$TMP_DIR/sd" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
cp -rn "$inner"/. "$DATA_DIR"/
ok 'base resources in place'

step 'vMenu'
if vmenu_url="$(curl -fsSL --max-time 20 -H 'User-Agent: fivem-setup-script' "$VMENU_API" \
        | jq -r '.assets[] | select(.name | endswith(".zip")) | .browser_download_url' | head -n 1)" \
   && [[ -n "$vmenu_url" ]]; then
    curl -fL --progress-bar "$vmenu_url" -o "$TMP_DIR/vmenu.zip"
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

if [[ "$SKIP_GARAGE" != "1" ]]; then
    step 'Phone garage and shops'
    if curl -fL --progress-bar "$REPO_ZIP" -o "$TMP_DIR/repo.zip"; then
        rm -rf "$TMP_DIR/repo" && mkdir -p "$TMP_DIR/repo"
        unzip -qo "$TMP_DIR/repo.zip" -d "$TMP_DIR/repo"
        for resource in phone_garage ls_character ls_inventory ls_shops ls_rp; do
            src="$(find "$TMP_DIR/repo" -type d -name "$resource" | head -n 1)"
            if [[ -n "$src" ]]; then
                rm -rf "${RES_DIR:?}/$resource"
                mv "$src" "$RES_DIR/$resource"
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
    if curl -fL --progress-bar "$CAR_PACK_ZIP" -o "$TMP_DIR/cars.zip"; then
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
            if curl -fsL "https://github.com/${pack}/archive/refs/heads/${branch}.zip" \
                    -o "$TMP_DIR/${pack_name}.zip" 2>/dev/null; then
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

step 'Wiring up cars'
sync_cars

step 'Wiring up weapons'
sync_weapons

step 'server.cfg'
if [[ -z "$LICENSE_KEY" ]]; then
    echo '    Paste the key from https://keymaster.fivem.net (server type: Development).'
    read -r -p '    License key: ' LICENSE_KEY </dev/tty || true
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

# Uncomment and bump if newer DLC vehicles refuse to spawn.
#set sv_enforceGameBuild 3407

## --- base resources -----------------------------------------------
ensure mapmanager
ensure chat
ensure spawnmanager
ensure sessionmanager
ensure basic-gamemode
ensure hardcap

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
ensure ls_rp

# Who may hand out money with /givemoney:
#add_ace group.admin garage.admin allow

## --- add-on cars --------------------------------------------------
$car_ensure
## --- add-on weapons -----------------------------------------------
$weapon_ensure
CFG
ok "written: $DATA_DIR/server.cfg"

step 'systemd unit'
cat > /etc/systemd/system/fivem.service <<UNIT
[Unit]
Description=FiveM server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$DATA_DIR
ExecStart=$SERVER_DIR/run.sh +exec server.cfg
Restart=on-failure
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

 Start:    systemctl enable --now fivem
 Logs:     journalctl -u fivem -f
 Restart:  systemctl restart fivem

 In FiveM press F8 and type:   connect $ip_addr

 Make sure TCP+UDP 30120 is open in the provider's firewall too.

 Added more car or weapon packs? Drop them in and run:
     bash setup.sh --sync-packs
=====================================================================

DONE
