-- ========================================================================
--  ОТМЕНИТЬ ЛИШНЕЕ: material_cost и sizes в products.
--
--  Эти две колонки были добавлены вручную и НИГДЕ в коде не используются.
--  Проверено поиском по всему проекту (js/, api/, db/): ни одного упоминания.
--
--  Что при этом теряется: ничего. material_cost был добавлен со значением
--  по умолчанию 0 и во всех строках стоит 0; sizes пустой.
--
--  Supabase → SQL Editor → вставить → Run.
-- ========================================================================

-- Сначала посмотрите, что там действительно пусто. Должно вернуть 0.
-- Если вернётся не 0 — НЕ удаляйте, напишите мне: значит, туда что-то попало.
select
  count(*) filter (where material_cost is distinct from 0) as "material_cost не ноль",
  count(*) filter (where sizes is not null and sizes <> '') as "sizes заполнен"
from public.products;

-- Убедились, что нули? Тогда выполните две строки ниже.
-- ------------------------------------------------------------------
-- alter table public.products drop column if exists material_cost;
-- alter table public.products drop column if exists sizes;
-- ------------------------------------------------------------------

-- Проверка после удаления: должно вернуть 0 строк.
-- select column_name from information_schema.columns
-- where table_schema = 'public' and table_name = 'products'
--   and column_name in ('material_cost', 'sizes');
