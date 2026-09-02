// Товары: поиск по названию и артикулу, сканер наклейки, правка карточки
// и добавление нового товара прямо с телефона.
// Показываем то, за чем сюда заходят: остаток и себестоимость.
import { el, go } from "../app.js?v=20260902a";
import { icon } from "../../icons.js?v=20260902a";
import { toast, modal, confirmDialog, lightbox } from "../../ui.js?v=20260902a";
import { ensureBatches, currentCost, costOutlook } from "../../inventory.js?v=20260902a";
import { fmt, convert } from "../../fx.js?v=20260902a";
import { thumb } from "../../img.js?v=20260902a";
import { LOW_STOCK } from "../../advice.js?v=20260902a";
import { scanSku, resolveScan, scanFailText } from "../qr.js?v=20260902a";
import { qrSvg, skuPayload } from "../../qr.js?v=20260902a";
import { setStock } from "../stock.js?v=20260902a";
// Себестоимость показываем в той валюте, в которой её ввели. Расчёт общий
// со складом на сайте: иначе один товар выглядит как «$33.87» на компьютере
// и «241,94 ¥» в телефоне — цифра верная, а доверия к ней никакого.
import { костВалюта, костЧисло, костСтрока, костПоля, ВАЛЮТЫ } from "../../cost.js?v=20260902a";
import { подпись as подписьКол, единица, вЕдинице } from "../../unit.js?v=20260902a";

const PAGE = 40;   // рисуем порциями: 866 карточек разом вешают телефон
const uid = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const field = (label, input) => el("label.field", {}, [el("span.field-label", { text: label }), input]);
const inp = (props) => el("input.inp", { style: { width: "100%", minHeight: "46px", fontSize: "16px" }, ...props });

