-- ========================================================================
--  СХЕМА БАЗЫ ДАННЫХ ДЛЯ SUPABASE
--  Откройте Supabase → SQL Editor → вставьте этот файл → Run.
-- ========================================================================

-- ---------- Таблицы ----------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  photo_url text,
  stock_qty numeric default 0,
  cost_usd numeric default 0,
  cost_yuan numeric default 0,
  price_yuan numeric default 0,
  price_usd numeric default 0,
  price_som numeric default 0,
  status_override text,            -- null = авто по остатку
  batches jsonb default '[]'::jsonb, -- FIFO-партии: [{qty,cost_yuan,cost_usd,date}]
  created_at timestamptz default now()
);
alter table products add column if not exists batches jsonb default '[]'::jsonb;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  note text,
  tg_chat_id text,                 -- chat_id клиента в Telegram (для отправки накладных)
  opening_debt jsonb default '{}'::jsonb, -- старый долг до системы {som,usd,yuan}
  created_at timestamptz default now()
);
alter table customers add column if not exists tg_chat_id text;
alter table customers add column if not exists opening_debt jsonb default '{}'::jsonb;

-- язык клиента в боте + сессии бота (выбранный язык до привязки)
alter table customers add column if not exists tg_lang text;
create table if not exists bot_sessions (
  chat_id text primary key,
  lang text,
  updated_at timestamptz default now()
);
alter table bot_sessions enable row level security;

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  amount numeric default 0,
  currency text default 'yuan',    -- yuan | usd | som
  date timestamptz default now(),
  note text,
  created_at timestamptz default now()
);

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  date timestamptz default now(),
  currency text default 'yuan',    -- yuan | usd | som
  status text default 'draft',     -- draft | final
  telegram_sent boolean default false,
  boxes integer default 0,         -- сколько коробок отправлено
  items jsonb default '[]'::jsonb, -- [{product_id, qty, unit_price, currency, price_yuan_norm, paid}]
  created_at timestamptz default now()
);
alter table sales add column if not exists boxes integer default 0;

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  supplier text,
  date timestamptz default now(),
  currency text default 'yuan',    -- usd | yuan
  status text default 'in_transit',-- in_transit | arrived
  items jsonb default '[]'::jsonb, -- [{product_id, qty, unit_cost, currency}]
  created_at timestamptz default now()
);

create table if not exists settings (
  id int primary key default 1,
  rate_yuan_usd numeric default 0.14,
  rate_som_usd numeric default 0.000079,
  rates_mode text default 'manual',
  rates_updated_at timestamptz default now(),
  telegram_channel text default ''
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- ---------- Публичный каталог (без цен) ----------
-- security_invoker = on → вью работает с правами читающего (anon), а не создателя.
drop view if exists catalog_view;
create view catalog_view with (security_invoker = on) as
  select name, category, photo_url,
         case when coalesce(status_override,'') <> '' then status_override
              when stock_qty > 0 then 'in_stock' else 'on_order' end as status
  from products;
grant select on catalog_view to anon, authenticated;

-- ---------- Storage: бакет для фото ----------
insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', true)
on conflict (id) do nothing;

-- ========================================================================
--  RLS (Row Level Security)
--  Рабочие таблицы доступны только авторизованному админу.
--  Каталог (view) и фото — публичны на чтение.
-- ========================================================================
alter table products  enable row level security;
alter table customers enable row level security;
alter table sales     enable row level security;
alter table purchases enable row level security;
alter table payments  enable row level security;
alter table settings  enable row level security;

-- доступ для авторизованных пользователей (один аккаунт-админ)
do $$
declare t text;
begin
  foreach t in array array['products','customers','sales','purchases','payments','settings'] loop
    execute format('drop policy if exists admin_all on %I;', t);
    execute format('create policy admin_all on %I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- публичное чтение каталога: аноним видит ТОЛЬКО безопасные колонки products
-- (без price_* и cost_*). Это закрывает утечку цен и убирает SECURITY DEFINER.
revoke select on products from anon;
grant select (name, category, photo_url, stock_qty, status_override) on products to anon;
drop policy if exists public_read_products on products;
create policy public_read_products on products for select to anon using (true);

-- публичное чтение фото из бакета
drop policy if exists public_photos on storage.objects;
create policy public_photos on storage.objects for select to anon
  using (bucket_id = 'product-photos');
-- загрузка фото — только админ
drop policy if exists admin_upload_photos on storage.objects;
create policy admin_upload_photos on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos');
