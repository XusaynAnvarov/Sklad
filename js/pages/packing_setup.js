// ========================================================================
//  НАСТРОЙКИ УПАКОВОК — один экран на весь склад.
//
//  Товаров восемьсот, и у каждого надо один раз сказать: в чём его берут у
//  поставщика, в чём он лежит на полке, сколько штук в упаковке. По
//  карточкам это неделя работы, и главное — не видно общей картины: какие
//  товары ещё не настроены, а у каких настройки противоречат друг другу.
//
//  Здесь это видно сразу и правится сразу у многих. А поскольку массовая
//  правка — самое опасное, что есть в складе, порядок всегда один:
//  отметили товары → заполнили только то, что меняем → УВИДЕЛИ, что
//  станет с каждым → и только потом записали.
//
//  Расчёт тут не живёт: что станет с товаром, считает js/packingbulk.js,
//  и тот же план показывается в предпросмотре и записывается. Поэтому
//  предпросмотр не может разойтись с тем, что произойдёт.
// ========================================================================
import { el, toast, modal, field, input, select, showLoader, hideLoader, setLoaderText } from "../ui.js?v=20261110b";
import { icon } from "../icons.js?v=20261110b";
import { thumb } from "../img.js?v=20261110b";
import { placeholder, openForm } from "./products.js?v=20261110b";
import { подходит } from "../productsearch.js?v=20261110b";
import { главноеФото } from "../photo.js?v=20261110b";
import { ЕДИНИЦЫ } from "../unit.js?v=20261110b";
import { настройки, статус, цепочка, ПРАВИЛА_ОСТАТКА, СТАТУС, естьКолонки } from "../packing.js?v=20261110b";
import { планПравки, сводка, строкиДляЗаписи, объяснитьПеревод, однофамильцы } from "../packingbulk.js?v=20261110b";
import { записатьПачкой } from "../arrival.js?v=20261110b";
import { изменениеСклада } from "../db.js?v=20261110b";

const НЕ_МЕНЯТЬ = { value: "", label: "— не менять —" };
const вариантыЕдиниц = () => ЕДИНИЦЫ.map(e => ({ value: e.value, label: e.label }));

// «1 товара», «2 товаров», «11 товаров» — родительный падеж. Без этого
// выходило «у 1 товаров», и подпись читалась как недоделанная.
const товаров = (n) => (n % 10 === 1 && n % 100 !== 11 ? "товара" : "товаров");
const этихТоваров = (n) => (n === 1 ? "у этого товара" : `у этих ${n} ${товаров(n)}`);

const ЦВЕТ = {
  [СТАТУС.НЕТ]: "var(--muted)",
  [СТАТУС.ЕСТЬ]: "var(--ok)",
  [СТАТУС.ПРОВЕРИТЬ]: "var(--warn)",
};

// ------------------------------------------------------------------
//  ГДЕ ВЛАДЕЛЕЦ БЫЛ ДО ПРАВКИ.
//
//  Экран перерисовывается целиком после каждой записи, и без этого
//  владельца выбрасывало в начало списка: настроил товар на четырёхсотой
//  строке — и листай заново. Живёт вне render(), потому что сам render()
//  при обновлении вызывается заново.
// ------------------------------------------------------------------
const место = { поиск: "", статус: "", категория: "", поставщик: "", прокрутка: 0 };

// Полоса, которая на самом деле прокручивается: в этой вёрстке скроллится
// не окно, а <main>. Ищем от страницы вверх — так же верно, если разметка
// однажды поменяется.
function полоса(узел) {
  for (let e = узел; e && e !== document.body; e = e.parentElement) {
    const о = getComputedStyle(e).overflowY;
    if ((о === "auto" || о === "scroll") && e.scrollHeight > e.clientHeight + 4) return e;
  }
  return document.scrollingElement || document.documentElement;
}

