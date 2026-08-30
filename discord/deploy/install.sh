#!/usr/bin/env bash
# Установка бота Emperium на чистый VPS (Ubuntu 22.04/24.04 или Debian 12).
# Запуск от root:
#   bash <(curl -fsSL ССЫЛКА_НА_ЭТОТ_ФАЙЛ)
# Токен можно передать заранее:
#   DISCORD_TOKEN=... DISCORD_GUILD_ID=... bash install.sh

set -euo pipefail

REPO="${REPO:-https://github.com/somtakfan-arch/Emperator-coin.git}"
BRANCH="${BRANCH:-claude/discord-server-4xk4mo}"
DIR="${DIR:-/opt/emperium}"
APP="$DIR/discord"
SERVICE="emperium-bot"
USER_NAME="emperium"

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m✖ %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Нужны права root. Запусти: sudo bash install.sh"
command -v systemctl >/dev/null || fail "Нет systemd — скрипт рассчитан на Ubuntu или Debian."

step "Системные пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates git >/dev/null

if ! command -v node >/dev/null || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 18 ]; then
  step "Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
fi
echo "Node $(node -v)"

step "Код бота"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --depth 1 origin "$BRANCH" -q
  git -C "$DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
  echo "обновлено из ветки $BRANCH"
else
  rm -rf "$DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$DIR" -q
  echo "склонировано в $DIR"
fi

step "Зависимости"
cd "$APP"
npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1
echo "готово"

step "Настройки"
if [ -f "$APP/.env" ] && [ -z "${DISCORD_TOKEN:-}" ]; then
  echo "Файл .env уже есть, оставляю как есть"
else
  if [ -z "${DISCORD_TOKEN:-}" ]; then
    read -rsp "Токен бота (ввод скрыт): " DISCORD_TOKEN; echo
  fi
  DISCORD_CLIENT_ID="${DISCORD_CLIENT_ID:-1539749910226673814}"
  DISCORD_GUILD_ID="${DISCORD_GUILD_ID:-1539749495636492298}"
  [ -n "$DISCORD_TOKEN" ] || fail "Токен пустой."
  cat > "$APP/.env" <<ENV
DISCORD_TOKEN=$DISCORD_TOKEN
DISCORD_CLIENT_ID=$DISCORD_CLIENT_ID
DISCORD_GUILD_ID=$DISCORD_GUILD_ID
DATA_FILE=$APP/data/store.json
ENV
  echo "записан $APP/.env"
fi

step "Пользователь и права"
id -u "$USER_NAME" >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin "$USER_NAME" 2>/dev/null || true
if ! id -u "$USER_NAME" >/dev/null 2>&1; then
  echo "Отдельного пользователя завести не вышло — служба будет работать от root"
  USER_NAME=root
fi
mkdir -p "$APP/data"
chown -R "$USER_NAME:$USER_NAME" "$DIR"
chmod 600 "$APP/.env"
echo "владелец: $USER_NAME"

step "Служба systemd"
cat > "/etc/systemd/system/$SERVICE.service" <<UNIT
[Unit]
Description=Discord-бот семьи Emperium
Documentation=$REPO
After=network-online.target
Wants=network-online.target
# Не сдаваться после серии падений
StartLimitIntervalSec=0

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$APP
EnvironmentFile=$APP/.env
ExecStart=/usr/bin/node src/bot.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable "$SERVICE" -q
systemctl restart "$SERVICE"

step "Проверка"
sleep 5
if systemctl is-active --quiet "$SERVICE"; then
  printf '\033[32m✔ Бот запущен и переживёт перезагрузку сервера\033[0m\n\n'
  journalctl -u "$SERVICE" -n 12 --no-pager -o cat
else
  printf '\033[31m✖ Бот не поднялся. Последние строки лога:\033[0m\n\n'
  journalctl -u "$SERVICE" -n 25 --no-pager -o cat
  exit 1
fi

cat <<'TIPS'

Что дальше:
  журнал в реальном времени   journalctl -u emperium-bot -f
  перезапуск                  systemctl restart emperium-bot
  остановка                   systemctl stop emperium-bot
  обновление кода             bash /opt/emperium/discord/deploy/update.sh
TIPS
