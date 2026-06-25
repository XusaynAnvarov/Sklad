-- ========================================================================
--  Расширение для админ-панели сайта: происхождение клиента, @username, ярлык
--  Запустить ОДИН раз в Supabase → SQL Editor.
-- ========================================================================

-- Происхождение аккаунта: 'site' (пришёл с сайта) | 'warehouse' (был в складе)
alter table if exists site_accounts add column if not exists origin text;

-- Telegram @username клиента (захватывается при верификации) и ярлык владельца
alter table if exists site_accounts add column if not exists tg_username text;
alter table if exists site_accounts add column if not exists tg_nick text;

-- @username также сохраняем на этапе верификации, чтобы перенести в аккаунт
alter table if exists site_verifications add column if not exists tg_username text;