export default async function render(page, ctx) {
  const [products, purchases] = await Promise.all([
    ctx.db.products.list(),
    ctx.db.purchases.list().catch(() => []),
  ]);

  // Кто привозил этот товар. Нужно для фильтра: упаковку обычно настраивают
  // поставщиками — «все шпульки от JACK лежат пачками по десять».
  const поставщики = new Map();                 // product_id → Set(поставщик)
  for (const з of (purchases || [])) {
    const кто = String(з.supplier || "").trim();
    if (!кто) continue;
    for (const it of (з.items || [])) {
      if (!it || !it.product_id) continue;
      if (!поставщики.has(it.product_id)) поставщики.set(it.product_id, new Set());
      поставщики.get(it.product_id).add(кто);
    }
  }
  const всеПоставщики = [...new Set((purchases || []).map(з => String(з.supplier || "").trim()).filter(Boolean))].sort();
  const категории = [...new Set(products.map(p => String(p.category || "").trim()).filter(Boolean))].sort();
  const двойники = однофамильцы(products);

  const выбрано = new Set();

  page.append(el("div.topbar", {}, [
    el("div", {}, [
      el("h1", { text: "Настройки упаковок" }),
      el("div.sub", { text: "Один раз сказать, в чём товар покупают, в чём он лежит и сколько штук внутри — дальше приход считается сам" }),
    ]),
    el("button.btn.btn-outline", { onclick: () => { запомнитьМесто(); ctx.refresh(); } }, [icon("refresh", { size: 16 }), "Обновить"]),
  ]));

  // До миграции сохранять настройки некуда. Молчать об этом нельзя:
  // владелец настроит пятьдесят товаров и ничего не сохранит.
  if (!естьКолонки(products)) {
    page.append(el("div.card", { style: { padding: "14px", marginBottom: "12px", borderColor: "var(--warn)" } }, [
      el("div", { style: { fontWeight: "700", color: "var(--warn)", marginBottom: "4px" }, text: "В базе ещё нет колонок упаковки" }),
      el("div", { style: { fontSize: "14px" }, text: "Выполните db/packing-migration.sql — она добавляет семь колонок и НЕ трогает ни остатки, ни себестоимость, ни старые приходы. До этого настройки упаковки сохранить некуда." }),
    ]));
  }

  // ---------- фильтры ----------
  const fПоиск = input({ placeholder: "Название, артикул или код", style: { minWidth: "220px", flex: "1" } });
  const fСтатус = select([
    { value: "", label: "Все товары" },
    { value: СТАТУС.НЕТ, label: "Не настроено" },
    { value: СТАТУС.ЕСТЬ, label: "Настроено" },
    { value: СТАТУС.ПРОВЕРИТЬ, label: "Требует проверки" },
    { value: "auto_off", label: "Настроено, но пересчёт выключен" },
  ], "");
  const fКатегория = select([{ value: "", label: "Все категории" }, ...категории.map(c => ({ value: c, label: c }))], "");
  const fПоставщик = select([{ value: "", label: "Все поставщики" }, ...всеПоставщики.map(s => ({ value: s, label: s }))], "");

  // Возвращаем поиск и фильтры такими же, какими они были до записи.
  // Категория и поставщик — только если они ещё есть в списках: товар
  // могли переименовать, и тогда честнее показать всё, чем пустоту.
  fПоиск.value = место.поиск || "";
  fСтатус.value = место.статус || "";
  if (место.категория && категории.includes(место.категория)) fКатегория.value = место.категория;
  if (место.поставщик && всеПоставщики.includes(место.поставщик)) fПоставщик.value = место.поставщик;
  const запомнитьМесто = () => {
    место.поиск = fПоиск.value;
    место.статус = fСтатус.value;
    место.категория = fКатегория.value;
    место.поставщик = fПоставщик.value;
    место.прокрутка = полоса(page).scrollTop || 0;
  };

  const плашки = el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", margin: "0 0 12px" } });
  const счётВыбора = el("div", { style: { fontWeight: "700" } });
  const кнопкаПравки = el("button.btn.btn-primary", { onclick: () => открытьПравку() }, [icon("edit", { size: 16 }), "Настроить выбранные"]);
  const галкаВсе = el("input", { type: "checkbox", style: { width: "18px", height: "18px", accentColor: "var(--accent)" } });
  const tbody = el("tbody");

  const видимые = () => {
    const q = fПоиск.value.trim();
    return products.filter(p => {
      if (!подходит(p, q)) return false;
      if (fКатегория.value && String(p.category || "").trim() !== fКатегория.value) return false;
      if (fПоставщик.value && !(поставщики.get(p.id) || new Set()).has(fПоставщик.value)) return false;
      const с = статус(p);
      if (fСтатус.value === "auto_off") return с.код === СТАТУС.ЕСТЬ && !настройки(p).авто;
      if (fСтатус.value && с.код !== fСтатус.value) return false;
      return true;
    });
  };

  function нарисоватьПлашки() {
    const счёт = { [СТАТУС.НЕТ]: 0, [СТАТУС.ЕСТЬ]: 0, [СТАТУС.ПРОВЕРИТЬ]: 0 };
    let безПересчёта = 0;
    for (const p of products) {
      const с = статус(p);
      счёт[с.код]++;
      if (с.код === СТАТУС.ЕСТЬ && !настройки(p).авто) безПересчёта++;
    }
    плашки.textContent = "";
    const плашка = (подпись, число, цвет, фильтр) => el("button.btn.btn-outline.btn-sm", {
      style: { borderColor: цвет },
      onclick: () => { fСтатус.value = фильтр; нарисовать(); },
    }, [el("span", { text: подпись + ": " }), el("strong", { style: { color: цвет }, text: String(число) })]);
    плашки.append(
      плашка("Всего", products.length, "", ""),
      плашка("Не настроено", счёт[СТАТУС.НЕТ], ЦВЕТ[СТАТУС.НЕТ], СТАТУС.НЕТ),
      плашка("Настроено", счёт[СТАТУС.ЕСТЬ], ЦВЕТ[СТАТУС.ЕСТЬ], СТАТУС.ЕСТЬ),
      плашка("Требует проверки", счёт[СТАТУС.ПРОВЕРИТЬ], ЦВЕТ[СТАТУС.ПРОВЕРИТЬ], СТАТУС.ПРОВЕРИТЬ),
      плашка("Пересчёт выключен", безПересчёта, "", "auto_off"),
    );
  }

  // Отмечена часть показанного — у галки «выбрать всё» третье состояние.
  const частично = (сколько, всего) => сколько > 0 && сколько < всего;

  function обновитьВыбор() {
    const список = видимые();
    const отмеченных = список.filter(p => выбрано.has(p.id)).length;
    счётВыбора.textContent = выбрано.size ? `Выбрано: ${выбрано.size}` : "Ничего не выбрано";
    кнопкаПравки.disabled = !выбрано.size;
    кнопкаПравки.textContent = выбрано.size ? `Настроить выбранные (${выбрано.size})` : "Настроить выбранные";
    кнопкаПравки.prepend(icon("edit", { size: 16 }));
    галкаВсе.checked = !!список.length && отмеченных === список.length;
    галкаВсе.indeterminate = частично(отмеченных, список.length);
  }

  function нарисовать() {
    const список = видимые();
    tbody.textContent = "";
    if (!список.length) {
      tbody.append(el("tr", {}, [el("td", { colspan: 11 }, [
        el("div.empty", { style: { padding: "24px" } }, [el("p", { text: "Таких товаров нет — попробуйте снять фильтры" })]),
      ])]));
    }
    for (const p of список) {
      const н = настройки(p);
      const с = статус(p);
      const фото = главноеФото(p);
      const галка = el("input", {
        type: "checkbox",
        style: { width: "18px", height: "18px", accentColor: "var(--accent)" },
        onchange: function () { this.checked ? выбрано.add(p.id) : выбрано.delete(p.id); обновитьВыбор(); },
      });
      галка.checked = выбрано.has(p.id);
      const двойник = двойники.get(String(p.name || "").trim().toLowerCase()) || 0;

      tbody.append(el("tr", {}, [
        el("td", {}, [галка]),
        el("td", {}, [el("img.thumb", {
          src: фото ? thumb(фото, 60) : placeholder(p.name), loading: "lazy", decoding: "async",
          style: { width: "44px", height: "44px" },
          onerror: function () { this.src = placeholder(p.name); },
        })]),
        el("td", {}, [
          el("strong", { text: p.name || "Без названия" }),
          el("div", { style: { fontSize: "12px", color: "var(--muted)" }, text: [p.code, p.sku].filter(Boolean).join(" · ") || "—" }),
          // Одинаковое название — НЕ повод считать товары одним. Но здесь
          // правят упаковку, и настроить не тот товар очень легко.
          двойник > 1 ? el("div", { style: { fontSize: "12px", color: "var(--warn)" },
            text: `Такое же название ещё у ${двойник - 1} товара — это разные товары` }) : null,
        ].filter(Boolean)),
        el("td", { text: н.закуп }),
        el("td", { text: н.склад }),
        el("td", { text: н.продажа }),
        el("td", { text: н.вСкладской > 1 ? String(н.вСкладской) : "—" }),
        el("td", { text: н.вКоробке > 0 ? String(н.вКоробке) : "—" }),
        el("td", {}, [н.авто
          ? el("span.badge", { style: { background: "var(--ok)", color: "#fff", fontSize: "11px" }, text: "вкл" })
          : el("span", { style: { color: "var(--muted)" }, text: "выкл" })]),
        el("td", {}, [
          el("span.badge", { style: { background: ЦВЕТ[с.код], color: "#fff", fontSize: "11px" }, text: с.подпись }),
          с.причины.length ? el("div", { style: { fontSize: "12px", color: "var(--warn)", maxWidth: "260px" }, text: с.причины[0] }) : null,
        ].filter(Boolean)),
        el("td.right", {}, [el("button.btn.btn-outline.btn-sm", {
          title: "Открыть карточку товара", text: "Карточка",
          onclick: () => openForm(ctx, p, категории),
        })]),
      ]));
    }
    нарисоватьПлашки();
    обновитьВыбор();
  }

  галкаВсе.addEventListener("change", () => {
    const список = видимые();
    if (галкаВсе.checked) список.forEach(p => выбрано.add(p.id));
    else список.forEach(p => выбрано.delete(p.id));
    нарисовать();
  });
  fПоиск.addEventListener("input", нарисовать);
  [fСтатус, fКатегория, fПоставщик].forEach(п => п.addEventListener("change", нарисовать));

  page.append(плашки);
  page.append(el("div.card", { style: { padding: "12px", marginBottom: "12px" } }, [
    // Поиск и три фильтра — в одну строку, пока хватает ширины. Каждый
    // тянется сам: на узком экране они переносятся, а не сжимаются в
    // нечитаемые огрызки.
    el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" } },
      [[fПоиск, "220px"], [fСтатус, "180px"], [fКатегория, "160px"], [fПоставщик, "160px"]]
        .map(([узел, мин]) => el("div", { style: { flex: "1 1 " + мин, minWidth: мин } }, [узел]))),
    el("div", { style: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginTop: "10px" } }, [
      el("label", { style: { display: "flex", gap: "8px", alignItems: "center", cursor: "pointer" } }, [
        галкаВсе, el("span", { text: "Выбрать всё показанное" }),
      ]),
      счётВыбора,
      el("button.btn.btn-outline.btn-sm", { text: "Снять выбор", onclick: () => { выбрано.clear(); нарисовать(); } }),
      el("div", { style: { flex: "1" } }),
      кнопкаПравки,
    ]),
  ]));
  page.append(el("div", { style: { overflowX: "auto" } }, [el("table.tbl", {}, [
    el("thead", {}, [el("tr", {}, ["", "", "Товар", "Покупаем", "На складе", "Продаём", "Штук в упак.", "Упак. в коробке", "Пересчёт", "Статус", ""]
      .map(h => el("th", { text: h })))]),
    tbody,
  ])]));
  нарисовать();
  // Вернуть взгляд туда, где владелец был до записи. Через кадр — строки
  // к этому моменту уже в разметке, и прокрутке есть куда встать.
  if (место.прокрутка) {
    const куда = место.прокрутка;
    requestAnimationFrame(() => {
      const п = полоса(page);
      п.scrollTop = Math.max(0, Math.min(куда, п.scrollHeight - п.clientHeight));
    });
  }

  // ------------------------------------------------------------------
  //  ПРАВКА ВЫБРАННЫХ.
  //  Пустое поле значит «не менять»: у каждого товара своя упаковка, и
  //  одна общая правка не должна стирать пятьдесят разных настроек.
  // ------------------------------------------------------------------
  function открытьПравку() {
    const отмеченные = products.filter(p => выбрано.has(p.id));
    if (!отмеченные.length) { toast("Сначала отметьте товары", "err"); return; }

    const fBuy = select([НЕ_МЕНЯТЬ, ...вариантыЕдиниц()], "");
    const fUnit = select([НЕ_МЕНЯТЬ, ...вариантыЕдиниц()], "");
    const fSell = select([НЕ_МЕНЯТЬ, ...вариантыЕдиниц()], "");
    const fPack = input({ type: "number", step: "1", min: "1", placeholder: "не менять" });
    const fBox = input({ type: "number", step: "1", min: "1", placeholder: "не менять" });
    const fOdd = select([НЕ_МЕНЯТЬ, ...ПРАВИЛА_ОСТАТКА.map(п => ({ value: п.value, label: п.label }))], "");
    const fAuto = select([НЕ_МЕНЯТЬ, { value: "on", label: "Включить" }, { value: "off", label: "Выключить" }], "");
    const fОтметить = el("input", { type: "checkbox", style: { width: "18px", height: "18px", accentColor: "var(--accent)" } });

    const собрать = () => ({
      buy_unit: fBuy.value,
      unit: fUnit.value,
      sell_unit: fSell.value,
      pack_size: fPack.value.trim(),
      box_size: fBox.value.trim(),
      odd_rule: fOdd.value,
      auto_convert: fAuto.value === "" ? "" : fAuto.value === "on",
      подтвердить: fОтметить.checked,
    });

    modal({
      title: `Настроить упаковку: ${отмеченные.length} ${отмеченные.length === 1 ? "товар" : товаров(отмеченные.length)}`,
      wide: true,
      body: el("div", {}, [
        el("div.hint", { text: "Заполняйте только то, что меняете. Пустое поле значит «не менять» — у каждого товара останется своё." }),
        el("div.row3", {}, [
          field("Покупаем у поставщика в", fBuy),
          field("На складе считаем в", fUnit),
          field("Продаём в", fSell),
        ]),
        el("div.row2", {}, [field("Штук в одной складской единице", fPack), field("Складских единиц в коробке", fBox)]),
        el("div.hint", { style: { color: "var(--warn)" }, text: "«На складе считаем в» и «Штук в упаковке» меняют то, ЧЕМ меряют уже лежащий товар: у таких товаров пересчитается остаток, себестоимость и все партии. Это будет показано отдельно, и без вашего разрешения не произойдёт." }),
        field("Если упаковка выходит неполной", fOdd),
        field("Пересчитывать приход автоматически", fAuto),
        el("label", { style: { display: "flex", gap: "9px", alignItems: "center", margin: "10px 0 2px", cursor: "pointer" } }, [
          fОтметить,
          el("span", { text: "Отметить упаковку настроенной, даже если ничего не меняется" }),
        ]),
        el("div.hint", { text: "Пригодится для товаров, которые и правда считаются штуками: они уйдут из списка «не настроено»." }),
      ]),
      actions: [
        { label: "Отмена", kind: "btn-outline", onClick: c => c() },
        { label: "Показать, что изменится", kind: "btn-primary", onClick: (close) => {
          const значения = собрать();
          const план = планПравки(отмеченные, значения);
          const св = сводка(план);
          if (!св.меняется) { toast("С этими настройками ничего не меняется", "err"); return; }
          close();
          предпросмотр(план, св);
        } },
      ],
    });
  }

  // ------------------------------------------------------------------
  //  ПРЕДПРОСМОТР. Ровно те числа, которые лягут в базу.
  // ------------------------------------------------------------------
  function предпросмотр(план, св) {
    let переводить = false;
    const меняются = план.filter(x => x.меняется);
    const переводы = меняются.filter(x => x.двигает);

    const строка = (x) => el("div.card", { style: { padding: "10px", marginBottom: "8px", display: "flex", gap: "10px", alignItems: "flex-start" } }, [
      el("img.thumb", {
        src: главноеФото(x.p) ? thumb(главноеФото(x.p), 60) : placeholder(x.p.name), loading: "lazy", decoding: "async",
        style: { width: "40px", height: "40px", flex: "0 0 auto" },
        onerror: function () { this.src = placeholder(x.p.name); },
      }),
      el("div", { style: { flex: "1", minWidth: "0" } }, [
        el("div", { style: { fontWeight: "600" }, text: x.p.name || "Без названия" }),
        x.толькоПодтверждение
          ? el("div.muted", { style: { fontSize: "13px" }, text: "Настройки те же — отмечаем упаковку настроенной" })
          : el("div", { style: { fontSize: "13px" } }, x.различия.map(d => el("div", {}, [
            el("span.muted", { text: d.поле + ": " + d.было }),
            el("span", { text: " → ", style: { opacity: ".6" } }),
            el("strong", { text: String(d.стало) }),
          ]))),
        цепочка({ ...x.p, ...x.поля }) ? el("div.muted", { style: { fontSize: "12px", marginTop: "2px" }, text: цепочка({ ...x.p, ...x.поля }) }) : null,
        x.двигает ? el("div", { style: { fontSize: "12px", marginTop: "3px", color: "var(--warn)" },
          text: "ПЕРЕСЧЁТ ОСТАТКА: " + объяснитьПеревод(x) }) : null,
        x.статус.код === СТАТУС.ПРОВЕРИТЬ ? el("div", { style: { fontSize: "12px", marginTop: "3px", color: "var(--warn)" },
          text: "После правки: требует проверки — " + x.статус.причины[0] }) : null,
      ].filter(Boolean)),
    ]);

    const итогБокс = el("div", { style: { textAlign: "right", fontSize: "16px", fontWeight: "800", marginTop: "8px" } });
    const тело = el("div", {}, [
      el("div.hint", { text: "Это предпросмотр. Пока вы не нажали «Применить», в базе ничего не изменилось." }),
      el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", margin: "0 0 10px" } }, [
        el("span.badge", { style: { background: "var(--ok)", color: "#fff" }, text: `Изменится: ${св.меняется}` }),
        св.безИзменений ? el("span.badge", { style: { background: "var(--muted)", color: "#fff" }, text: `Без изменений: ${св.безИзменений}` }) : null,
        св.включитсяАвто ? el("span.badge", { style: { background: "var(--ok)", color: "#fff" }, text: `Включится пересчёт: ${св.включитсяАвто}` }) : null,
        св.требуютПроверки ? el("span.badge", { style: { background: "var(--warn)", color: "#fff" }, text: `Требуют проверки: ${св.требуютПроверки}` }) : null,
        св.переводов ? el("span.badge", { style: { background: "var(--warn)", color: "#fff" }, text: `Пересчёт остатка: ${св.переводов}` }) : null,
      ].filter(Boolean)),
      ...меняются.filter(x => !x.двигает).map(строка),
    ]);

    if (переводы.length) {
      const галка = el("input", { type: "checkbox", style: { width: "18px", height: "18px", flex: "0 0 auto", accentColor: "var(--warn)" } });
      тело.append(el("div.section-h", { style: { color: "var(--warn)" }, text: "Эти товары придётся пересчитать" }));
      тело.append(el("div.hint", { text: "У них меняется то, чем меряют остаток. Товара и денег на складе останется столько же — изменится только единица."
        + (св.дробных ? ` У ${св.дробных} ${товаров(св.дробных)} остаток не делится нацело: проверьте размер упаковки.` : "") }));
      переводы.forEach(x => тело.append(строка(x)));
      тело.append(el("label", { style: { display: "flex", gap: "9px", alignItems: "center", marginTop: "10px", cursor: "pointer", color: "var(--warn)" } }, [
        галка,
        el("span", { text: `Пересчитать остаток ${этихТоваров(переводы.length)}. Без галочки ${переводы.length === 1 ? "он будет пропущен" : "они будут пропущены"}.` }),
      ]));
      галка.addEventListener("change", () => { переводить = галка.checked; обновитьИтог(); });
    }
    тело.append(итогБокс);

    function обновитьИтог() {
      const n = строкиДляЗаписи(план, { переводить }).length;
      итогБокс.textContent = `Будет записано товаров: ${n}`
        + (переводы.length && !переводить ? ` · пропущено с пересчётом: ${переводы.length}` : "");
      if (кнопкаОк) {
        кнопкаОк.disabled = n === 0;
        кнопкаОк.textContent = `Применить (${n})`;
      }
    }

    const окно = modal({
      title: "Что изменится",
      wide: true,
      body: тело,
      actions: [
        { label: "Отмена", kind: "btn-outline", onClick: c => c() },
        { label: "Применить", kind: "btn-ok", onClick: async (close) => {
          const строки = строкиДляЗаписи(план, { переводить });
          if (!строки.length) return;
          await записать(строки, close);
        } },
      ],
    });
    var кнопкаОк = окно.content.parentElement.querySelector(".modal-foot .btn-ok");
    обновитьИтог();
  }

  // ------------------------------------------------------------------
  //  ЗАПИСЬ. Пачкой — иначе пятьдесят товаров пишутся полминуты, и
  //  владелец успевает решить, что зависло.
  // ------------------------------------------------------------------
  async function записать(строки, close) {
    изменениеСклада("Массовая настройка упаковок", "");
    showLoader("Сохранение…");
    try {
      await записатьПачкой(ctx.db, строки, (готово, всего) => setLoaderText(`Сохранение… ${готово} из ${всего}`));
      hideLoader();
      toast(`Настроено товаров: ${строки.length}`, "ok");
      выбрано.clear();
      close();
      запомнитьМесто();
      ctx.refresh();
    } catch (e) {
      hideLoader();
      toast("Не сохранилось: " + (e.message || e)
        + (естьКолонки(products) ? "" : ". Похоже, не выполнена db/packing-migration.sql"), "err");
    }
  }
}
