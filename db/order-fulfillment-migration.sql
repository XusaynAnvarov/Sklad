-- ========================================================================
--  СБОРКА И ОТПРАВКА ЗАКАЗОВ — три этапа после «Оформить (склад + PDF)».
--
--    placed  — оформлен, не собран        (накладная выписана, товар списан)
--    packed  — оформлен, собран, не отправлен
--    shipped — оформлен, собран и отправлен
--
--  ЧТО ВАЖНО:
--  • Остатки склада здесь НЕ трогаются никогда. Товар списан один раз — в
--    момент «Оформить». Сборка и отправка — только отметки, поэтому двойного
--    списания не бывает в принципе.
--  • Статус оплаты (items[].paid) и суммы накладной не читаются и не
--    меняются. Таблица sales не изменяется вовсе.
--  • Переходы делает ТОЛЬКО функция fulfillment_transition: она блокирует
--    строку заказа, сверяет ожидаемый этап (двое сотрудников не подтвердят
--    одно и то же дважды), не даёт перескочить этап и в той же транзакции
--    пишет журнал.
--  • Журнал только дополняется: правка и удаление запрещены триггером, а
--    каждая запись сцеплена хэшем с предыдущей — подмену или вырезанную
--    запись видно функцией fulfillment_verify().
--  • Прямой UPDATE/DELETE таблицы этапов в обход функции тоже запрещён.
--
--  Как применить: Supabase → SQL Editor → вставить файл целиком → Run.
--  Повторный запуск безопасен (if not exists / create or replace).
--  Откат — в конце файла, закомментирован.
-- ========================================================================

-- ---------- 1. С какого момента накладные идут в учёт сборки ----------
-- «Все новые»: накладные, созданные или датированные после применения этого
-- файла. Старые в очередь не попадают, но любую можно добавить вручную
-- (действие «track» ниже).
create table if not exists fulfillment_config (
  id int primary key default 1 check (id = 1),
  since timestamptz not null default now()
);
insert into fulfillment_config (id) values (1) on conflict (id) do nothing;

-- ---------- 2. Текущий этап каждого заказа ----------
-- Внешнего ключа на sales нет намеренно: удаление накладной в корзину не
-- должно ни падать, ни стирать историю сборки.
create table if not exists order_fulfillment (
  sale_id      uuid primary key,
  stage        text not null default 'placed' check (stage in ('placed', 'packed', 'shipped')),
  version      int  not null default 0,
  packed_at    timestamptz,
  packed_by    text,
  shipped_at   timestamptz,
  shipped_by   text,
  carrier      text,
  tracking     text,
  ship_comment text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists order_fulfillment_stage_idx on order_fulfillment (stage);

-- ---------- 3. Журнал (только дополняется) ----------
create table if not exists order_fulfillment_log (
  id         bigserial primary key,
  sale_id    uuid not null,
  action     text not null check (action in ('track', 'pack', 'ship', 'correct')),
  from_stage text,
  to_stage   text not null check (to_stage in ('placed', 'packed', 'shipped')),
  actor      text not null,
  actor_role text not null default 'admin',
  reason     text,
  carrier    text,
  tracking   text,
  comment    text,
  at         timestamptz not null default now(),
  prev_hash  text not null,
  hash       text not null
);
create index if not exists order_fulfillment_log_sale_idx on order_fulfillment_log (sale_id, id);

-- Снаружи (anon / authenticated ключи) таблицы не видны: RLS включён, политик
-- нет. Сервер ходит сервисным ключом и функциями ниже.
alter table fulfillment_config     enable row level security;
alter table order_fulfillment      enable row level security;
alter table order_fulfillment_log  enable row level security;

-- ---------- 4. Защита от незаметного изменения ----------
create or replace function fulfillment_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'ff:log_is_append_only';
end $$;

drop trigger if exists order_fulfillment_log_no_update on order_fulfillment_log;
create trigger order_fulfillment_log_no_update
  before update or delete on order_fulfillment_log
  for each row execute function fulfillment_log_immutable();

drop trigger if exists order_fulfillment_log_no_truncate on order_fulfillment_log;
create trigger order_fulfillment_log_no_truncate
  before truncate on order_fulfillment_log
  for each statement execute function fulfillment_log_immutable();

-- Этап создаёт и меняет только функция перехода: она поднимает флаг ff.allowed на
-- время своей транзакции. Любой другой INSERT/UPDATE/DELETE отклоняется.
create or replace function fulfillment_guard() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('ff.allowed', true), '') <> 'on' then
    raise exception 'ff:direct_change_forbidden';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists order_fulfillment_guard on order_fulfillment;
create trigger order_fulfillment_guard
  before insert or update or delete on order_fulfillment
  for each row execute function fulfillment_guard();

