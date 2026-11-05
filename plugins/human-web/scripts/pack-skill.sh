#!/usr/bin/env bash
# Собирает dist/human-web-skill.zip для загрузки в claude.ai (Настройки → Возможности → Навыки).
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d); mkdir -p "$tmp/human-web/config" "$tmp/human-web/scripts" dist
sed 's#\${CLAUDE_PLUGIN_ROOT}/##g' skills/human-web/SKILL.md > "$tmp/human-web/SKILL.md"
cp config/rules.json "$tmp/human-web/config/"
cp scripts/check.mjs "$tmp/human-web/scripts/"
rm -f dist/human-web-skill.zip
(cd "$tmp" && zip -qr - human-web) > dist/human-web-skill.zip
rm -rf "$tmp"
echo "dist/human-web-skill.zip"
