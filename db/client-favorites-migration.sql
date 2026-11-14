-- ========================================================================
--  ИЗБРАННОЕ КЛИЕНТА — общее для телефона и компьютера.
--  Запустить один раз в Supabase → SQL Editor. Повторный запуск безопасен.
--
--  До запуска кабинет держит избранное только в браузере (как раньше).
--  После — сам перенесёт то, что уже отмечено на устройстве, в базу.
--  Ключ id = «клиент:товар» — одна колонка, чтобы «перезаписать, если есть»
--  одинаково работало и в Supabase, и в своей базе (api/lib/pg.js).
-- ========================================================================
create table if not exists client_favorites (
  id          text primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  product_id  uuid not null,
  created_at  timestamptz not null default now()
);
create index if not exists client_favorites_customer_idx on client_favorites (customer_id);

-- Доступ только с сервера (ключ service_role обходит RLS); из браузера — никак.
alter table client_favorites enable row level security;
