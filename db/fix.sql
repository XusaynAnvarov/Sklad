-- ========================================================================
--  ДОПОЛНИТЬ БАЗУ ДО ТОГО, ЧТО ЖДЁТ КОД.
--
--  Запускать можно СКОЛЬКО УГОДНО РАЗ — ничего не ломает и не удаляет.
--  Всё через "if not exists": что уже есть — не трогается, чего нет —
--  добавляется. Данные не теряются.
--
--  Supabase → SQL Editor → вставить весь файл → Run.
--  После этого прогоните db/check.sql — второй отчёт должен стать пустым.
-- ========================================================================

-- ---------- ТОВАРЫ ----------
alter table if exists products add column if not exists sku text;
alter table if exists products add column if not exists photos jsonb default '[]'::jsonb;
alter table if exists products add column if not exists batches jsonb default '[]'::jsonb;
alter table if exists products add column if not exists cost_cur text;
alter table if exists products add column if not exists last_arrival_at timestamptz;
alter table if exists products add column if not exists status_override text;
alter table if exists products add column if not exists price_som numeric default 0;
alter table if exists products add column if not exists price_usd numeric default 0;
alter table if exists products add column if not exists price_yuan numeric default 0;

-- ---------- КЛИЕНТЫ ----------
alter table if exists customers add column if not exists phones jsonb default '[]'::jsonb;
alter table if exists customers add column if not exists tg_chat_id text;
alter table if exists customers add column if not exists tg_chat_ids jsonb default '[]'::jsonb;
alter table if exists customers add column if not exists tg_accounts jsonb default '[]'::jsonb;
alter table if exists customers add column if not exists tg_lang text;
-- Старый долг, который был до системы. Входит в общий долг клиента:
-- без этой колонки долги в телефоне и на сайте расходятся.
alter table if exists customers add column if not exists opening_debt jsonb default '{}'::jsonb;

-- ---------- НАКЛАДНЫЕ ----------
-- source: откуда пришла накладная — прилавок, телефон, бот, сайт.
alter table if exists sales add column if not exists source text;
-- order_from: кто заказал, если это не наш клиент (имя, телефон).
alter table if exists sales add column if not exists order_from jsonb;
alter table if exists sales add column if not exists boxes integer default 0;
alter table if exists sales add column if not exists telegram_sent boolean default false;

-- ---------- ПРИХОДЫ ----------
-- kind: поставка или магазин. От этого зависит, рассылать ли клиентам
-- «пришли новинки» и поднимать ли товар в начало каталога.
alter table if exists purchases add column if not exists kind text;

-- ---------- ОПЛАТЫ ----------
alter table if exists payments add column if not exists method text;

-- ---------- НАСТРОЙКИ ----------
create table if not exists settings (
  id int primary key default 1,
  rate_yuan_usd numeric default 0.14,
  rate_som_usd numeric default 0.000079,
  rates_mode text default 'manual',
  rates_updated_at timestamptz default now()
);
alter table if exists settings add column if not exists telegram_channel text default '';
alter table if exists settings add column if not exists profit_pct jsonb;
alter table if exists settings add column if not exists profit_rules jsonb;
insert into settings (id) values (1) on conflict (id) do nothing;

-- ---------- КОРЗИНА ----------
-- Без неё удаление необратимо: восстанавливать будет нечего.
create table if not exists trash (
  id uuid primary key default gen_random_uuid(),
  entity text not null,               -- из какой таблицы удалили
  data jsonb not null,                -- сама удалённая запись целиком
  deleted_at timestamptz default now()
);
alter table trash enable row level security;
drop policy if exists admin_all on trash;
create policy admin_all on trash for all to authenticated using (true) with check (true);

-- ---------- ВИДЕО ----------
create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  title text,
  path text,
  product_id text,                    -- к какому товару привязано
  created_at timestamptz default now()
);
alter table if exists videos add column if not exists product_id text;
alter table videos enable row level security;
drop policy if exists admin_all on videos;
create policy admin_all on videos for all to authenticated using (true) with check (true);

-- ---------- БОТ ----------
create table if not exists bot_sessions (
  chat_id text primary key,
  lang text,
  updated_at timestamptz default now()
);
alter table if exists bot_sessions add column if not exists phone text;
alter table if exists bot_sessions add column if not exists tg_name text;
alter table if exists bot_sessions add column if not exists tg_username text;
alter table bot_sessions enable row level security;

-- ---------- ПРОВЕРКА ПОСЛЕ ЗАПУСКА ----------
-- Должно вернуть 0 строк. Если что-то вернулось — напишите мне, что именно.
select c.table_name::text as "таблица", o.col as "нет_колонки"
from (values
  ('products','sku'),('products','photos'),('products','batches'),('products','last_arrival_at'),
  ('customers','opening_debt'),('customers','phones'),
  ('sales','source'),('sales','order_from'),('sales','items'),
  ('purchases','kind'),('payments','method'),
  ('settings','profit_rules'),('trash','entity'),('videos','product_id')
) as o(tbl, col)
join information_schema.tables c
  on c.table_schema = 'public' and c.table_name = o.tbl
where not exists (
  select 1 from information_schema.columns k
  where k.table_schema = 'public' and k.table_name = o.tbl and k.column_name = o.col
);
