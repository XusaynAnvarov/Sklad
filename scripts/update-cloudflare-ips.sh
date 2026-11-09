#!/bin/sh
# ========================================================================
#  Обновить список адресов Cloudflare для nginx.
#  Запуск на сервере:  sh scripts/update-cloudflare-ips.sh
#  Cron (1-го числа в 04:00):
#    0 4 1 * * sh /var/www/skladanvarov/scripts/update-cloudflare-ips.sh >> /var/log/cf-ips.log 2>&1
#
#  Безопасно: если Cloudflare не ответил, список пустой или nginx -t
#  не прошёл — оставляем прежний файл и ничего не перезагружаем.
# ========================================================================
set -eu
OUT=/etc/nginx/conf.d/cloudflare-ips.conf
TMP=$(mktemp)
V4=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4) || { echo "$(date) нет ответа ips-v4"; exit 1; }
V6=$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6) || { echo "$(date) нет ответа ips-v6"; exit 1; }
# защита от пустого/битого ответа: адресов должно быть много и только CIDR
N=$(printf '%s\n%s\n' "$V4" "$V6" | grep -cE '^[0-9a-f:.]+/[0-9]+$' || true)
if [ "$N" -lt 10 ]; then echo "$(date) подозрительно мало адресов ($N) — не меняем"; exit 1; fi
{
  echo "# Обновлено $(date -u +%F) из https://www.cloudflare.com/ips-v4 и ips-v6"
  echo 'geo $from_cloudflare {'
  echo '    default 0;'
  echo '    127.0.0.1/32 1;'
  echo '    ::1/128 1;'
  printf '%s\n%s\n' "$V4" "$V6" | grep -E '^[0-9a-f:.]+/[0-9]+$' | sed 's/^/    /; s/$/ 1;/'
  echo '}'
} > "$TMP"
if cmp -s "$TMP" "$OUT" 2>/dev/null; then rm -f "$TMP"; exit 0; fi
cp "$OUT" "$OUT.bak" 2>/dev/null || true
cp "$TMP" "$OUT"; rm -f "$TMP"
if nginx -t 2>/dev/null; then systemctl reload nginx; echo "$(date) список обновлён ($N адресов)"
else cp "$OUT.bak" "$OUT"; echo "$(date) nginx -t не прошёл — вернул прежний список"; exit 1; fi
