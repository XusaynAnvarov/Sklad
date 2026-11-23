-- ========================================================================
--  ИИ-АГЕНТЫ: состояние, прогоны, уведомления, согласования, расходы.
--
--  Пять агентов: склад, заказы, безопасность, Telegram, дизайн. Всё,
--  что они делают, оседает здесь: когда запускались, что нашли, что
--  ждёт вашего слова.
--
--  Главное правило, ради которого и нужны эти таблицы: агент НИЧЕГО не
--  меняет без подтверждения. Предложение ложится в agent_approvals со
--  статусом pending и ждёт. Пока вы не нажали «Одобрить», это просто
--  строка в базе.
--
--  Почему срок следующего запуска хранится в базе, а не в памяти
--  сервера: перезапуск процесса не должен ни пропускать работу, ни
--  делать её дважды. Захват работы — условное обновление строки
--  (running_until в прошлом), поэтому второй экземпляр сервера, если он
--  когда-нибудь появится, ту же задачу не возьмёт.
--
--  Применить: Supabase → SQL Editor → вставить файл → Run.
--  Повторный запуск безопасен. Ничего из существующего не трогает.
--  Пока файл не применён, агенты молчат и в разделе пишут об этом —
--  склад работает как раньше (образец такого поведения: api/lib/stocklog.js).
--
--  Откат — в самом низу файла, закомментирован.
-- ========================================================================

-- ------------------------------------------------------------------
--  1. СОСТОЯНИЕ АГЕНТА. Одна строка на агента.
--
--  running_until — до какого момента работа считается занятой (аренда).
--  Не NULL и по умолчанию 1970 год: так условие захвата пишется одним
--  сравнением «running_until < сейчас», без «или пусто». Это важно —
--  фильтр уходит в PostgREST строкой, и чем он проще, тем меньше мест,
--  где можно ошибиться.
--
--  Если прогон упал вместе с процессом и аренду никто не закрыл, она
--  протухает сама, и следующий тик заберёт работу заново.
-- ------------------------------------------------------------------
create table if not exists agent_state (
  id            text primary key,
  enabled       boolean     not null default true,
  schedule      jsonb       not null default '{}'::jsonb,
  config        jsonb       not null default '{}'::jsonb,
  next_run_at   timestamptz,
  last_run_at   timestamptz,
  last_ok_at    timestamptz,
  last_status   text,
  last_summary  text,
  running_until timestamptz not null default '1970-01-01T00:00:00Z',
  run_id        uuid,
  fails         integer     not null default 0,
  updated_at    timestamptz not null default now()
);
create index if not exists agent_state_due_idx on agent_state (next_run_at) where enabled;

-- ------------------------------------------------------------------
--  2. ПРОГОНЫ. Что агент делал и чем кончилось.
--  trigger: schedule | manual | chain      status: running | ok | error | skipped
-- ------------------------------------------------------------------
create table if not exists agent_runs (
  id          uuid primary key default gen_random_uuid(),
  agent_id    text        not null,
  trigger     text        not null default 'schedule',
  status      text        not null default 'running',
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  summary     text,
  details     jsonb,
  error       text
);
create index if not exists agent_runs_agent_idx on agent_runs (agent_id, started_at desc);

-- ------------------------------------------------------------------
--  3. СУБАГЕНТЫ. Шаги внутри одного прогона.
--
--  Большую задачу агент режет на части и выполняет их отдельными
--  шагами. Каждый шаг виден здесь: это и есть «Мои субагенты» на
--  карточке агента. Субагент не может получить прав больше, чем у
--  родителя (api/lib/agents/права.js) и не обходит согласования —
--  предложение всё равно ложится в agent_approvals.
-- ------------------------------------------------------------------
create table if not exists agent_subruns (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid        not null,
  agent_id    text        not null,
  name        text        not null,
  status      text        not null default 'running',
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  summary     text,
  details     jsonb,
  error       text
);
create index if not exists agent_subruns_run_idx on agent_subruns (run_id, started_at);

