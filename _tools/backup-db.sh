#!/usr/bin/env bash
# ========================================================================
#  КОПИЯ СВОЕЙ БАЗЫ.
#
#  Раз в час: копия на сервер, хранится двое суток (48 штук).
#  Раз в сутки: та же копия уходит файлом владельцу в Telegram — копия на
#  том же сервере не спасает, если сервер потерян.
#
#  Запуск:  /var/www/skladanvarov/_tools/backup-db.sh          (час)
#           /var/www/skladanvarov/_tools/backup-db.sh --telegram  (сутки)
#
#  Проверка восстановления — отдельный скрипт restore-check.sh: копия,
#  которую ни разу не разворачивали, копией не считается.
# ========================================================================
set -euo pipefail

КОРЕНЬ="/var/www/skladanvarov"
КУДА="/var/backups/sklad"
ХРАНИТЬ=48

cd "$КОРЕНЬ"
# настройки берём из того же .env, что и сервер
значение() { grep -m1 -oP "(?<=^$1=).*" .env 2>/dev/null | tr -d '"' | tr -d "'" | tr -d '\r'; }

PGHOST="$(значение PGHOST || true)";       PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="$(значение PGPORT || true)";       PGPORT="${PGPORT:-5432}"
PGDATABASE="$(значение PGDATABASE || true)"; PGDATABASE="${PGDATABASE:-sklad}"
PGUSER="$(значение PGUSER || true)";       PGUSER="${PGUSER:-sklad}"
PGPASSWORD="$(значение PGPASSWORD || true)"
export PGPASSWORD

mkdir -p "$КУДА"
ИМЯ="sklad-$(date +%Y-%m-%d_%H-%M).sql.gz"
ФАЙЛ="$КУДА/$ИМЯ"

# -Fp + gzip: обычный текстовый дамп, его можно открыть и прочитать глазами
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" --no-owner --no-privileges \
  | gzip -9 > "$ФАЙЛ"

РАЗМЕР=$(stat -c%s "$ФАЙЛ")
if [ "$РАЗМЕР" -lt 1000 ]; then
  echo "КОПИЯ ПОДОЗРИТЕЛЬНО МАЛА ($РАЗМЕР байт) — что-то пошло не так" >&2
  exit 1
fi

# чистим старое, оставляя последние N
ls -1t "$КУДА"/sklad-*.sql.gz | tail -n +$((ХРАНИТЬ + 1)) | xargs -r rm -f

echo "копия готова: $ФАЙЛ ($((РАЗМЕР / 1024)) КБ)"

# --- раз в сутки отправляем владельцу в Telegram ---
if [ "${1:-}" = "--telegram" ]; then
  ТОКЕН="$(значение TELEGRAM_BOT_TOKEN || true)"
  ЧАТ="$(значение ADMIN_CHAT_ID || true)"
  if [ -n "$ТОКЕН" ] && [ -n "$ЧАТ" ]; then
    ПОДПИСЬ="Копия базы склада — $(date '+%d.%m.%Y %H:%M'), $((РАЗМЕР / 1024)) КБ. Храните её вне телефона."
    curl -sS -F "chat_id=$ЧАТ" -F "caption=$ПОДПИСЬ" -F "document=@$ФАЙЛ" \
      "https://api.telegram.org/bot$ТОКЕН/sendDocument" > /dev/null \
      && echo "копия отправлена в Telegram" \
      || echo "не удалось отправить копию в Telegram" >&2
  else
    echo "нет TELEGRAM_BOT_TOKEN или ADMIN_CHAT_ID — отправка пропущена" >&2
  fi
fi
