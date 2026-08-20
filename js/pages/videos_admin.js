// ========================================================================
//  СКЛАД → «Видео»: загрузка видео запчастей (для раздела «Видео» на сайте).
//  Файл идёт напрямую в приватный бакет Supabase (signed upload), без 413.
//  Смотрят только вошедшие клиенты на сайте, по временной ссылке.
//  Видео можно привязать к товару (видно фото+имя) и переименовать.
// ========================================================================
import { el, toast, confirmDialog, modal, input, inputList, showLoader, hideLoader } from "../ui.js?v=20260820a";
import { placeholder } from "./products.js?v=20260820a";
import { icon } from "../icons.js?v=20260820a";
import { thumb } from "../img.js?v=20260820a";

export default async function renderVideosAdmin(page, ctx) {
  page.append(el("div.topbar", {}, [el("div", {}, [el("h1", { text: "Видео" }), el("div.sub", { text: "Видео запчастей — на сайте их видят только вошедшие клиенты" })])]));

  // товары для привязки видео (id ↔ товар)
  let products = [];
  try { products = await ctx.db.products.list(); } catch { products = []; }
  const pmap = Object.fromEntries(products.map(p => [p.id, p]));
  const nameToId = {}; products.forEach(p => { nameToId[(p.name || "").toLowerCase()] = p.id; });

  // --- форма загрузки ---
  const fTitle = input({ placeholder: "Название видео (напр. «Установка лапки P36LN»)", style: { maxWidth: "420px" } });
  const fProduct = inputList(products.map(p => p.name), { placeholder: "Привязать к товару (необязательно)", style: { maxWidth: "420px" } });
  const fFile = el("input", { type: "file", accept: "video/*", class: "inp" });
  const upBtn = el("button.btn.btn-primary", { onclick: async () => {
    const file = fFile.files && fFile.files[0];
    if (!file) { toast("Выберите видеофайл", "err"); return; }
    if (!fTitle.value.trim()) { toast("Введите название", "err"); return; }
    showLoader("Загрузка видео… (большой файл может идти минуту)");
    try {
      const path = await ctx.db.uploadVideo(file);
      const product_id = nameToId[(fProduct.value || "").trim().toLowerCase()] || null;
      await ctx.db.videos.upsert({ title: fTitle.value.trim(), path, product_id });
      toast("Видео загружено", "ok"); fTitle.value = ""; fFile.value = ""; fProduct.value = ""; ctx.refresh();
    } catch (e) { toast("Ошибка: " + (e.message || e), "err"); } finally { hideLoader(); }
  } }, [icon("plus", { size: 16 }), "Загрузить"]);

  page.append(el("div.card", { style: { padding: "16px", marginBottom: "18px" } }, [
    el("div.field-label", { text: "Новое видео", style: { marginBottom: "10px" } }),
    el("div", { style: { display: "block", marginBottom: "12px" } }, [fTitle]),
    el("div", { style: { display: "block", marginBottom: "12px" } }, [fProduct]),
    el("div", { style: { display: "block", marginBottom: "12px" } }, [fFile]),
    el("div", { style: { display: "block", marginBottom: "12px" } }, [upBtn]),
    el("div", { style: { display: "block", fontSize: "12px", color: "var(--muted)", lineHeight: "1.4" } }, [el("span", { text: "Форматы: MP4/MOV/WebM. До ~100 МБ. Файл загружается напрямую в защищённое хранилище." })]),
  ]));

  // --- список ---
  let list = [];
  try { list = await ctx.db.videos.list(); } catch { list = []; }
  if (!Array.isArray(list) || !list.length) { page.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("broadcast", { size: 40 })]), el("p", { text: "Видео пока нет" })])); return; }

  const tb = el("tbody");
  list.forEach(v => {
    const prod = v.product_id ? pmap[v.product_id] : null;
    const prodCell = prod
      ? el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, [
          el("img.thumb", { src: prod.photo_url ? thumb(prod.photo_url, 34) : placeholder(prod.name), loading: "lazy", decoding: "async", style: { width: "34px", height: "34px" }, onerror: function () { this.src = placeholder(prod.name); } }),
          el("span", { text: prod.name }),
        ])
      : el("span.muted", { text: "—" });
    tb.append(el("tr", {}, [
      el("td", {}, [el("strong", { text: v.title || "—" })]),
      el("td", {}, [prodCell]),
      el("td", { text: v.created_at ? new Date(v.created_at).toLocaleDateString("ru-RU") : "—" }),
      el("td.right", {}, [el("div.row-actions", {}, [
        el("button.btn.btn-outline.btn-sm.btn-icon", { title: "Изменить", onclick: () => editVideo(ctx, v, products) }, [icon("edit", { size: 15 })]),
        el("button.btn.btn-danger.btn-sm.btn-icon", { title: "Удалить видео", onclick: () => confirmDialog("Удалить видео «" + (v.title || "") + "»?", async () => {
          try { await ctx.db.videos.remove(v.id); toast("Удалено", "ok"); ctx.refresh(); } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
        }) }, [icon("trash", { size: 15 })]),
      ])]),
    ]));
  });
  page.append(el("div", { style: { overflowX: "auto" } }, [el("table.tbl", {}, [
    el("thead", {}, [el("tr", {}, ["Название", "Товар", "Загружено", ""].map(h => el("th", { text: h })))]), tb,
  ])]));
}

// Правка видео: название + привязанный товар (файл не меняем)
function editVideo(ctx, v, products) {
  const nameToId = {}; products.forEach(p => { nameToId[(p.name || "").toLowerCase()] = p.id; });
  const curProd = v.product_id ? products.find(p => p.id === v.product_id) : null;
  const fTitle = input({ value: v.title || "", placeholder: "Название видео" });
  const fProduct = inputList(products.map(p => p.name), { value: curProd ? curProd.name : "", placeholder: "Товар (необязательно)" });
  modal({
    title: "Изменить видео",
    body: el("div", {}, [
      el("div.field-label", { text: "Название" }), fTitle,
      el("div.field-label", { text: "Товар", style: { marginTop: "12px" } }), fProduct,
    ]),
    actions: [
      { label: "Отмена", kind: "btn-outline", onClick: c => c() },
      { label: "Сохранить", kind: "btn-primary", onClick: async (close) => {
        if (!fTitle.value.trim()) { toast("Введите название", "err"); return; }
        const product_id = nameToId[(fProduct.value || "").trim().toLowerCase()] || null;
        try { await ctx.db.videos.upsert({ id: v.id, title: fTitle.value.trim(), product_id }); toast("Сохранено", "ok"); close(); ctx.refresh(); }
        catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
      } },
    ],
  });
}
