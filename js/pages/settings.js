// ========================================================================
//  НАСТРОЙКИ — курсы валют, Telegram, доступ, демо-данные
// ========================================================================
import { el, toast, field, input, confirmDialog } from "../ui.js";
import { fetchLiveRates, setRates, getRates } from "../fx.js";
import { rawClient } from "../db.js";

const cfg = window.APP_CONFIG || {};

export default async function render(page, ctx) {
  const s = (await ctx.db.getSettings()) || {};
  page.append(el("div.topbar", {}, [el("div", {}, [el("h1", { text: "Настройки" })])]));

  // ---------- Курсы валют ----------
  const fYuan = input({ type: "number", step: "0.0001", value: s.rate_yuan_usd ?? 0.14 });
  const fSom = input({ type: "number", step: "0.0000001", value: s.rate_som_usd ?? 0.000079 });
  const updated = el("div.hint", { text: "Обновлено: " + new Date(s.rates_updated_at || Date.now()).toLocaleString("ru-RU") });

  const fxCard = el("div.card", { style: { marginBottom: "18px" } }, [
    el("div.section-h", { text: "Курсы валют (к доллару)", style: { marginTop: 0 } }),
    el("div.row2", {}, [
      field("1 юань = $ (yuan→usd)", fYuan),
      field("1 сум = $ (som→usd)", fSom),
    ]),
    updated,
    el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap" } }, [
      el("button.btn.btn-outline", { text: "Обновить из интернета", onclick: async () => {
        toast("Получаю курсы…", "info");
        try {
          const live = await fetchLiveRates();
          fYuan.value = live.rate_yuan_usd.toFixed(4); fSom.value = live.rate_som_usd.toFixed(8);
          toast("Курсы получены, нажмите «Сохранить»", "ok");
        } catch (e) { toast(e.message, "err"); }
      } }),
      el("button.btn.btn-primary", { text: "Сохранить курсы", onclick: async () => {
        const patch = { rate_yuan_usd: +fYuan.value, rate_som_usd: +fSom.value, rates_updated_at: new Date().toISOString() };
        await ctx.db.saveSettings(patch); setRates({ ...s, ...patch });
        toast("Курсы сохранены", "ok"); ctx.refresh();
      } }),
    ]),
  ]);

  // ---------- Telegram ----------
  const fChannel = input({ value: s.telegram_channel || cfg.TELEGRAM_CHANNEL || "", placeholder: "@my_channel или -100…" });
  const tgCard = el("div.card", { style: { marginBottom: "18px" } }, [
    el("div.section-h", { text: "Telegram", style: { marginTop: 0 } }),
    field("Канал для накладных", fChannel),
    el("div.hint", { text: "Токен бота хранится на сервере (переменные Vercel), не здесь. Бот должен быть админом канала." }),
    el("button.btn.btn-primary", { text: "Сохранить канал", onclick: async () => { await ctx.db.saveSettings({ telegram_channel: fChannel.value.trim() }); toast("Сохранено", "ok"); } }),
  ]);

  // ---------- Ссылки ----------
  const catalogUrl = new URL(cfg.CATALOG_URL || "/", location.href).href;
  const adminUrl = location.origin + "/admin";
  const linksCard = el("div.card", { style: { marginBottom: "18px" } }, [
    el("div.section-h", { text: "Ссылки", style: { marginTop: 0 } }),
    linkRow("Публичный каталог (для клиентов)", catalogUrl),
    linkRow("Вход в склад", adminUrl),
  ]);
  function linkRow(label, url) {
    const f = input({ value: url, readonly: true });
    return el("div", { style: { marginBottom: "12px" } }, [
      el("div.field-label", { text: label, style: { marginBottom: "6px" } }),
      el("div", { style: { display: "flex", gap: "8px" } }, [
        f,
        el("button.btn.btn-outline.btn-sm", { text: "Копировать", onclick: () => { navigator.clipboard?.writeText(url); toast("Скопировано", "ok"); } }),
        el("a.btn.btn-outline.btn-sm", { text: "Открыть", href: url, target: "_blank" }),
      ]),
    ]);
  }

  // ---------- Резервная копия данных ----------
  const TABLES = ["products", "customers", "sales", "purchases", "payments"];

  // Полная выгрузка таблицы. В облаке supabase-js по умолчанию отдаёт максимум
  // 1000 строк — поэтому читаем постранично через .range(), чтобы копия была полной.
  async function dumpTable(t) {
    if (ctx.db.mode !== "supabase") return ctx.db[t].list();
    const sb = rawClient();
    const PAGE = 1000;
    let from = 0, out = [];
    for (;;) {
      const { data, error } = await sb.from(t).select("*").range(from, from + PAGE - 1);
      if (error) throw new Error(t + ": " + error.message);
      out = out.concat(data || []);
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return out;
  }

  async function exportData() {
    toast("Готовлю копию…", "info");
    try {
      const [products, customers, sales, purchases, payments, settings] = await Promise.all([
        dumpTable("products"), dumpTable("customers"), dumpTable("sales"),
        dumpTable("purchases"), dumpTable("payments"), ctx.db.getSettings(),
      ]);
      const payload = {
        app: "sklad", exported_at: new Date().toISOString(), mode: ctx.db.mode,
        data: { products, customers, sales, purchases, payments, settings },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      a.href = url; a.download = `sklad-backup-${stamp}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Копия скачана", "ok");
    } catch (e) { toast("Ошибка: " + e.message, "err"); }
  }

  async function restoreFrom(payload) {
    const d = (payload && payload.data) || payload || {};
    if (!Array.isArray(d.products) && !Array.isArray(d.customers))
      throw new Error("Файл не похож на копию склада");
    const settingsRow = Array.isArray(d.settings) ? d.settings[0] : d.settings;

    if (ctx.db.mode === "supabase") {
      const sb = rawClient();
      for (const t of TABLES) {
        const rows = d[t];
        if (!Array.isArray(rows) || !rows.length) continue;
        const { error } = await sb.from(t).upsert(rows, { onConflict: "id" });
        if (error) throw new Error(t + ": " + error.message);
      }
      if (settingsRow) {
        const { error } = await sb.from("settings").upsert(settingsRow, { onConflict: "id" });
        if (error) throw new Error("settings: " + error.message);
      }
    } else {
      for (const t of TABLES)
        for (const row of (d[t] || [])) await ctx.db[t].upsert(row);
      if (settingsRow) await ctx.db.saveSettings(settingsRow);
    }
  }

  const restoreInput = el("input", {
    type: "file", accept: "application/json,.json", style: { display: "none" },
    onchange: async (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      let payload;
      try { payload = JSON.parse(await file.text()); }
      catch { return toast("Не удалось прочитать файл", "err"); }
      const d = (payload && payload.data) || payload || {};
      const np = (d.products || []).length, nc = (d.customers || []).length, ns = (d.sales || []).length;
      confirmDialog(
        `Восстановить из файла? Совпадающие записи будут перезаписаны.\nТоваров: ${np}, клиентов: ${nc}, продаж: ${ns}.`,
        async () => {
          toast("Восстанавливаю…", "info");
          try { await restoreFrom(payload); toast("Восстановлено", "ok"); ctx.refresh(); }
          catch (err) { toast("Ошибка: " + err.message, "err"); }
        });
    },
  });

  const backupCard = el("div.card", { style: { marginBottom: "18px" } }, [
    el("div.section-h", { text: "Резервная копия данных", style: { marginTop: 0 } }),
    el("p.muted", { text: "Сохраните копию всех данных (товары, клиенты, продажи, приходы, оплаты, настройки) в файл и храните в надёжном месте (флешка / облако).", style: { lineHeight: "1.55", marginBottom: "16px" } }),
    el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap" } }, [
      el("button.btn.btn-primary", { text: "📥 Скачать копию", onclick: exportData }),
      el("button.btn.btn-outline", { text: "📤 Восстановить из файла", onclick: () => restoreInput.click() }),
    ]),
    restoreInput,
    el("div.hint", { text: "Восстановление перезаписывает записи с тем же id данными из файла (удалённые — возвращает). Делайте свежую копию перед восстановлением.", style: { marginTop: "14px", marginBottom: 0, lineHeight: "1.5" } }),
  ]);

  // ---------- Режим / демо ----------
  const sysCard = el("div.card", {}, [
    el("div.section-h", { text: "Система", style: { marginTop: 0 } }),
    el("p.muted", { text: "Режим хранения: " + (ctx.db.mode === "supabase" ? "Облако (Supabase)" : "Локальный (браузер)") }),
    ctx.db.mode === "local" && el("button.btn.btn-danger", { text: "Сбросить демо-данные", onclick: () => confirmDialog("Сбросить все локальные данные к демо?", () => { ctx.db.resetLocal(); toast("Сброшено", "ok"); ctx.refresh(); }) }),
  ].filter(Boolean));

  // ---------- Смена пароля администратора ----------
  const fCurPass  = input({ type: "password", placeholder: "Текущий пароль" });
  const fNewLogin = input({ placeholder: "Новый логин (оставьте пустым — без изменений)" });
  const fNewPass  = input({ type: "password", placeholder: "Новый пароль (мин. 6 символов)" });
  const fNewPass2 = input({ type: "password", placeholder: "Повторите новый пароль" });

  const passCard = el("div.card", { style: { marginBottom: "18px" } }, [
    el("div.section-h", { text: "Смена логина / пароля склада", style: { marginTop: 0 } }),
    el("p.muted", { text: "Логин и пароль для входа в панель администратора. Изменения сохраняются на сервере.", style: { marginBottom: "14px", lineHeight: "1.55" } }),
    field("Текущий пароль", fCurPass),
    field("Новый логин", fNewLogin),
    field("Новый пароль", fNewPass),
    field("Повторите пароль", fNewPass2),
    el("button.btn.btn-primary", { text: "Сохранить", onclick: async () => {
      if (!fCurPass.value) return toast("Введите текущий пароль", "err");
      if (fNewPass.value !== fNewPass2.value) return toast("Пароли не совпадают", "err");
      const token = localStorage.getItem("sklad_admin_token") || "";
      try {
        const res = await fetch("/api/admin-change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ current_password: fCurPass.value, new_login: fNewLogin.value.trim(), new_password: fNewPass.value }),
        });
        const data = await res.json();
        if (!res.ok) return toast(data.error || "Ошибка", "err");
        toast("Пароль изменён. Войдите заново.", "ok");
        fCurPass.value = fNewLogin.value = fNewPass.value = fNewPass2.value = "";
        // выход через 2 секунды
        setTimeout(() => { localStorage.removeItem("sklad_admin_token"); localStorage.removeItem("sklad_authed"); location.reload(); }, 2000);
      } catch (e) { toast("Сетевая ошибка: " + e.message, "err"); }
    } }),
  ]);

  page.append(fxCard, tgCard, linksCard, passCard, backupCard, sysCard);
}
