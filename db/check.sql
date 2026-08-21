-- ========================================================================
--  ПРОВЕРКА БАЗЫ — что есть, чего не хватает, что лишнее.
--
--  Запрос НИЧЕГО НЕ МЕНЯЕТ. Только смотрит и отвечает.
--  Supabase → SQL Editor → вставить весь файл → Run.
--
--  Это ОДИН запрос: редактор Supabase показывает результат только
--  последнего, поэтому все три отчёта собраны в одну таблицу.
--
--  В колонке «что» будет:
--    НЕТ ТАБЛИЦЫ   — таблицу надо создать
--    НЕТ КОЛОНКИ   — код её ждёт, а её нет: функция молча не работает
--    ЛИШНЕЕ        — код этого не ждёт (возможно, добавили зря)
--  Если вернулось 0 строк — база полностью совпадает с кодом.
-- ========================================================================

with
-- какие таблицы должны быть
need_tables(tbl, why) as (values
  ('products',           'товары'),
  ('customers',          'клиенты'),
  ('sales',              'накладные и заказы'),
  ('purchases',          'приходы'),
  ('payments',           'оплаты'),
  ('settings',           'курсы валют и настройки'),
  ('trash',              'корзина: без неё удаление не восстановить'),
  ('videos',             'видео запчастей'),
  ('bot_sessions',       'язык в боте до привязки клиента'),
  ('site_accounts',      'входы клиентов на сайт'),
  ('site_verifications', 'коды подтверждения при входе'),
  ('blocked_phones',     'заблокированные номера')
),
-- какие колонки должны быть
need_cols(tbl, col, why) as (values
  ('products','id','ключ'),
  ('products','name','название'),
  ('products','category','категория'),
  ('products','sku','артикул: поиск и наклейки'),
  ('products','photo_url','главное фото'),
  ('products','photos','несколько фото'),
  ('products','stock_qty','ОСТАТОК (именно stock_qty, не remainder)'),
  ('products','cost_yuan','себестоимость в юанях'),
  ('products','cost_usd','себестоимость в долларах'),
  ('products','cost_cur','валюта прихода'),
  ('products','price_yuan','цена продажи в юанях'),
  ('products','price_usd','цена продажи в долларах'),
  ('products','price_som','цена продажи в сумах'),
  ('products','status_override','статус в каталоге вручную'),
  ('products','batches','FIFO-партии: на них держится себестоимость и прибыль'),
  ('products','last_arrival_at','дата прихода: поднимает товар в новинки'),
  ('products','created_at','когда заведён'),

  ('customers','id','ключ'),
  ('customers','name','имя'),
  ('customers','contact','телефон'),
  ('customers','note','заметка'),
  ('customers','phones','несколько телефонов'),
  ('customers','tg_chat_id','чат в Telegram'),
  ('customers','tg_chat_ids','несколько чатов'),
  ('customers','tg_accounts','привязанные аккаунты'),
  ('customers','tg_lang','язык в боте'),
  ('customers','opening_debt','СТАРЫЙ ДОЛГ до системы — входит в общий долг клиента'),
  ('customers','created_at','когда заведён'),

  ('sales','id','ключ'),
  ('sales','customer_id','клиент'),
  ('sales','date','дата'),
  ('sales','currency','валюта'),
  ('sales','status','final / order / draft'),
  ('sales','source','откуда: прилавок, телефон, бот, сайт'),
  ('sales','order_from','кто заказал, если это не наш клиент'),
  ('sales','telegram_sent','отправлена ли клиенту'),
  ('sales','boxes','сколько коробок'),
  ('sales','items','ПОЗИЦИИ: цены, себестоимость, отметка о списании'),
  ('sales','created_at','когда создана'),

  ('purchases','id','ключ'),
  ('purchases','supplier','поставщик или магазин'),
  ('purchases','kind','поставка или магазин: от этого зависит рассылка и новинки'),
  ('purchases','date','дата'),
  ('purchases','currency','валюта'),
  ('purchases','status','in_transit / arrived'),
  ('purchases','items','позиции'),
  ('purchases','created_at','когда создан'),

  ('payments','id','ключ'),
  ('payments','customer_id','клиент'),
  ('payments','amount','сумма'),
  ('payments','currency','валюта'),
  ('payments','method','наличные, карта, перевод'),
  ('payments','date','дата'),
  ('payments','note','примечание'),
  ('payments','created_at','когда создана'),

  ('settings','id','всегда 1'),
  ('settings','rate_yuan_usd','курс юаня'),
  ('settings','rate_som_usd','курс сума'),
  ('settings','rates_mode','ручной или авто'),
  ('settings','rates_updated_at','когда обновляли курсы'),
  ('settings','telegram_channel','канал для накладных'),
  ('settings','profit_pct','общий процент прибыли'),
  ('settings','profit_rules','правила прибыли по товарам'),

  ('trash','id','ключ'),
  ('trash','entity','из какой таблицы удалили'),
  ('trash','data','сама удалённая запись'),
  ('trash','deleted_at','когда удалили'),

  ('videos','id','ключ'),
  ('videos','title','название'),
  ('videos','product_id','к какому товару привязано'),
  ('videos','created_at','когда загружено'),

  ('bot_sessions','chat_id','ключ'),
  ('bot_sessions','lang','язык')
),
-- колонки, которые код знает (всё остальное в наших таблицах — лишнее)
known_cols(tbl, col) as (values
  ('products','id'),('products','name'),('products','category'),('products','sku'),
  ('products','photo_url'),('products','photos'),('products','stock_qty'),
  ('products','cost_yuan'),('products','cost_usd'),('products','cost_cur'),('products','cost_ack_yuan'),
  ('products','price_yuan'),('products','price_usd'),('products','price_som'),
  ('products','status_override'),('products','site_status'),('products','batches'),
  ('products','last_arrival_at'),('products','created_at'),('products','updated_at'),

  ('customers','id'),('customers','name'),('customers','contact'),('customers','note'),
  ('customers','phones'),('customers','tg_chat_id'),('customers','tg_chat_ids'),
  ('customers','tg_accounts'),('customers','tg_lang'),('customers','opening_debt'),
  ('customers','created_at'),('customers','updated_at'),('customers','origin'),
  ('customers','tg_username'),('customers','label'),

  ('sales','id'),('sales','customer_id'),('sales','date'),('sales','currency'),
  ('sales','status'),('sales','source'),('sales','order_from'),('sales','telegram_sent'),
  ('sales','boxes'),('sales','items'),('sales','created_at'),('sales','updated_at'),

  ('purchases','id'),('purchases','supplier'),('purchases','kind'),('purchases','date'),
  ('purchases','currency'),('purchases','status'),('purchases','items'),
  ('purchases','created_at'),('purchases','updated_at'),('purchases','expenses'),

  ('payments','id'),('payments','customer_id'),('payments','amount'),('payments','currency'),
  ('payments','method'),('payments','date'),('payments','note'),('payments','created_at'),

  ('settings','id'),('settings','rate_yuan_usd'),('settings','rate_som_usd'),
  ('settings','rates_mode'),('settings','rates_updated_at'),('settings','telegram_channel'),
  ('settings','profit_pct'),('settings','profit_rules'),

  ('trash','id'),('trash','entity'),('trash','data'),('trash','deleted_at'),

  ('videos','id'),('videos','title'),('videos','product_id'),('videos','path'),
  ('videos','created_at'),('videos','poster'),('videos','duration'),

  ('bot_sessions','chat_id'),('bot_sessions','lang'),('bot_sessions','updated_at'),
  ('bot_sessions','phone'),('bot_sessions','tg_name'),('bot_sessions','tg_username')
),
have_tables(tbl) as (
  select table_name::text from information_schema.tables where table_schema = 'public'
),
have_cols(tbl, col) as (
  select table_name::text, column_name::text from information_schema.columns where table_schema = 'public'
)

-- 1) нет таблицы
select 1 as "№", 'НЕТ ТАБЛИЦЫ' as "что", n.tbl as "таблица", '' as "колонка", n.why as "зачем нужно"
from need_tables n
where n.tbl not in (select tbl from have_tables)

union all

-- 2) нет колонки (только в таблицах, которые существуют)
select 2, 'НЕТ КОЛОНКИ', n.tbl, n.col, n.why
from need_cols n
where n.tbl in (select tbl from have_tables)
  and (n.tbl, n.col) not in (select tbl, col from have_cols)

union all

-- 3) лишнее — код этого не ждёт
select 3, 'ЛИШНЕЕ', c.tbl, c.col, 'код этого не использует — возможно, добавлено зря'
from have_cols c
where c.tbl in ('products','customers','sales','purchases','payments','settings','trash','videos','bot_sessions')
  and (c.tbl, c.col) not in (select tbl, col from known_cols)

order by 1, 3, 4;
