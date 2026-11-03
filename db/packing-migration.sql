-- ========================================================================
--  УПАКОВКИ ТОВАРА: в чём покупаем, в чём храним, в чём продаём.
--
--  Поставщик продаёт шпульки поштучно, а на полке они лежат пачками по 10
--  и пачками уходят клиенту. Раньше этот пересчёт делался в уме при
--  каждом приходе. Теперь он настраивается один раз на товар.
--
--  ЧТО ЭТА МИГРАЦИЯ ДЕЛАЕТ: добавляет семь колонок. И ВСЁ.
--  Она НЕ трогает ни остатки, ни себестоимость, ни партии, ни старые
--  приходы. Ни одной строки с данными она не меняет — только описание
--  таблицы. Поэтому откатить её можно, просто удалив колонки (внизу).
--
--  ПОСЛЕ НЕЁ ВСЕ ТОВАРЫ СЧИТАЮТСЯ «НЕ НАСТРОЕННЫМИ» (packing_ver = 0) и
--  приходуются ровно так же, как до неё — старым, безопасным путём.
--  Автопреобразование включается только у тех товаров, где владелец сам
--  сохранил упаковку в карточке.
--
--  Уже существующие unit и pack_size НЕ ТРОГАЕМ: они заведены миграцией
--  db/unit-migration.sql и означают то же, что и раньше — в чём считается
--  остаток и сколько штук внутри одной такой единицы.
--
--  Запускать можно сколько угодно раз: всё через "if not exists".
--  Supabase → SQL Editor → Run. Своя база → psql.
-- ========================================================================

-- В чём берём у поставщика: «шт», «пачка», «коробка», …
-- Пусто — значит так же, как храним (пересчитывать нечего).
alter table if exists products add column if not exists buy_unit text;

-- В чём продаём. Пусто — так же, как храним.
alter table if exists products add column if not exists sell_unit text;

-- Сколько СКЛАДСКИХ единиц в одной коробке (пачек в коробке).
-- Пусто — коробками не считаем.
alter table if exists products add column if not exists box_size numeric;

-- Какие единицы продажи вообще разрешены этому товару: ["пачка","шт"].
alter table if exists products add column if not exists sell_units jsonb;

-- Пересчитывать ли приход автоматически. По умолчанию ВЫКЛЮЧЕНО:
-- пока владелец не проверил упаковку, трогать приходы нельзя.
alter table if exists products add column if not exists auto_convert boolean default false;

-- Что делать с неполной упаковкой (105 штук при пачке по 10):
--   keep   — оставить как есть: 10 пачек и 5 штук   (по умолчанию)
--   pieces — разрешить продажу поштучно
--   wait   — отложить остаток до следующего прихода
--   ask    — спрашивать подтверждение
alter table if exists products add column if not exists odd_rule text default 'keep';

-- Версия настроек упаковки. 0 — упаковку ещё не настраивали.
-- Растёт на единицу при каждом сохранении. Приход запоминает её у себя,
-- поэтому поменянный потом коэффициент НЕ переписывает старые документы.
alter table if exists products add column if not exists packing_ver integer default 0;

-- У всех, кто заведён раньше, упаковка не настроена — так и помечаем.
-- Это единственная запись данных во всей миграции, и она ставит ноль
-- там, где значения нет вовсе.
update products set packing_ver = 0 where packing_ver is null;
update products set auto_convert = false where auto_convert is null;
update products set odd_rule = 'keep' where odd_rule is null;

-- Коробка и упаковка — это количество, отрицательным оно быть не может.
-- Ограничение не проверяет уже лежащие строки (not valid): миграция не
-- должна падать из-за данных, которых мы ещё не видели.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_box_size_positive') then
    alter table products add constraint products_box_size_positive
      check (box_size is null or box_size > 0) not valid;
  end if;
end $$;

-- Список «ещё не настроенных» открывают часто — по нему идёт вся работа
-- по наведению порядка. Указатель только на тех, кого надо настроить.
create index if not exists products_packing_todo_idx
  on products (packing_ver) where packing_ver = 0 or packing_ver is null;


-- ---------------- ПРОВЕРКА ----------------
-- 1) Колонки на месте. Должно вернуть 7 строк.
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'products'
  and column_name in ('buy_unit','sell_unit','box_size','sell_units','auto_convert','odd_rule','packing_ver')
order by column_name;

-- 2) Остатки НЕ изменились. Сравните эти числа с теми, что были до
--    миграции (снимите их заранее этим же запросом).
select count(*) as товаров,
       sum(coalesce(stock_qty, 0)) as сумма_остатков,
       sum(coalesce(stock_qty, 0) * coalesce(cost_usd, 0)) as стоимость_запасов_usd
from products;

-- 3) Настроенных пока нет — так и должно быть. Должно вернуть 0.
select count(*) as настроенных from products where coalesce(packing_ver, 0) > 0;


-- ---------------- ОТКАТ ----------------
-- Если что-то пошло не так. Данные при этом не пострадают: удаляются
-- только те колонки, которых до миграции не было.
--
-- alter table products drop constraint if exists products_box_size_positive;
-- drop index if exists products_packing_todo_idx;
-- alter table products drop column if exists buy_unit;
-- alter table products drop column if exists sell_unit;
-- alter table products drop column if exists box_size;
-- alter table products drop column if exists sell_units;
-- alter table products drop column if exists auto_convert;
-- alter table products drop column if exists odd_rule;
-- alter table products drop column if exists packing_ver;
