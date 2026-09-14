-- ========================================================================
--  ПЕЧАТНЫЙ КАТАЛОГ: постоянные коды товаров и настройки каталога.
--
--  products.code          — постоянный код товара вида LP-017. Клиент пишет
--                           его, листая каталог, и владелец сразу находит
--                           товар. Выданный код не меняется никогда.
--  settings.catalog_info  — контакты, тексты и переводы разделов для
--                           печатного каталога.
--
--  Запускать можно сколько угодно раз. Supabase → SQL Editor → Run.
--  Коды здесь НЕ раздаются: это делает склад, сперва показав список.
-- ========================================================================

alter table if exists products add column if not exists code text;

-- Один код — один товар. Пустые коды не мешают друг другу.
create unique index if not exists products_code_unique
  on products (code)
  where code is not null and code <> '';

alter table if exists settings add column if not exists catalog_info jsonb default '{}'::jsonb;
update settings set catalog_info = '{}'::jsonb where catalog_info is null;

-- Проверка: обе строки должны вернуться.
select table_name, column_name
from information_schema.columns
where (table_name = 'products' and column_name = 'code')
   or (table_name = 'settings' and column_name = 'catalog_info');
