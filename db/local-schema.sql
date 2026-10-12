-- ========================================================================
--  СХЕМА ДЛЯ СВОЕЙ БАЗЫ (PostgreSQL на нашем сервере).
--
--  Снята с рабочей базы Supabase её же описанием (OpenAPI), поэтому
--  колонки и типы совпадают один в один — это не «написано по памяти».
--  Запускать можно сколько угодно раз: всё через "if not exists".
--
--  Данные сюда не входят: их переносит _tools/migrate-to-local.mjs,
--  он же сверяет количество строк в каждой таблице.
-- ========================================================================

create table if not exists payments (
  id uuid default gen_random_uuid(),
  customer_id uuid,
  amount numeric default 0,
  currency text default 'yuan',
  date timestamptz default now(),
  note text,
  created_at timestamptz default now(),
  method text,
  primary key (id)
);

create table if not exists customers (
  id uuid default gen_random_uuid(),
  name text,
  contact text,
  note text,
  tg_chat_id text,
  created_at timestamptz default now(),
  tg_lang text,
  opening_debt jsonb,
  phones jsonb,
  tg_chat_ids jsonb,
  tg_accounts jsonb,
  primary key (id)
);

create table if not exists settings (
  id integer default 1,
  rate_yuan_usd numeric default 0.14,
  rate_som_usd numeric default 0.000079,
  rates_mode text default 'manual',
  rates_updated_at timestamptz default now(),
  telegram_channel text default '',
  profit_pct jsonb,
  catalog_info jsonb,
  primary key (id)
);

create table if not exists videos (
  id uuid default gen_random_uuid(),
  title text,
  path text,
  created_at timestamptz default now(),
  product_id text,
  primary key (id)
);

create table if not exists site_accounts (
  id uuid default gen_random_uuid(),
  customer_id uuid,
  phone text,
  password_hash text,
  tg_verified boolean default false,
  created_at timestamptz default now(),
  last_login timestamptz,
  origin text,
  tg_username text,
  tg_nick text,
  session_id text,
  login_code text,
  login_code_exp timestamptz,
  login_attempts integer default 0,
  chat_id text,
  known_devices jsonb,
  primary key (id)
);

create table if not exists products (
  id uuid default gen_random_uuid(),
  name text,
  category text,
  photo_url text,
  stock_qty numeric default 0,
  cost_usd numeric default 0,
  cost_yuan numeric default 0,
  price_yuan numeric default 0,
  price_usd numeric default 0,
  price_som numeric default 0,
  status_override text,
  created_at timestamptz default now(),
  batches jsonb,
  cost_prev jsonb,
  site_status text,
  last_arrival_at timestamptz,
  photos jsonb,
  cost_cur text,
  sku text,
  cost_ack_yuan numeric,
  unit text default 'шт',
  pack_size numeric default 1,
  code text,
  primary key (id)
);

create table if not exists stock_log (
  id bigint,
  product_id text,
  name text,
  before_qty numeric,
  after_qty numeric,
  diff numeric,
  reason text,
  doc text,
  who text,
  created_at timestamptz default now(),
  primary key (id)
);

create table if not exists purchases (
  id uuid default gen_random_uuid(),
  supplier text,
  date timestamptz default now(),
  currency text default 'yuan',
  status text default 'in_transit',
  items jsonb,
  created_at timestamptz default now(),
  kind text,
  primary key (id)
);

create table if not exists sales (
  id uuid default gen_random_uuid(),
  customer_id uuid,
  date timestamptz default now(),
  currency text default 'yuan',
  status text default 'draft',
  telegram_sent boolean default false,
  items jsonb,
  created_at timestamptz default now(),
  boxes integer default 0,
  source text,
  order_from jsonb,
  primary key (id)
);

create table if not exists site_verifications (
  token text,
  phone text,
  chat_id text,
  verified boolean default false,
  expires_at timestamptz,
  created_at timestamptz default now(),
  tg_username text,
  primary key (token)
);

create table if not exists blocked_phones (
  phone text,
  reason text,
  blocked_at timestamptz default now(),
  blocked_by text default 'admin',
  primary key (phone)
);

create table if not exists bot_sessions (
  chat_id text,
  lang text,
  updated_at timestamptz default now(),
  state jsonb,
  phone text,
  tg_name text,
  tg_username text,
  primary key (chat_id)
);

create table if not exists trash (
  id uuid default gen_random_uuid(),
  entity text,
  data jsonb,
  deleted_at timestamptz default now(),
  created_at timestamptz default now(),
  primary key (id)
);

-- ---- Указатели (индексы): без них поиск по клиенту и датам медленный ----
create index if not exists sales_customer_idx    on sales (customer_id);
create index if not exists sales_date_idx        on sales (date desc);
create index if not exists payments_customer_idx on payments (customer_id);
create index if not exists products_created_idx  on products (created_at desc);
create index if not exists stock_log_product_idx on stock_log (product_id);
create index if not exists stock_log_created_idx on stock_log (created_at desc);
create index if not exists accounts_phone_idx    on site_accounts (phone);
create index if not exists accounts_customer_idx on site_accounts (customer_id);
create index if not exists trash_created_idx     on trash (created_at desc);

-- Один код товара — один товар (как в Supabase).
create unique index if not exists products_code_unique
  on products (code) where code is not null and code <> '';