-- Хэш записи журнала. Одна функция и для записи, и для проверки — значит
-- одинаковое представление полей, без расхождений между Node и SQL.
create or replace function fulfillment_log_hash(
  p_prev text, p_sale uuid, p_action text, p_from text, p_to text, p_actor text,
  p_role text, p_reason text, p_carrier text, p_tracking text, p_comment text, p_at timestamptz
) returns text language sql immutable as $$
  select encode(sha256(convert_to(concat_ws('|',
    p_prev, p_sale::text, p_action, coalesce(p_from, ''), p_to, p_actor, p_role,
    coalesce(p_reason, ''), coalesce(p_carrier, ''), coalesce(p_tracking, ''), coalesce(p_comment, ''),
    to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
  ), 'UTF8')), 'hex')
$$;

-- ---------- 5. Переход этапа ----------
-- p_action:   'track'   — взять в учёт старую накладную (этап placed)
--             'pack'    — подтвердить сборку      placed  → packed
--             'ship'    — подтвердить отправку    packed  → shipped
--             'correct' — исправление на шаг назад (shipped → packed,
--                         packed → placed), причина обязательна
-- p_expected: этап, который видел сотрудник. Не совпал — значит заказ уже
--             изменил кто-то другой: ошибка ff:conflict:<текущий этап>.
-- Ошибки начинаются с 'ff:' — сервер переводит их в понятный ответ.
create or replace function fulfillment_transition(
  p_sale     uuid,
  p_action   text,
  p_expected text,
  p_actor    text,
  p_role     text default 'admin',
  p_reason   text default null,
  p_carrier  text default null,
  p_tracking text default null,
  p_comment  text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_sale   record;
  v_since  timestamptz;
  v_row    order_fulfillment%rowtype;
  v_had    boolean;
  v_from   text;
  v_to     text;
  v_prev   text;
  v_at     timestamptz := clock_timestamp();
  v_actor  text := left(btrim(coalesce(p_actor, '')), 80);
  v_role   text := left(coalesce(nullif(btrim(p_role), ''), 'admin'), 20);
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_car    text := nullif(left(btrim(coalesce(p_carrier, '')), 120), '');
  v_trk    text := nullif(left(btrim(coalesce(p_tracking, '')), 120), '');
  v_com    text := nullif(left(btrim(coalesce(p_comment, '')), 500), '');
begin
  if p_action not in ('track', 'pack', 'ship', 'correct') then raise exception 'ff:bad_action'; end if;
  if v_actor = '' then raise exception 'ff:actor_required'; end if;
  if p_action = 'correct' and (v_reason is null or length(v_reason) < 3) then raise exception 'ff:reason_required'; end if;

  -- Накладная должна существовать и быть оформлена: до «Оформить» товар не
  -- списан, и отправить его значило бы выпустить со склада без учёта.
  select id, status, source, date, created_at into v_sale from sales where id = p_sale;
  if not found then raise exception 'ff:sale_not_found'; end if;
  if v_sale.status is distinct from 'final' then raise exception 'ff:not_final'; end if;
  if v_sale.source = 'refund' then raise exception 'ff:refund'; end if;

  perform set_config('ff.allowed', 'on', true);

  -- Строка этапа: блокируем, чтобы второй сотрудник ждал, а потом увидел
  -- уже новый этап (и получил conflict), а не подтвердил повторно.
  select * into v_row from order_fulfillment where sale_id = p_sale for update;
  v_had := found;

  if not v_had then
    select since into v_since from fulfillment_config where id = 1;
    if p_action <> 'track'
       and not (coalesce(v_sale.created_at, '-infinity') >= v_since or coalesce(v_sale.date, '-infinity') >= v_since) then
      raise exception 'ff:not_tracked';
    end if;
    insert into order_fulfillment (sale_id) values (p_sale) on conflict (sale_id) do nothing;
    select * into v_row from order_fulfillment where sale_id = p_sale for update;
  elsif p_action = 'track' then
    raise exception 'ff:conflict:%', v_row.stage;
  end if;

  v_from := v_row.stage;
  -- У «track» ожидать нечего: строки до него не было (иначе conflict выше).
  if p_action <> 'track' and p_expected is distinct from v_from then
    raise exception 'ff:conflict:%', v_from;
  end if;

  if p_action = 'track' then
    v_from := null; v_to := 'placed';
  elsif p_action = 'pack' then
    if v_from <> 'placed' then raise exception 'ff:bad_step:%', v_from; end if;
    v_to := 'packed';
    update order_fulfillment set stage = v_to, version = version + 1,
      packed_at = v_at, packed_by = v_actor, updated_at = v_at
      where sale_id = p_sale;
  elsif p_action = 'ship' then
    if v_from <> 'packed' then raise exception 'ff:bad_step:%', v_from; end if;
    v_to := 'shipped';
    update order_fulfillment set stage = v_to, version = version + 1,
      shipped_at = v_at, shipped_by = v_actor,
      carrier = v_car, tracking = v_trk, ship_comment = v_com, updated_at = v_at
      where sale_id = p_sale;
  else -- correct
    if v_from = 'shipped' then
      v_to := 'packed';
      update order_fulfillment set stage = v_to, version = version + 1,
        shipped_at = null, shipped_by = null, carrier = null, tracking = null, ship_comment = null,
        updated_at = v_at
        where sale_id = p_sale;
    elsif v_from = 'packed' then
      v_to := 'placed';
      update order_fulfillment set stage = v_to, version = version + 1,
        packed_at = null, packed_by = null, updated_at = v_at
        where sale_id = p_sale;
    else
      raise exception 'ff:bad_step:%', v_from;
    end if;
  end if;

  -- Журнал — одна цепочка на все заказы. Блокировка выстраивает записи по
  -- очереди, чтобы у двух одновременных записей не оказалось общего «предка».
  perform pg_advisory_xact_lock(hashtext('order_fulfillment_log'));
  select hash into v_prev from order_fulfillment_log order by id desc limit 1;
  v_prev := coalesce(v_prev, 'GENESIS');

  insert into order_fulfillment_log
    (sale_id, action, from_stage, to_stage, actor, actor_role, reason, carrier, tracking, comment, at, prev_hash, hash)
  values
    (p_sale, p_action, v_from, v_to, v_actor, v_role, v_reason,
     case when p_action = 'ship' then v_car end,
     case when p_action = 'ship' then v_trk end,
     case when p_action = 'ship' then v_com end,
     v_at, v_prev,
     fulfillment_log_hash(v_prev, p_sale, p_action, v_from, v_to, v_actor, v_role, v_reason,
       case when p_action = 'ship' then v_car end,
       case when p_action = 'ship' then v_trk end,
       case when p_action = 'ship' then v_com end,
       v_at));

  select * into v_row from order_fulfillment where sale_id = p_sale;
  return to_jsonb(v_row);
end $$;

-- ---------- 6. Проверка целостности журнала ----------
-- ok=false, если: хэш записи не сходится, цепочка разорвана (запись
-- вырезана или вставлена задним числом) или этап заказа не совпадает с
-- последней записью журнала (этап поменяли в обход функции).
create or replace function fulfillment_verify() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r       record;
  v_prev  text := 'GENESIS';
  v_bad   jsonb := '[]'::jsonb;
  v_n     int := 0;
begin
  for r in select * from order_fulfillment_log order by id loop
    v_n := v_n + 1;
    if r.prev_hash <> v_prev
       or r.hash <> fulfillment_log_hash(r.prev_hash, r.sale_id, r.action, r.from_stage, r.to_stage, r.actor,
                                         r.actor_role, r.reason, r.carrier, r.tracking, r.comment, r.at) then
      v_bad := v_bad || jsonb_build_object('log_id', r.id, 'sale_id', r.sale_id, 'kind', 'hash');
    end if;
    v_prev := r.hash;
  end loop;

  for r in
    select f.sale_id, f.stage, l.to_stage
    from order_fulfillment f
    left join lateral (
      select to_stage from order_fulfillment_log l where l.sale_id = f.sale_id order by id desc limit 1
    ) l on true
    where l.to_stage is distinct from f.stage
       -- заказ без записей журнала допустим только на этапе placed
       and not (l.to_stage is null and f.stage = 'placed' and f.version = 0)
  loop
    v_bad := v_bad || jsonb_build_object('sale_id', r.sale_id, 'kind', 'stage', 'stage', r.stage, 'log', r.to_stage);
  end loop;

  return jsonb_build_object('ok', jsonb_array_length(v_bad) = 0, 'checked', v_n, 'problems', v_bad);
end $$;

-- Вызывать функции может только сервер (сервисный ключ).
revoke all on function fulfillment_transition(uuid, text, text, text, text, text, text, text, text) from public;
revoke all on function fulfillment_verify() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function fulfillment_transition(uuid, text, text, text, text, text, text, text, text) from anon, authenticated';
    execute 'revoke all on function fulfillment_verify() from anon, authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function fulfillment_transition(uuid, text, text, text, text, text, text, text, text) to service_role';
    execute 'grant execute on function fulfillment_verify() to service_role';
  end if;
end $$;

-- PostgREST перечитывает схему, чтобы увидеть новые функции.
notify pgrst, 'reload schema';

-- ---------- ОТКАТ (выполнять только осознанно: стирает историю сборки) ----------
-- drop function if exists fulfillment_transition(uuid, text, text, text, text, text, text, text, text);
-- drop function if exists fulfillment_verify();
-- drop function if exists fulfillment_log_hash(text, uuid, text, text, text, text, text, text, text, text, text, timestamptz);
-- drop table if exists order_fulfillment_log;   -- сначала: drop trigger order_fulfillment_log_no_truncate
-- drop table if exists order_fulfillment;
-- drop table if exists fulfillment_config;
-- drop function if exists fulfillment_guard();
-- drop function if exists fulfillment_log_immutable();
