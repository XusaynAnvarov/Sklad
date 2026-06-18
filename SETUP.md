# Настройка складской системы

Система уже работает в **локальном демо-режиме** (данные в браузере) — можно сразу открыть и потестить. Ниже шаги, чтобы перевести её в **онлайн** (общая база, каталог по ссылке, авто-Telegram).

---

## 1. Supabase (база данных + фото)

1. Зайдите на https://supabase.com → **New project** (бесплатно). Запомните пароль БД.
2. Слева **SQL Editor** → New query → вставьте содержимое файла `db/schema.sql` → **Run**.
3. Слева **Project Settings → API**. Скопируйте:
   - **Project URL**
   - **anon public** ключ
4. Вставьте их в `config.js`:
   ```js
   SUPABASE_URL: "ttgcrcloioznojreogwn",
   SUPABASE_ANON_KEY: "ВАШ_ANON_КЛЮЧ",
   ```
5. Создайте аккаунт-админа: **Authentication → Users → Add user** (email + пароль).
   Этим email/паролем вы будете входить в админку.

> После заполнения `config.js` система автоматически переключится на Supabase.

---

## 2. Vercel (хостинг + отправка в Telegram)

1. Зайдите на https://vercel.com → войдите через GitHub.
2. Загрузите эту папку (через GitHub-репозиторий или `vercel` CLI).
3. В **Project Settings → Environment Variables** добавьте:
   - `SUPABASE_URL` — Project URL из Supabase
   - `SUPABASE_SERVICE_KEY` — **service_role** ключ Supabase (СЕКРЕТ, только сервер!)
   - `TELEGRAM_BOT_TOKEN` — токен бота-уведомлений (из @BotFather)
   - `TELEGRAM_CHANNEL_ID` — @username или -100... id канала для накладных
   - `CLIENT_BOT_TOKEN` — токен клиентского бота (вебхук `/api/bot`)
   - `ADMIN_CHAT_ID` — ваш chat_id (владелец бота)
   - `TELEGRAM_WEBHOOK_SECRET` — длинная случайная строка (защита вебхука)
   - `PUBLIC_URL` — адрес сайта, напр. `https://ваш-проект.vercel.app`
4. Deploy. Адреса после деплоя:
   - Админка: `https://ваш-проект.vercel.app/?key=СЕКРЕТ`
   - Каталог: `https://ваш-проект.vercel.app/catalog.html`

Секретный ключ доступа задан в `config.js` → `SECRET_KEY`. Поменяйте на свой.

---

## 3. Telegram

- **Бот**: токен от @BotFather → переменная `TELEGRAM_BOT_TOKEN` на Vercel.
- **Канал накладных**: добавьте бота в канал админом, укажите `@username` канала
  (или числовой `-100...` id) в `TELEGRAM_CHANNEL_ID`.
- **Каталог клиентам**: бот может отправить клиенту ссылку на каталог —
  для этого клиент должен сначала написать боту `/start` (Telegram не даёт
  писать первым). Чат-id клиента укажете при отправке.

---

## Доступ
- Админка открывается только по адресу с `?key=СЕКРЕТ` **и** требует пароль.
- Каталог (`catalog.html`) — публичный, без цен, только статус «есть / под заказ».

## Локальный запуск для проверки
```
npx serve -l 5500
```
Откройте админку (ключ в хэше `#`, чтобы не терялся при редиректах):
```
http://localhost:5500/#key=sklad-9f3a7c21b8e4
```
Пароль локального демо-режима задаётся в `config.js` → `ADMIN_PASSWORD` (по умолчанию пуст).
Каталог: `http://localhost:5500/catalog.html`

---

## 🔒 Безопасность (обязательно для боевого сайта)

1. **Включите RLS в Supabase.** Для всех таблиц с данными (products, customers, sales,
   purchases, payments, settings, bot_sessions) включите Row Level Security и задайте
   политики. Без RLS публичный `anon`-ключ из `config.js` даёт кому угодно полный доступ
   к данным. Публичным на чтение оставьте только то, что нужно каталогу.

2. **Защитите Telegram-вебхук секретом.** Задайте `TELEGRAM_WEBHOOK_SECRET` на Vercel и
   зарегистрируйте вебхук клиентского бота с этим же секретом:
   ```
   https://api.telegram.org/bot<CLIENT_BOT_TOKEN>/setWebhook?url=https://ВАШ-САЙТ/api/bot&secret_token=ВАШ_СЕКРЕТ
   ```
   Без совпадения секрета `/api/bot` отвергает запрос (защита от подделки update и обхода прав админа).

3. **Эндпоинты `/api/telegram` и `/api/upload` теперь требуют входа.** Они проверяют
   JWT администратора (Supabase Auth); анонимные вызовы получают `401`. В Supabase Auth
   держите только доверенные аккаунты-админы.

4. **Секреты — только в переменных окружения Vercel.** Никогда не кладите
   `service_role`-ключ или токены ботов в `config.js` или файлы в `js/` — они отдаются в браузер.
