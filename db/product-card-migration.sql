-- ========================================================================
--  КАРТОЧКИ ТОВАРОВ: подтверждённые факты и два варианта оформления.
--
--  Зачем этот файл. Сейчас в таблице products нет ни одного поля под
--  характеристики: ни описания, ни размера, ни мощности, ни бренда.
--  Поэтому собрать карточку вроде вашей «Панда мел · 50 шт.» просто
--  не из чего — всё, что на ней написано, пришлось бы выдумать.
--
--  Главное правило, ради которого таблица устроена именно так:
--  У КАЖДОГО ФАКТА ЕСТЬ ИСТОЧНИК. Без источника факт нельзя пометить
--  подтверждённым — это запрещено проверкой в самой базе, а не
--  вежливой договорённостью в коде. Что не подтверждено, то на
--  картинку не попадает.
--
--  Повод для такой строгости настоящий. На вашей карточке AP-052
--  написано «850 Вт» — и это верно, число читается с шильдика машины
--  на самом снимке. А в складе тот же товар называется
--  «Вертикалный нож (10) 750W». Ошибка в карточке склада, не на
--  картинке. Когда у факта есть источник, такое видно сразу.
--
--  Применить: Supabase → SQL Editor → вставить файл → Run.
--  Повторный запуск безопасен. Существующие таблицы не трогает,
--  ни одной строки в products не меняет.
--
--  Откат — в самом низу, закомментирован.
-- ========================================================================

-- ------------------------------------------------------------------
--  1. ФАКТЫ О ТОВАРЕ. Одна строка — один факт.
--
--  Почему отдельными строками, а не колонками в products: у каждого
--  факта своя судьба. Один взят с шильдика на фото, другой сказали вы,
--  третий агент нашёл в интернете и он ещё ждёт проверки. Колонка
--  такого не хранит, а строка хранит.
--
--  Ключи, которые понимает шаблон карточки:
--    название        — заголовок карточки по-русски
--                      («Термоисчезающий портновский мел»)
--    подзаголовок    — латиницей, на синей плашке («PANDA · GARMENT CHALK»)
--    свойство        — пункт в левой колонке со значком. Их несколько,
--                      порядок задаёт sort: 1, 2, 3…
--    количество      — число в большой плашке («50»)
--    единица         — подпись рядом с числом («шт.»)
--    предупреждение  — строка в нижней полосе
--    модель, бренд, размер, материал, мощность, напряжение,
--    совместимость, ресурс — строки таблицы характеристик (тип A)
--
--  sort нужен только там, где фактов с одним ключом несколько
--  (свойство). Для остальных оставайтесь на нуле.
-- ------------------------------------------------------------------
create table if not exists product_fact (
  product_id   uuid    not null references products(id) on delete cascade,
  key          text    not null,
  sort         integer not null default 0,
  value        text    not null,
  -- значок для левой колонки: квадрат | ткань | утюг | линейка |
  -- шестерня | скорость | щит | капля | слои | галочка
  icon         text,
  -- три ступени, как договаривались: подтверждено / требует проверки / не найдено
  confidence   text    not null default 'требует проверки',
  -- откуда взято: «шильдик на фото», «владелец», «сайт производителя», «упаковка»
  source       text,
  confirmed_by text,
  confirmed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (product_id, key, sort),
  constraint product_fact_confidence_ok
    check (confidence in ('подтверждено', 'требует проверки', 'не найдено')),
  -- Вот это и есть защита от выдуманных цифр: пометить факт
  -- подтверждённым без источника база не даст.
  constraint product_fact_source_required
    check (confidence <> 'подтверждено' or coalesce(btrim(source), '') <> '')
);
create index if not exists product_fact_key_idx on product_fact (key, confidence);

