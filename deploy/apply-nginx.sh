#!/bin/sh
# ========================================================================
#  Поставить на сервер настройку nginx из репозитория (deploy/nginx-generalmodern.conf).
#  Запуск на сервере:  sh /var/www/skladanvarov/deploy/apply-nginx.sh
#
#  Безопасно:
#   - сначала сверяет живую настройку с репозиторной (без строк include
#     защитных заголовков и строк с пометкой gm-auto) — если на сервере
#     есть ручные правки, НИЧЕГО не меняет и показывает разницу;
#   - сам кусочек заголовков (nginx-security-headers.conf) подключается
#     прямо из папки сайта: после обновления сайта достаточно перезапуска
#     этого скрипта (он и перезагружает nginx);
#   - делает копию, проверяет nginx -t; если проверка не прошла —
#     возвращает прежнюю настройку. Перезагрузка без обрыва соединений.
# ========================================================================
set -u
REPO=/var/www/skladanvarov/deploy/nginx-generalmodern.conf
LIVE=$(grep -l "server_name generalmodern.uz" /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf 2>/dev/null | head -1)
[ -n "$LIVE" ] || { echo "Не нашёл живую настройку generalmodern.uz в /etc/nginx"; exit 1; }
LIVE=$(readlink -f "$LIVE")
echo "Живая настройка: $LIVE"

norm() { tr -d '\r' < "$1" | grep -v 'gm-auto' | sed 's/#.*//' | grep -v 'nginx-security-headers' | tr -s ' \t' ' ' | sed 's/^ //;s/ $//' | grep -v '^$'; }

if ! norm "$LIVE" > /tmp/gm-live.txt || ! norm "$REPO" > /tmp/gm-repo.txt; then echo "Не удалось прочитать файлы"; exit 1; fi
if ! cmp -s /tmp/gm-live.txt /tmp/gm-repo.txt; then
  echo "На сервере настройка отличается от репозитория не только заголовками — ничего не меняю."
  echo "Разница (слева сервер, справа репозиторий):"
  diff /tmp/gm-live.txt /tmp/gm-repo.txt
  exit 2
fi

# копия — в /root, а не рядом: файл в sites-enabled nginx подхватил бы как второй сайт
BAK=/root/nginx-generalmodern.bak-$(date +%Y%m%d-%H%M%S)
cp -f "$LIVE" "$BAK" || { echo "Не удалось сделать копию — ничего не меняю"; exit 1; }
echo "Копия прежней настройки: $BAK"
tr -d '\r' < "$REPO" > "$LIVE"
if nginx -t 2>/tmp/gm-nginx-test.txt; then
  systemctl reload nginx && echo "Готово: заголовки безопасности включены, nginx перезагружен."
else
  cat /tmp/gm-nginx-test.txt
  cp -f "$BAK" "$LIVE"
  echo "nginx -t не прошёл — вернул прежнюю настройку, сайт не тронут."
  exit 3
fi
