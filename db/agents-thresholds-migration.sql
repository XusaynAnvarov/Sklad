-- ========================================================================
--  ПОРОГИ ЗАКУПКИ ПО ТОВАРУ.
--
--  Светофор остатков у каждого товара свой. Лапке по доллару хватает
--  недельного запаса, а раскройной машине за 235 $ — своего: её везут
--  месяц, и «кончилась» значит потерянную продажу на месяц вперёд.
--
--  Пустая строка = «считай по общему правилу». Заводить запись нужно
--  только там, где общее правило не подходит, — поэтому таблица
--  останется маленькой.
--
--  Отдельной таблицей, а не колонками в products: products и так из
--  тридцати колонок, а пороги меняются редко и нужны одному агенту.
--
--  Срок поставки (lead_days) обычно заполнять НЕ НУЖНО: агент считает
--  его сам по истории приходов — разница между датой документа и
--  «приход.когда». Поле здесь на случай, когда история врёт или её нет.
--
--  Применить: Supabase → SQL Editor → вставить файл → Run.
--  Повторный запуск безопасен. В products не меняется ни строки.
--  Откат — в самом низу, закомментирован.
-- ========================================================================

create table if not exists product_policy (
  product_id  uuid primary key references products(id) on delete cascade,
  -- На сколько дней держать запас сверх срока поставки.
  min_days    integer,
  -- Неснижаемый остаток в штуках, если дни считать нечем.
  safety_qty  numeric,
  -- Срок поставки в днях. Пусто — агент берёт из истории приходов.
  lead_days   integer,
  -- У кого заказываем. Пусто — агент берёт последнего, кто привозил.
  supplier    text,
  -- Товар закупке не подлежит: снят с продажи, заказной, разовый.
  never_order boolean not null default false,
  reason      text,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  constraint product_policy_min_days_ok  check (min_days  is null or (min_days  >= 0 and min_days  <= 365)),
  constraint product_policy_lead_days_ok check (lead_days is null or (lead_days >= 0 and lead_days <= 365)),
  constraint product_policy_safety_ok    check (safety_qty is null or safety_qty >= 0)
);

-- Список «не заказывать» агент читает на каждом прогоне.
create index if not exists product_policy_never_idx on product_policy (never_order) where never_order;

-- ------------------------------------------------------------------
--  ДОСТУП. Снаружи не видна: RLS включена, политик нет, права отозваны.
--  Сервер ходит сервисным ключом — как agent_* и product_fact.
-- ------------------------------------------------------------------
do $$
begin
  execute 'alter table product_policy enable row level security';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on table product_policy from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant all on table product_policy to service_role';
  end if;
end $$;

-- ------------------------------------------------------------------
--  САМОПРОВЕРКА
-- ------------------------------------------------------------------
do $$
begin
  if to_regclass('product_policy') is null then
    raise exception 'Таблица product_policy не создалась';
  end if;
  raise notice 'Пороги закупки: таблица на месте. Записей: %', (select count(*) from product_policy);
end $$;

notify pgrst, 'reload schema';

-- ========================================================================
--  ОТКАТ (раскомментировать и выполнить). Теряются только пороги;
--  агент вернётся к общему правилу для всех товаров.
--
--  drop table if exists product_policy;
--  notify pgrst, 'reload schema';
-- ========================================================================
