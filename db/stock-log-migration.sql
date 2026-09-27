-- ========================================================================
--  ЖУРНАЛ ИЗМЕНЕНИЙ ОСТАТКОВ.
--
--  Сейчас склад хранит только нынешний остаток. Если он изменился, узнать
--  когда и почему — неоткуда: «Проверка склада» может показать расхождение,
--  но не историю. Из-за этого нельзя ответить на простой вопрос:
--  «откуда взялись эти 300 штук и кто их добавил».
--
--  Таблица пишется сервером при каждой записи остатка: и со склада на
--  сайте, и из телефона. Ничего не удаляет и ни на что не влияет — только
--  запоминает.
--
--  Запускать можно сколько угодно раз. Supabase → SQL Editor → Run.
-- ========================================================================

create table if not exists stock_log (
  id          bigserial primary key,
  product_id  text        not null,
  name        text,                     -- название на момент записи
  before_qty  numeric,                  -- было
  after_qty   numeric,                  -- стало
  diff        numeric,                  -- разница (+ пришло, − ушло)
  reason      text,                     -- причина: приход, накладная, правка карточки…
  doc         text,                     -- номер документа, если он известен
  who         text,                     -- кто записал: admin / guest / bot
  created_at  timestamptz not null default now()
);

create index if not exists stock_log_product_idx on stock_log (product_id, created_at desc);
create index if not exists stock_log_time_idx    on stock_log (created_at desc);

-- Проверка: таблица должна найтись.
select table_name, column_name
from information_schema.columns
where table_name = 'stock_log' and column_name in ('product_id', 'diff', 'reason')
order by column_name;