-- ------------------------------------------------------------------
--  4. УВЕДОМЛЕНИЯ. Они же шина между агентами.
--
--  dedup_key защищает от повторов: «товар кончился» про один и тот же
--  товар на одной и той же неделе пишется один раз, а не каждый прогон.
--  Уникальный индекс — именно по этому ключу, пустые не считаются.
--
--  Заказы кладут сюда kind='shortage', склад читает непрочитанные и
--  добавляет товар в рекомендации к закупке. Отдельной очереди задач
--  в проекте нет и не нужно.
-- ------------------------------------------------------------------
create table if not exists agent_notices (
  id         uuid primary key default gen_random_uuid(),
  agent_id   text        not null,
  kind       text        not null default 'info',
  level      text        not null default 'info',   -- info | warn | danger
  title      text        not null,
  body       text,
  dedup_key  text,
  payload    jsonb,
  seen_at    timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists agent_notices_dedup_idx on agent_notices (dedup_key) where dedup_key is not null;
create index if not exists agent_notices_fresh_idx on agent_notices (created_at desc);

-- ------------------------------------------------------------------
--  5. СОГЛАСОВАНИЯ. Единственная дверь, через которую агент что-то
--     меняет во внешнем мире.
--
--  kind: purchase | post | channel_setup | design | security_action | photo
--  status: pending | approved | rejected | scheduled | expired
--
--  idem_key уникален: двойное нажатие кнопки в Telegram не создаст
--  вторую закупку и не опубликует товар дважды.
-- ------------------------------------------------------------------
create table if not exists agent_approvals (
  id            uuid primary key default gen_random_uuid(),
  agent_id      text        not null,
  kind          text        not null,
  title         text        not null,
  payload       jsonb,
  status        text        not null default 'pending',
  scheduled_for timestamptz,
  decided_at    timestamptz,
  decided_by    text,
  decided_via   text,                                 -- admin | telegram
  result        jsonb,
  idem_key      text,
  created_at    timestamptz not null default now()
);
create unique index if not exists agent_approvals_idem_idx on agent_approvals (idem_key) where idem_key is not null;
create index if not exists agent_approvals_pending_idx on agent_approvals (status, created_at desc);

-- ------------------------------------------------------------------
--  6. РАСХОДЫ. Пока не подключён ни один платный сервис, таблица
--     пустая — но потолок должен существовать РАНЬШЕ, чем появится
--     первый платный вызов, а не после первого счёта.
--
--  period: day | month | total,  bucket: '2026-11-22' | '2026-11' | 'all'
-- ------------------------------------------------------------------
create table if not exists agent_budget (
  agent_id   text        not null,
  period     text        not null,
  bucket     text        not null,
  spent_usd  numeric     not null default 0,
  calls      integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (agent_id, period, bucket)
);

-- ------------------------------------------------------------------
--  ДОСТУП. Снаружи (anon / authenticated) таблицы не видны вовсе:
--  RLS включена, политик нет, права отозваны. Сервер ходит сервисным
--  ключом. Ровно как db/order-board-migration.sql.
-- ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['agent_state','agent_runs','agent_subruns','agent_notices','agent_approvals','agent_budget']
  loop
    execute format('alter table %I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table %I from anon, authenticated', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant all on table %I to service_role', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------
--  САМОПРОВЕРКА. Если что-то не создалось — Run покажет ошибку здесь,
--  а не через неделю в работе агента.
-- ------------------------------------------------------------------
do $$
declare нет text;
begin
  select string_agg(t, ', ') into нет
  from unnest(array['agent_state','agent_runs','agent_subruns','agent_notices','agent_approvals','agent_budget']) as t
  where to_regclass(t) is null;
  if нет is not null then
    raise exception 'Не создались таблицы: %', нет;
  end if;
  raise notice 'ИИ-агенты: все шесть таблиц на месте.';
end $$;

notify pgrst, 'reload schema';

-- ========================================================================
--  ОТКАТ (раскомментировать и выполнить). Теряется только история
--  агентов: склад, заказы, товары и клиенты к этим таблицам не привязаны.
--
--  drop table if exists agent_budget;
--  drop table if exists agent_approvals;
--  drop table if exists agent_notices;
--  drop table if exists agent_subruns;
--  drop table if exists agent_runs;
--  drop table if exists agent_state;
--  notify pgrst, 'reload schema';
-- ========================================================================