-- ------------------------------------------------------------------
--  2. НАСТРОЙКИ КАРТОЧКИ ТОВАРА.
--
--  Тип выбирается правилом (категория «Аппараты» или «Утюги», либо
--  цена от 20 $), но правило должно уметь ошибаться — для этого
--  card_type_override. Пусто — работает правило.
--
--  skip = true: этот товар карточку не получает вовсе. Нужен для
--  упаковок с чужим логотипом, которые рисовать нельзя.
-- ------------------------------------------------------------------
create table if not exists product_card (
  product_id         uuid primary key references products(id) on delete cascade,
  card_type_override text,
  skip               boolean not null default false,
  skip_reason        text,
  notes              text,
  updated_at         timestamptz not null default now(),
  updated_by         text,
  constraint product_card_type_ok
    check (card_type_override is null or card_type_override in ('A', 'B', 'C'))
);

-- ------------------------------------------------------------------
--  3. ВАРИАНТЫ ОФОРМЛЕНИЯ. На товар их всегда два: A и B.
--
--  Оба файла хранятся и остаются после выбора — чтобы можно было
--  вернуться и сравнить. Главным фото становится только тот, который
--  вы одобрили, и только по вашему нажатию: ниже стоит ограничение,
--  которое не даст пометить главным неодобренный файл.
--
--  Прошлые версии не удаляются: version растёт, старое остаётся в
--  истории. Это дешевле любой ошибки с перезаписью хорошего снимка.
-- ------------------------------------------------------------------
create table if not exists product_card_variant (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid    not null references products(id) on delete cascade,
  variant     text    not null,                       -- A | B
  version     integer not null default 1,
  path        text,                                   -- путь в хранилище
  built_at    timestamptz not null default now(),
  built_by    text,
  -- что именно собирали: снимок-основа, набор фактов, шаблон
  meta        jsonb,
  status      text    not null default 'draft',       -- draft | approved | rejected
  decided_at  timestamptz,
  decided_by  text,
  is_main     boolean not null default false,
  constraint product_card_variant_variant_ok check (variant in ('A', 'B')),
  constraint product_card_variant_status_ok  check (status in ('draft', 'approved', 'rejected')),
  -- Главным может стать только одобренный файл.
  constraint product_card_variant_main_ok     check (not is_main or status = 'approved'),
  unique (product_id, variant, version)
);
-- Главный файл у товара ровно один.
create unique index if not exists product_card_variant_main_idx
  on product_card_variant (product_id) where is_main;
create index if not exists product_card_variant_product_idx
  on product_card_variant (product_id, built_at desc);

-- ------------------------------------------------------------------
--  4. ЧТО ВАМ НРАВИТСЯ. Складывается из ваших же решений.
--
--  После каждого выбора сюда дописывается строка: какой вариант взяли
--  для какой категории. Со временем видно, что вы предпочитаете, и
--  агент предлагает это первым. Сам стандарт каталога при этом не
--  меняется — смена стандарта только с вашего отдельного согласия.
-- ------------------------------------------------------------------
create table if not exists card_preference (
  category    text not null,
  variant     text not null,
  picked      integer not null default 0,             -- сколько раз выбрали
  last_at     timestamptz,
  palette     jsonb,
  notes       text,
  primary key (category, variant),
  constraint card_preference_variant_ok check (variant in ('A', 'B'))
);

-- ------------------------------------------------------------------
--  5. КТО ГОТОВ К КАРТОЧКЕ.
--
--  Правило простое: нужен снимок и хотя бы два подтверждённых факта.
--  Меньше двух — карточку не делаем, а в отчёт идёт строка «нужны
--  характеристики». Пустая инфографика хуже, чем её отсутствие.
-- ------------------------------------------------------------------
create or replace view product_card_ready as
select
  p.id,
  p.code,
  p.name,
  p.category,
  coalesce(c.card_type_override,
           case when p.category in ('Аппараты', 'Утюги') or coalesce(p.price_usd, 0) >= 20
                then 'A' else 'B' end)                       as card_type,
  coalesce(c.skip, false)                                    as skip,
  (p.photo_url is not null and p.photo_url <> '')            as has_photo,
  count(f.*) filter (where f.confidence = 'подтверждено')     as confirmed_facts,
  count(f.*) filter (where f.confidence = 'требует проверки') as unverified_facts,
  (p.photo_url is not null and p.photo_url <> ''
   and count(f.*) filter (where f.confidence = 'подтверждено') >= 2
   and not coalesce(c.skip, false))                          as ready
