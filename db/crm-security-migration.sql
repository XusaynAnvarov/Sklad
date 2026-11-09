-- ========================================================================
--  «КЛИЕНТЫ И БЕЗОПАСНОСТЬ»: CRM-карточки, журнал входов, события, аудит.
--
--  Безопасно для существующих данных: только create ... if not exists.
--  Ни одна старая таблица не меняется и не удаляется. Запускать можно
--  повторно сколько угодно раз.
--
--  Где запускать — в той базе, которая сейчас боевая:
--    • DB_MODE=supabase (по умолчанию) → Supabase → SQL Editor → Run;
--    • DB_MODE=local → на VPS:  psql -U sklad -d sklad -f db/crm-security-migration.sql
--  Перед запуском — резервная копия (_tools/backup-db.sh или кнопка
--  «Скачать копию» в настройках склада).
--
--  До запуска миграции сайт, склад и бот работают как раньше: новый код
--  ловит отсутствие таблиц и просто ничего не пишет.
-- ========================================================================

-- ---------- CRM-карточка человека ----------
-- Одна строка = один человек, который пришёл через бота или сайт.
-- customer_id заполнен → он уже клиент склада (карточка в «Клиентах»).
-- customer_id пуст → лид: поделился номером, но в складе его нет.
create table if not exists crm_clients (
  id              uuid primary key default gen_random_uuid(),
  num             bigserial,                 -- короткий номер для людей: «CRM ID 1058»
  customer_id     uuid,                      -- карточка склада, если привязан
  site_account_id uuid,                      -- аккаунт сайта, если есть

  -- Telegram (только то, что Telegram действительно передал)
  tg_user_id      text,
  tg_username     text,
  first_name      text,
  last_name       text,
  tg_lang         text,

  -- контакт
  phone           text,                      -- E.164, например +998901234567
  phone9          text,                      -- последние 9 цифр — так сверяет весь проект

  -- регистрация
  source          text,                      -- telegram | site
  entry_point     text,                      -- deeplink:qr_shop | campaign:… | site | …
  utm             jsonb,
  ref_code        text,
  link_status     text default 'started',    -- started | lead | linked | review
  status          text default 'new',        -- new | active | blocked | archived
  first_seen_at   timestamptz default now(), -- первое обращение к боту/сайту
  registered_at   timestamptz,               -- поделился номером / завершил регистрацию
  last_active_at  timestamptz default now(),
  consent_at      timestamptz,               -- когда принял уведомление о данных
  consent_version text,

  -- география (всегда приблизительная, кроме geo_source = 'location')
  country_code    text,
  country         text,
  region          text,
  city            text,
  geo_source      text,                      -- user_city | location | ip_cloudflare
  geo_accuracy    text,                      -- country | region | city | coords~10km
  geo_updated_at  timestamptz,

  admin_notes     text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
-- один Telegram-аккаунт — одна карточка: повторный /start не создаёт дубль
create unique index if not exists crm_clients_tg_unique on crm_clients (tg_user_id) where tg_user_id is not null;
create index if not exists crm_clients_phone9_idx   on crm_clients (phone9);
create index if not exists crm_clients_customer_idx on crm_clients (customer_id);
create index if not exists crm_clients_reg_idx      on crm_clients (registered_at desc);
alter table crm_clients enable row level security;   -- доступ только сервером (service key)

-- ---------- События: визиты, входы, регистрации, подозрительное ----------
create table if not exists client_events (
  id              uuid primary key default gen_random_uuid(),
  dedup_key       text,                      -- tg:<update_id> — повтор вебхука не пишет дважды
  crm_client_id   uuid,
  customer_id     uuid,
  site_account_id uuid,
  phone9          text,
  kind            text not null,             -- site_visit | login_ok | login_fail | login_code | register | verify_start | bot_start | bot_contact | bot_flood | location | impersonation
  channel         text,                      -- site | telegram | miniapp
  ok              boolean,
  path            text,
  referrer        text,
  utm             jsonb,

  -- IP хранится 30 дней (затем стирается автоматически), хэш — для поиска совпадений
  ip              text,
  ip_hash         text,
  country_code    text,
  country         text,
  region          text,
  city            text,
  geo_source      text,
  device          text,                      -- mobile | tablet | desktop | bot
  os              text,
  browser         text,
  ua              text,                      -- обрезано до 300 символов
  device_hash     text,                      -- хэш device_id сайта (новое ли устройство)

  risk            int default 0,             -- 0..100
  flags           jsonb,                     -- ["много неудачных входов", …]
  created_at      timestamptz default now()
);
create unique index if not exists client_events_dedup on client_events (dedup_key) where dedup_key is not null;
create index if not exists client_events_created_idx on client_events (created_at desc);
create index if not exists client_events_crm_idx     on client_events (crm_client_id);
create index if not exists client_events_cust_idx    on client_events (customer_id);
create index if not exists client_events_phone_idx   on client_events (phone9, kind, created_at desc);
create index if not exists client_events_iph_idx     on client_events (ip_hash, kind, created_at desc);
create index if not exists client_events_risk_idx    on client_events (risk, created_at desc);
alter table client_events enable row level security;

-- ---------- Журнал действий сотрудников ----------
create table if not exists crm_audit (
  id          uuid primary key default gen_random_uuid(),
  actor       text,                          -- кто (admin / guest не пускается)
  action      text,                          -- note | status | promote | link | forget
  target      text,                          -- id карточки CRM
  details     jsonb,                         -- что было → что стало
  created_at  timestamptz default now()
);
create index if not exists crm_audit_target_idx on crm_audit (target, created_at desc);
alter table crm_audit enable row level security;
