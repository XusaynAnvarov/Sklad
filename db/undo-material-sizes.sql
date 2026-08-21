-- ========================================================================
--  УБРАТЬ ЛИШНЕЕ: material_cost и sizes в products.
--
--  Колонки добавлены вручную и НИГДЕ в коде не используются — проверено
--  поиском по всему проекту (js/, api/, db/): ни одного упоминания.
--
--  Ничего делать руками не нужно. Скрипт сам:
--    1) смотрит, есть ли эти колонки вообще;
--    2) проверяет, пусто ли в них;
--    3) удаляет ТОЛЬКО если пусто;
--    4) если там что-то есть — НЕ удаляет и говорит об этом.
--
--  Всё внутри одной транзакции: при отказе не удаляется ничего.
--
--  Supabase → SQL Editor → вставить весь файл → Run.
-- ========================================================================

do $$
declare
  есть_material boolean;
  есть_sizes    boolean;
  занято        bigint := 0;
  n             bigint;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'material_cost'
  ) into есть_material;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'sizes'
  ) into есть_sizes;

  if not есть_material and not есть_sizes then
    raise notice 'Этих колонок уже нет — делать нечего.';
    return;
  end if;

  -- Считаем строки, где что-то записано. Запросы собираем строкой: если
  -- колонки нет, обычный запрос не прошёл бы даже разбор.
  if есть_material then
    execute 'select count(*) from public.products where material_cost is distinct from 0' into n;
    занято := занято + n;
  end if;

  if есть_sizes then
    execute $q$ select count(*) from public.products where sizes is not null and sizes <> '' $q$ into n;
    занято := занято + n;
  end if;

  -- Есть данные — не трогаем. Удалить колонку с данными нельзя молча:
  -- вернуть их потом будет неоткуда.
  if занято > 0 then
    raise exception 'НЕ УДАЛЯЮ: в этих колонках есть данные (строк: %). Сначала посмотрите, что там.', занято;
  end if;

  if есть_material then
    execute 'alter table public.products drop column material_cost';
  end if;
  if есть_sizes then
    execute 'alter table public.products drop column sizes';
  end if;

  raise notice 'Готово: лишние колонки удалены.';
end $$;

-- Итог — его и покажет Supabase в окне результата.
select
  case
    when count(*) = 0 then 'ГОТОВО: material_cost и sizes убраны, лишнего в products нет'
    else 'ОСТАЛОСЬ: ' || string_agg(column_name, ', ')
  end as "результат"
from information_schema.columns
where table_schema = 'public'
  and table_name = 'products'
  and column_name in ('material_cost', 'sizes');
