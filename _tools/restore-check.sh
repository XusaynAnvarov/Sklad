#!/usr/bin/env bash
# ========================================================================
#  ПРОВЕРКА, ЧТО КОПИЯ ДЕЙСТВИТЕЛЬНО РАЗВОРАЧИВАЕТСЯ.
#
#  Копия, которую ни разу не пробовали восстановить, — это не копия, а
#  надежда. Раз в неделю берём последнюю копию, разворачиваем её во
#  ВРЕМЕННУЮ базу (рабочую не трогаем), считаем строки и отчитываемся
#  владельцу в Telegram. Временная база удаляется сразу после проверки.
#
#  Запуск: /var/www/skladanvarov/_tools/restore-check.sh
# ========================================================================
set -euo pipefail

КОРЕНЬ="/var/www/skladanvarov"
КУДА="/var/backups/sklad"
ВРЕМЕННАЯ="sklad_proverka"

cd "$КОРЕНЬ"
значение() { grep -m1 -oP "(?<=^$1=).*" .env 2>/dev/null | tr -d '"' | tr -d "'" | tr -d '\r'; }

PGHOST="$(значение PGHOST || true)";       PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="$(значение PGPORT || true)";       PGPORT="${PGPORT:-5432}"
PGUSER="$(значение PGUSER || true)";       PGUSER="${PGUSER:-sklad}"
PGDATABASE="$(значение PGDATABASE || true)"; PGDATABASE="${PGDATABASE:-sklad}"
PGPASSWORD="$(значение PGPASSWORD || true)"
export PGPASSWORD

ПОСЛЕДНЯЯ=$(ls -1t "$КУДА"/sklad-*.sql.gz 2>/dev/null | head -1 || true)
[ -z "$ПОСЛЕДНЯЯ" ] && { echo "копий нет" >&2; exit 1; }

# временная база: сносим прошлую, создаём чистую
sudo -u postgres dropdb --if-exists "$ВРЕМЕННАЯ"
sudo -u postgres createdb --owner="$PGUSER" "$ВРЕМЕННАЯ"

gunzip -c "$ПОСЛЕДНЯЯ" | psql -q -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$ВРЕМЕННАЯ" > /dev/null

# сверяем: в развёрнутой копии должно быть столько же строк, сколько в рабочей
ОТЧЁТ=""
ВСЁ_ХОРОШО=1
for Т in products customers sales purchases payments stock_log; do
  РАБОЧАЯ=$(psql -tA -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE"  -c "select count(*) from $Т" 2>/dev/null || echo "-")
  КОПИЯ=$(psql  -tA -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$ВРЕМЕННАЯ"   -c "select count(*) from $Т" 2>/dev/null || echo "-")
  ЗНАК="✓"
  [ "$РАБОЧАЯ" != "$КОПИЯ" ] && { ЗНАК="✗"; ВСЁ_ХОРОШО=0; }
  ОТЧЁТ="$ОТЧЁТ
$ЗНАК $Т: в работе $РАБОЧАЯ, в копии $КОПИЯ"
done

sudo -u postgres dropdb --if-exists "$ВРЕМЕННАЯ"

ЗАГОЛОВОК=$([ "$ВСЁ_ХОРОШО" = "1" ] && echo "✅ Копия разворачивается, данные на месте" || echo "⚠️ Копия развернулась, но числа расходятся")
ТЕКСТ="$ЗАГОЛОВОК
Файл: $(basename "$ПОСЛЕДНЯЯ")$ОТЧЁТ"

echo "$ТЕКСТ"

ТОКЕН="$(значение TELEGRAM_BOT_TOKEN || true)"
ЧАТ="$(значение ADMIN_CHAT_ID || true)"
if [ -n "$ТОКЕН" ] && [ -n "$ЧАТ" ]; then
  curl -sS -X POST "https://api.telegram.org/bot$ТОКЕН/sendMessage" \
    -d "chat_id=$ЧАТ" --data-urlencode "text=$ТЕКСТ" > /dev/null || true
fi

[ "$ВСЁ_ХОРОШО" = "1" ] || exit 1
