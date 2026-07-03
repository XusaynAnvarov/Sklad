// ========================================================================
//  СКЛАД → «Видео»: загрузка видео запчастей (для раздела «Видео» на сайте).
//  Файл идёт напрямую в приватный бакет Supabase (signed upload), без 413.
//  Смотрят только вошедшие клиенты на сайте, по временной ссылке.
// ========================================================================
import { el, toast, confirmDialog, input, showLoader, hideLoader } from "../ui.js";
import { icon } from "../icons.js";

export default async function renderVideosAdmin(page, ctx) {
  page.append(el("div.topbar", {}, [el("div", {}, [el("h1", { text: "Видео" }), el("div.sub", { text: "Видео запчастей — на сайте их видят только вошедшие клиенты" })])]));

  // --- форма загрузки ---
  const fTitle = input({ placeholder: "Название видео (напр. «Установка лапки P36LN»)", style: { maxWidth: "420px" } });
  const fFile = el("input", { type: "file", accept: "video/*", class: "inp" });
  const upBtn = el("button.btn.btn-primary", { onclick: async () => {
    const file = fFile.files && fFile.files[0];
    if (!file) { toast("Выберите видеофайл", "err"); return; }
    if (!fTitle.value.trim()) { toast("Введите название", "err"); return; }
    showLoader("Загрузка видео… (большой файл может идти минуту)");
    try {
      const path = await ctx.db.uploadVideo(file);
      await ctx.db.videos.upsert({ title: fTitle.value.trim(), path });
      toast("Видео загружено", "ok"); fTitle.value = ""; fFile.value = ""; ctx.refresh();
    } catch (e) { toast("Ошибка: " + (e.message || e), "err"); } finally { hideLoader(); }
  } }, [icon("plus", { size: 16 }), "Загрузить"]);

  page.append(el("div.card", { style: { padding: "16px", marginBottom: "18px" } }, [
    el("div.field-label", { text: "Новое видео", style: { marginBottom: "10px" } }),
    el("div", { style: { display: "block", marginBottom: "12px" } }, [fTitle]),
    el("div", { style: { display: "block", marginBottom: "12px" } }, [fFile]),
    el("div", { style: { display: "block", marginBottom: "12px" } }, [upBtn]),
    el("div", { style: { display: "block", fontSize: "12px", color: "var(--muted)", lineHeight: "1.4" } }, [el("span", { text: "Форматы: MP4/MOV/WebM. До ~100 МБ. Файл загружается напрямую в защищённое хранилище." })]),
  ]));

  // --- список ---
  let list = [];
  try { list = await ctx.db.videos.list(); } catch { list = []; }
  if (!Array.isArray(list) || !list.length) { page.append(el("div.empty", {}, [el("div.em-ic", {}, [icon("broadcast", { size: 40 })]), el("p", { text: "Видео пока нет" })])); return; }

  const tb = el("tbody");
  list.forEach(v => tb.append(el("tr", {}, [
    el("td", {}, [el("strong", { text: v.title || "—" })]),
    el("td", { text: v.created_at ? new Date(v.created_at).toLocaleDateString("ru-RU") : "—" }),
    el("td.right", {}, [el("button.btn.btn-danger.btn-sm.btn-icon", { title: "Удалить видео", onclick: () => confirmDialog("Удалить видео «" + (v.title || "") + "»?", async () => {
      try { await ctx.db.videos.remove(v.id); toast("Удалено", "ok"); ctx.refresh(); } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
    }) }, [icon("trash", { size: 15 })])]),
  ])));
  page.append(el("div", { style: { overflowX: "auto" } }, [el("table.tbl", {}, [
    el("thead", {}, [el("tr", {}, ["Название", "Загружено", ""].map(h => el("th", { text: h })))]), tb,
  ])]));
}
