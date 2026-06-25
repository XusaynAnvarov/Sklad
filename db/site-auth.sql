-- ========================================================================
--  Вход с кодом (2FA через Telegram) + одна активная сессия на аккаунт.
--  Запустить ОДИН раз в Supabase → SQL Editor.
-- ========================================================================

-- Текущая активная сессия: новый вход меняет session_id → старые JWT (с другим sid) становятся недействительны.
alter table if exists site_accounts add column if not exists session_id text;

-- Одноразовый код входа (хранится хэш), срок действия и счётчик попыток.
alter table if exists site_accounts add column if not exists login_code text;
alter table if exists site_accounts add column if not exists login_code_exp timestamptz;
alter table if exists site_accounts add column if not exists login_attempts int default 0;

-- chat_id Telegram для отправки кода (дублируем сюда для скорости; иначе берём из customers.tg_chat_id).
alter table if exists site_accounts add column if not exists chat_id text;
