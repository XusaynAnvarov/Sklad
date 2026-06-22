-- ====================================================================
-- Миграция: публичный сайт — аккаунты клиентов, верификация, блоклист
-- Запустить в Supabase → SQL Editor → Run
-- ====================================================================

-- Расширяем bot_sessions: поле state для хранения состояния Telegram-верификации
alter table bot_sessions add column if not exists state jsonb default '{}'::jsonb;

-- Формализуем поля sales (пишутся кодом, но не объявлены в схеме)
alter table sales add column if not exists source text default 'manual'; -- bot | site | manual
alter table sales add column if not exists order_from jsonb;

-- ---------- Аккаунты клиентов сайта ----------
create table if not exists site_accounts (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid references customers(id) on delete cascade,
  phone        text not null unique,      -- нормализованный (последние 9 цифр)
  password_hash text not null,
  tg_verified  boolean default false,
  created_at   timestamptz default now(),
  last_login   timestamptz
);
alter table site_accounts enable row level security;
-- Нет публичных политик: доступ ТОЛЬКО через service role (серверные эндпоинты)

-- ---------- Заблокированные номера ----------
create table if not exists blocked_phones (
  phone      text primary key,            -- нормализованный
  reason     text,
  blocked_at timestamptz default now(),
  blocked_by text default 'admin'
);
alter table blocked_phones enable row level security;

-- ---------- Верификации через Telegram (TTL 1 час) ----------
create table if not exists site_verifications (
  token      text primary key,
  phone      text not null,
  chat_id    text,                        -- заполняется ботом после подтверждения
  verified   boolean default false,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);
alter table site_verifications enable row level security;

-- ---------- Индексы ----------
create index if not exists idx_site_accounts_phone   on site_accounts(phone);
create index if not exists idx_site_verif_phone      on site_verifications(phone);
create index if not exists idx_site_verif_verified   on site_verifications(verified);
create index if not exists idx_sales_source          on sales(source);
create index if not exists idx_sales_status          on sales(status);
