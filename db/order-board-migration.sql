-- ========================================================================
--  ДОСКА СБОРКИ: ручной порядок карточек и отметка «срочно».
--
--  Отдельно от этапов (order_fulfillment) и от журнала: перестановка
--  карточки внутри колонки — не событие статуса, в историю заказа не
--  попадает и этап не меняет. Таблицу sales не трогает.
--
--  sort_key — место в ручном порядке колонки (меньше = выше). Карточки
--  без ключа идут после упорядоченных (в «Отправленных» — над ними,
--  свежие сверху). Сервер переписывает ключи колонки целиком при каждой
--  перестановке.
--
--  Применить: Supabase → SQL Editor → вставить файл → Run. Повторный запуск
--  безопасен. Нужна уже применённая db/order-fulfillment-migration.sql.
--  Откат: drop table if exists order_board;  (теряется только порядок)
-- ========================================================================
create table if not exists order_board (
  sale_id    uuid primary key,
  sort_key   double precision,
  urgent     boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text
);
create index if not exists order_board_sort_idx on order_board (sort_key);

-- Снаружи (anon / authenticated) не видна: RLS без политик, сервер ходит
-- сервисным ключом.
alter table order_board enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table order_board from anon, authenticated';
  end if;
end $$;

notify pgrst, 'reload schema';
