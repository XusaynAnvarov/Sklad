-- ========================================================================
--  «СНОВА В НАЛИЧИИ»: кто ждёт какой товар.
--
--  Клиент нажимает на сайте «Сообщить, когда появится» (или пишет боту
--  магазина) — здесь появляется строка: какой товар и в какой чат
--  Telegram написать. Когда товар снова есть на складе, бот магазина
--  пишет этому клиенту ОДИН раз и ставит отметку notified_at.
--
--  Что храним и почему так мало: только номер чата Telegram, который
--  клиент сам открыл, нажав кнопку. Ни телефона, ни имени здесь нет.
--  Клиент может отказаться кнопкой «Не ждать» — тогда canceled_at.
--
--  Применить: Supabase → SQL Editor → вставить файл → Run.
--  Повторный запуск безопасен. Ничего из существующего не трогает.
--  Пока файл не применён, кнопка на сайте и бот работают как раньше,
--  а подписка честно отвечает «пока недоступно».
--
--  Откат — в самом низу файла, закомментирован.
-- ========================================================================

create table if not exists stock_wait (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id) on delete cascade,
  chat_id     bigint not null,
  source      text not null default 'bot',
  lang        text,
  created_at  timestamptz not null default now(),
  notified_at timestamptz,
  canceled_at timestamptz,
  constraint stock_wait_source_ok check (source in ('bot', 'site'))
);

-- Один и тот же человек ждёт один товар только один раз: повторное
-- нажатие не плодит строк и не приведёт к двум одинаковым сообщениям.
create unique index if not exists stock_wait_active
  on stock_wait (product_id, chat_id)
  where notified_at is null and canceled_at is null;

-- Рассыльщику нужны только активные ожидания.
create index if not exists stock_wait_pending
  on stock_wait (product_id)
  where notified_at is null and canceled_at is null;

-- Доступ только у сервера (service_role). С сайта напрямую — никак.
alter table stock_wait enable row level security;
revoke all on table stock_wait from anon, authenticated;

do $$
begin
  if to_regclass('public.stock_wait') is not null then
    raise notice '«Снова в наличии»: таблица stock_wait на месте.';
  end if;
end $$;

-- ========================================================================
--  ОТКАТ (раскомментировать и выполнить). Теряется только список тех,
--  кто ждёт товар; склад и заказы не затрагиваются.
-- ========================================================================
-- drop table if exists stock_wait;