from products p
left join product_card c on c.product_id = p.id
left join product_fact f on f.product_id = p.id
group by p.id, p.code, p.name, p.category, p.price_usd, p.photo_url, c.card_type_override, c.skip;

-- ------------------------------------------------------------------
--  ДОСТУП. Снаружи (anon / authenticated) таблицы не видны: RLS
--  включена, политик нет, права отозваны. Сервер ходит сервисным
--  ключом — как order_board и agent_*.
-- ------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['product_fact','product_card','product_card_variant','card_preference']
  loop
    execute format('alter table %I enable row level security', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table %I from anon, authenticated', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant all on table %I to service_role', t);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on product_card_ready from anon, authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on product_card_ready to service_role;
  end if;
end $$;

-- ------------------------------------------------------------------
--  ПРИМЕР: факты вашей карточки «Панда мел», товар PR-032.
--
--  Взяты слово в слово с карточки, которую вы сделали сами — поэтому
--  источник честный: «карточка владельца». Ни одного числа я сюда не
--  добавил от себя.
--
--  Строки можно удалить, если пример не нужен: повторный запуск
--  ничего не перезапишет (on conflict do nothing).
-- ------------------------------------------------------------------
insert into product_fact (product_id, key, sort, value, icon, confidence, source)
select p.id, v.key, v.sort, v.value, v.icon, 'подтверждено', 'карточка владельца от 22.11.2026'
from products p
cross join (values
  ('название',       0, 'Термоисчезающий портновский мел', null),
  ('подзаголовок',   0, 'PANDA · GARMENT CHALK',           null),
  ('свойство',       1, 'Белый цвет',                      'квадрат'),
  ('свойство',       2, 'Для разметки ткани',              'ткань'),
  ('свойство',       3, 'Удаляется при глажении',          'утюг'),
  ('количество',     0, '50',                              null),
  ('единица',        0, 'шт.',                             null),
  ('предупреждение', 0, 'Перед применением проверьте на образце ткани.', null)
) as v(key, sort, value, icon)
where p.code = 'PR-032'
on conflict do nothing;

-- ------------------------------------------------------------------
--  САМОПРОВЕРКА. Если что-то не создалось — ошибка будет здесь,
--  а не через неделю в работе агента.
-- ------------------------------------------------------------------
do $$
declare нет text; фактов int;
begin
  select string_agg(t, ', ') into нет
  from unnest(array['product_fact','product_card','product_card_variant','card_preference']) as t
  where to_regclass(t) is null;
  if нет is not null then
    raise exception 'Не создались таблицы: %', нет;
  end if;
  if to_regclass('product_card_ready') is null then
    raise exception 'Не создалось представление product_card_ready';
  end if;

  select count(*) into фактов from product_fact;
  raise notice 'Карточки товаров: четыре таблицы и представление на месте. Фактов записано: %', фактов;
end $$;

notify pgrst, 'reload schema';

-- ========================================================================
--  ПРОВЕРИТЬ ПОСЛЕ ЗАПУСКА (выполнить отдельно, ничего не меняет):
--
--    select * from product_card_ready where ready order by card_type, code;
--    select * from product_fact where product_id = (select id from products where code='PR-032');
--    select card_type, count(*) filter (where ready) as готовы, count(*) as всего
--      from product_card_ready group by card_type;
--
--  Третий запрос честно покажет, сколько товаров к карточке готово
--  прямо сейчас. Ожидайте единицу: PR-032. Остальным нужны факты.
-- ========================================================================

-- ========================================================================
--  ОТКАТ (раскомментировать и выполнить). Теряются только факты и
--  история вариантов; products, фотографии и заказы не затрагиваются.
--
--  drop view  if exists product_card_ready;
--  drop table if exists card_preference;
--  drop table if exists product_card_variant;
--  drop table if exists product_card;
--  drop table if exists product_fact;
--  notify pgrst, 'reload schema';
-- ========================================================================
