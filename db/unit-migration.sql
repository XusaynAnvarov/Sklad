-- ========================================================================
--  ЕДИНИЦА ИЗМЕРЕНИЯ ТОВАРА
--
--  Товар считают штуками, пачками, коробками. Раньше всё считалось в
--  штуках, и перевод «4800 шт → 400 пачек» приходилось делать руками,
--  пересчитывая ещё и себестоимость.
--
--  unit      — в чём считаем и продаём: шт, пачка, коробка, набор, …
--  pack_size — сколько штук внутри одной такой единицы (у штук это 1)
--
--  Запускать можно сколько угодно раз. Supabase → SQL Editor → Run.
-- ========================================================================

alter table if exists products add column if not exists unit text default 'шт';
alter table if exists products add column if not exists pack_size numeric default 1;

-- У всех, кто заведён раньше, единица — штука.
update products set unit = 'шт' where unit is null;
update products set pack_size = 1 where pack_size is null or pack_size <= 0;

-- Проверка: должно вернуть 0 строк.
select id, name, unit, pack_size
from products
where unit is null or pack_size is null or pack_size <= 0;
