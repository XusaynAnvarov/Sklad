#!/bin/sh
# ========================================================================
#  Перевести вебхук клиентского бота на VPS (generalmodern.uz).
#  Запуск НА VPS из папки приложения (где лежит .env):
#     sh scripts/set-webhook.sh
#  Токен читается из .env (CLIENT_BOT_TOKEN) — в репозиторий не попадает.
# ========================================================================
set -e
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then echo "Нет .env в $(pwd)"; exit 1; fi
set -a; . ./.env; set +a

BASE="${PUBLIC_URL:-https://generalmodern.uz}"
HOOK="${BASE}/api/bot"

if [ -z "$CLIENT_BOT_TOKEN" ]; then echo "CLIENT_BOT_TOKEN не задан в .env"; exit 1; fi

echo "Ставлю вебхук: $HOOK"
curl -s "https://api.telegram.org/bot${CLIENT_BOT_TOKEN}/setWebhook" \
  -d "url=${HOOK}" \
  ${TELEGRAM_WEBHOOK_SECRET:+-d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"} \
  -d "drop_pending_updates=false"
echo
echo "--- Проверка (getWebhookInfo) ---"
curl -s "https://api.telegram.org/bot${CLIENT_BOT_TOKEN}/getWebhookInfo"
echo
