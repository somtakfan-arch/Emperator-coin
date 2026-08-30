#!/usr/bin/env bash
# Обновление бота на VPS: забирает свежий код и перезапускает службу.
set -euo pipefail

DIR="${DIR:-/opt/emperium}"
BRANCH="${BRANCH:-claude/discord-server-4xk4mo}"
SERVICE="emperium-bot"

[ "$(id -u)" -eq 0 ] || { echo "Запусти от root: sudo bash update.sh"; exit 1; }

echo "▸ Забираю код"
git -C "$DIR" fetch --depth 1 origin "$BRANCH" -q
git -C "$DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"

echo "▸ Зависимости"
cd "$DIR/discord"
npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1

chown -R emperium:emperium "$DIR" 2>/dev/null || true
systemctl restart "$SERVICE"
sleep 4

if systemctl is-active --quiet "$SERVICE"; then
  echo "✔ Обновлено и запущено"
  journalctl -u "$SERVICE" -n 8 --no-pager -o cat
else
  echo "✖ Не поднялся:"
  journalctl -u "$SERVICE" -n 20 --no-pager -o cat
  exit 1
fi