export default async function render(box, ctx) {
  const products = await ctx.db.products.list();
  let filter = ctx.params.f || "";        // low | neg | пусто
  let query = (ctx.params.q || "").toLowerCase();

  const search = el("input.inp", { type: "search", placeholder: "Название или артикул…", value: ctx.params.q || "", style: { flex: "1", minHeight: "44px", fontSize: "16px" } });
  const scanBtn = el("button.mini-icon-btn", { title: "Сканировать наклейку" }, [icon("hash", { size: 18 })]);
  const addBtn = el("button.mini-icon-btn", { title: "Новый товар" }, [icon("plus", { size: 18 })]);
  box.append(el("div.mini-search", {}, [search, scanBtn, addBtn]));

  const list = el("div.mini-list");
  const more = el("div");
  box.append(list, more);

  let shown = 0, filtered = [];

  // ---------- правка карточки ----------
  function openEdit(p) {
    const isNew = !p;
    const item = p || { id: uid(), name: "", sku: "", category: "", stock_qty: 0, cost_yuan: 0, cost_usd: 0, price_som: 0 };
    const own = isNew ? { cost_yuan: 0 } : currentCost(ensureBatches(item));

    const fName = inp({ type: "text", value: item.name || "", placeholder: "Название" });
    const fSku = inp({ type: "text", value: item.sku || "", placeholder: "Артикул" });
    const fCat = inp({ type: "text", value: item.category || "", placeholder: "Категория" });
    const костCur = isNew ? "yuan" : костВалюта(item);
    const костЗнач = isNew ? 0 : костЧисло(own.cost_yuan || item.cost_yuan, item.cost_usd, костCur);
    const fCost = inp({ type: "number", inputmode: "decimal", step: "0.01", value: String(костЗнач || ""), placeholder: "0" });
    const fCostCur = el("select.inp", { style: { width: "100%", minHeight: "46px", fontSize: "16px" } });
    ВАЛЮТЫ.forEach(v => fCostCur.append(el("option", { value: v.value, text: v.label })));
    fCostCur.value = костCur;
    const fPrice = inp({ type: "number", inputmode: "numeric", value: String(item.price_som || ""), placeholder: "0" });
    const fQty = isNew ? inp({ type: "number", inputmode: "numeric", value: "0" }) : null;

    // Фото с телефона. Раньше карточка умела только показывать снимок —
    // сделать его можно было лишь за компьютером, а товар в руках сейчас.
    const фото = Array.isArray(item.photos) && item.photos.length
      ? item.photos.slice()
      : (item.photo_url ? [item.photo_url] : []);
    const превью = el("div", { style: { marginBottom: "4px" } });
    const fFile = el("input", { type: "file", accept: "image/*", multiple: true, style: { display: "none" } });
    const кнопкаФото = el("button.btn.btn-outline", {
      style: { flex: "1", justifyContent: "center", minHeight: "42px" },
      text: фото.length ? "Добавить фото" : "Снять или выбрать фото",
      onclick: () => fFile.click(),
    });
    fFile.addEventListener("change", async () => {
      const files = Array.from(fFile.files || []);
      if (!files.length) return;
      кнопкаФото.disabled = true;
      кнопкаФото.textContent = "Загружаем…";
      for (const file of files) {
        try { фото.push(await ctx.db.uploadPhoto(file)); }
        catch (e) { toast("Фото не загрузилось: " + (e.message || e), "err"); }
      }
      fFile.value = "";
      кнопкаФото.disabled = false;
      кнопкаФото.textContent = "Добавить фото";
      drawФото();
    });
    function drawФото() {
      превью.innerHTML = "";
      if (фото.length) {
        // Крупный снимок первым: правя карточку, надо видеть сам товар, а не
        // гадать по названию. Первое фото — главное, оно же в каталоге.
        превью.append(el("img", {
          src: thumb(фото[0], 640), alt: "", loading: "lazy", title: "Нажмите, чтобы увеличить",
          "data-full": фото[0],
          onerror: function () {
            const о = this.getAttribute("data-full");
            if (о && this.src !== о) this.src = о; else this.style.display = "none";
          },
          style: { width: "100%", maxHeight: "200px", objectFit: "contain", borderRadius: "12px",
            background: "var(--bg2)", cursor: "zoom-in", display: "block", marginBottom: "8px" },
          onclick: () => lightbox(фото),
        }));
      }
      const ряд = el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } });
      фото.forEach((url, i) => {
        ряд.append(el("div", { style: { position: "relative" } }, [
          el("img", { src: thumb(url, 160), alt: "", loading: "lazy", "data-full": url,
            onerror: function () {
              const о = this.getAttribute("data-full");
              if (о && this.src !== о) this.src = о;
            },
            style: { width: "64px", height: "64px", objectFit: "cover", borderRadius: "10px",
              background: "var(--bg2)", cursor: "zoom-in",
              outline: i === 0 ? "2px solid var(--accent)" : "none", outlineOffset: "1px" },
            title: i === 0 ? "Главное фото" : "Нажмите, чтобы увеличить",
            onclick: () => lightbox(фото) }),
          el("button.mini-icon-btn", {
            title: "Убрать фото",
            style: { position: "absolute", top: "-6px", right: "-6px", padding: "2px" },
            onclick: (e) => { e.stopPropagation(); фото.splice(i, 1); drawФото(); },
          }, [icon("x", { size: 13 })]),
        ]));
      });
      if (фото.length) превью.append(ряд);
      кнопкаФото.textContent = фото.length ? "Добавить фото" : "Снять или выбрать фото";
    }
    drawФото();

    const actions = [
      { label: "Отмена", kind: "btn-outline", onClick: c => c() },
      {
        label: isNew ? "Добавить" : "Сохранить", kind: "btn-primary", onClick: async (close) => {
          const name = fName.value.trim();
          if (!name) { toast("Впишите название", "err"); return; }
          const { cost_yuan: cy, cost_usd, cost_cur } = костПоля(fCost.value, fCostCur.value);
          const row = {
            id: item.id, name, sku: fSku.value.trim(), category: fCat.value.trim(),
            cost_yuan: cy,
            cost_usd,
            cost_cur,
            price_som: Number(fPrice.value) || 0,
            // первое фото — главное: его показывают в списках и в каталоге
            photos: фото,
            photo_url: фото[0] || null,
          };
          try {
            if (isNew) {
              const qty = Number(fQty.value) || 0;
              row.stock_qty = qty;
              row.batches = qty > 0 ? [{ qty, cost_yuan: cy, cost_usd: row.cost_usd, date: new Date().toISOString() }] : [];
              try { await ctx.db.products.upsert(row); }
              catch { await ctx.db.products.upsert((({ batches, ...x }) => x)(row)); }
              products.unshift(row);
            } else {
              // остаток и партии не трогаем — для них есть «Остаток на полке»
              await ctx.db.products.upsert(row);
              Object.assign(item, row);
            }
            close(); draw();
            toast(isNew ? "Товар добавлен" : "Сохранено", "ok");
          } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
        },
      },
    ];
    if (!isNew) {
      actions.unshift({
        label: "Удалить", kind: "btn-danger", onClick: (close) => {
          confirmDialog(`Удалить товар «${item.name}»? Он пропадёт из каталога и склада.`, async () => {
            try {
              await ctx.db.products.remove(item.id);
              const i = products.findIndex(x => x.id === item.id);
              if (i >= 0) products.splice(i, 1);
              close(); draw();
              toast("Удалено", "ok");
            } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
          });
        },
      });
    }

    modal({
      title: isNew ? "Новый товар" : item.name,
      wide: true,
      body: el("div", { style: { display: "grid", gap: "10px" } }, [
        превью,
        el("div", { style: { display: "flex", gap: "8px" } }, [кнопкаФото, fFile]),
        field("Название", fName),
        el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" } }, [
          field("Артикул", fSku), field("Категория", fCat),
        ]),
        el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" } }, [
          field("Себестоимость", fCost), field("Валюта прихода", fCostCur),
        ]),
        el("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" } }, [
          field("Цена продажи, сум", fPrice), el("div"),
        ]),
        isNew ? field("Остаток сейчас", fQty) : null,
        !isNew ? el("div", { style: { display: "flex", gap: "8px", marginTop: "4px" } }, [
          el("button.btn.btn-outline", { style: { flex: "1", justifyContent: "center", minHeight: "42px" }, text: "Остаток на полке", onclick: () => askStock(item) }),
          el("button.btn.btn-outline", { style: { flex: "1", justifyContent: "center", minHeight: "42px" }, text: "Показать QR", onclick: () => showQr(item) }),
        ]) : null,
      ].filter(Boolean)),
      actions,
    });
  }

  // ---------- остаток «как на полке» ----------
  function askStock(p) {
    const f = inp({ type: "number", inputmode: "numeric", value: String(Number(p.stock_qty) || 0), style: { width: "100%", minHeight: "48px", fontSize: "18px", textAlign: "center" } });
    modal({
      title: "Остаток — " + p.name,
      body: el("div", {}, [
        el("div.sku", { style: { marginBottom: "10px" }, text: "Сейчас в базе: " + (Number(p.stock_qty) || 0) }),
        field("Посчитали на полке", f),
        el("div.hint", { style: { marginTop: "8px" }, text: "Добавленные штуки зачислим по нынешней складской цене." }),
      ]),
      actions: [
        { label: "Отмена", kind: "btn-outline", onClick: c => c() },
        {
          label: "Сохранить", kind: "btn-primary", onClick: async (close) => {
            const want = Number(f.value);
            if (!isFinite(want)) { toast("Впишите число", "err"); return; }
            try {
              const r = await setStock(ctx.db, p.id, want);
              p.stock_qty = r.stock;
              close(); draw();
              toast("Остаток: " + r.stock, "ok");
            } catch (e) { toast(e.message || String(e), "err"); }
          },
        },
      ],
    });
  }

  // ---------- электронная наклейка ----------
  function showQr(p) {
    const holder = el("div", { style: { textAlign: "center" } });
    holder.innerHTML = qrSvg(skuPayload(p.id), { size: 260 });
    modal({
      title: p.name,
      body: el("div", {}, [
        holder,
        el("div.sku", { style: { textAlign: "center", marginTop: "10px" }, text: p.sku ? "Арт.: " + p.sku : "без артикула" }),
        el("div.hint", { style: { marginTop: "6px" }, text: "Можно сканировать прямо с экрана — код тот же, что на наклейке." }),
      ]),
      actions: [{ label: "Закрыть", kind: "btn-primary", onClick: c => c() }],
    });
  }

  // ---------- список ----------
  function pass(p) {
    const q = Number(p.stock_qty) || 0;
    if (filter === "low" && !(q > 0 && q <= LOW_STOCK)) return false;
    if (filter === "neg" && !(q < 0)) return false;
    if (!query) return true;
    return (p.name || "").toLowerCase().includes(query) || (p.sku || "").toLowerCase().includes(query);
  }

  function row(p) {
    const q = Number(p.stock_qty) || 0;
    const cls = q < 0 ? ".neg" : q <= LOW_STOCK ? ".low" : "";
    const own = currentCost(ensureBatches(p));
    const out = costOutlook(ensureBatches(p));
    const вал = костВалюта(p);
    const себест = костЧисло(own.cost_yuan, own.cost_usd != null ? own.cost_usd : p.cost_usd, вал);
    const sub = [p.sku ? "Арт.: " + p.sku : null, "себест: " + (себест ? костСтрока(own.cost_yuan, own.cost_usd != null ? own.cost_usd : p.cost_usd, вал) : "—")]
      .filter(Boolean).join(" · ");
    return el("div.mini-row" + cls, { onclick: () => openEdit(p) }, [
      p.photo_url
        ? el("img.ph", { src: thumb(p.photo_url, 84), loading: "lazy", decoding: "async", alt: "",
            style: { cursor: "zoom-in" }, "data-full": p.photo_url,
            onerror: function () {
              // сперва оригинал, потом просто пустая рамка — «битая картинка»
              // выглядит как поломка приложения, хотя дело в снимке
              const о = this.getAttribute("data-full");
              if (о && this.src !== о) { this.src = о; return; }
              this.replaceWith(el("div.ph"));
            },
            onclick: (e) => { e.stopPropagation(); lightbox((Array.isArray(p.photos) && p.photos.length) ? p.photos : [p.photo_url]); } })
        : el("div.ph"),
      el("div.info", {}, [
        el("div.nm", { text: p.name }),
        el("div.sku", { text: sub + (out && out.next ? ` · дальше ${костСтрока(out.next.cost_yuan, out.next.cost_usd, вал)}` : "") }),
      ]),
      el("div.qty" + cls, { text: единица(p) === "шт" ? String(q) : подписьКол(q, p) }),
    ]);
  }

  function chunk() {
    filtered.slice(shown, shown + PAGE).forEach(p => list.append(row(p)));
    shown += Math.min(PAGE, filtered.length - shown);
    more.innerHTML = "";
    if (shown < filtered.length) {
      more.append(el("button.btn.btn-outline", {
        style: { width: "100%", marginTop: "10px", minHeight: "44px", justifyContent: "center" },
        text: `Показать ещё (${filtered.length - shown})`,
        onclick: chunk,
      }));
    }
  }

  function draw() {
    list.innerHTML = ""; shown = 0;
    filtered = products.filter(pass);
    if (!filtered.length) { list.append(el("div.mini-empty", { text: "Ничего не найдено" })); more.innerHTML = ""; return; }
    chunk();
  }

  let t = 0;
  search.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => { query = search.value.trim().toLowerCase(); filter = ""; draw(); }, 180);
  });
  scanBtn.addEventListener("click", async () => {
    const raw = await scanSku();
    if (!raw) return;
    const p = await resolveScan(raw, products, ctx.db);
    if (p) { openEdit(p); return; }
    // не нашли — код остаётся в поиске, и видно, что именно прочиталось
    search.value = String(raw).trim(); query = search.value.toLowerCase(); filter = ""; draw();
    toast(scanFailText(raw), "err");
  });
  addBtn.addEventListener("click", () => openEdit(null));

  draw();

  // Пришли по ссылке с наклейки — сразу открываем карточку этого товара.
  // Пришли по ссылке с наклейки. Товара может не оказаться в загруженном
  // списке — тогда спрашиваем базу по номеру, иначе ссылка молча ничего не
  // откроет, а выглядит это как «наклейка не работает».
  const openId = ctx.params.open;
  if (openId) {
    const p = products.find(x => x.id === openId);
    if (p) openEdit(p);
    else {
      ctx.db.products.get(openId).then(one => {
        if (one && one.id) { products.push(one); draw(); openEdit(one); }
        else toast("Товар по этой наклейке не найден: " + openId, "err");
      }).catch(() => toast("Не удалось открыть товар с наклейки", "err"));
    }
  }
}
