// ========================================================================
//  НАСТРОЙКИ — курсы валют, Telegram, доступ, демо-данные
// ========================================================================
import { el, toast, field, input, select, inputList, confirmDialog, showLoader, hideLoader } from "../ui.js?v=20260821c";
import { fetchLiveRates, setRates, getRates } from "../fx.js?v=20260821c";
import { authHeaders } from "../db.js?v=20260821c";
import { loadRules, saveRules, DEFAULT_RULES, KIND_LABEL, MODE_LABEL } from "../profit.js?v=20260821c";

const cfg = window.APP_CONFIG || {};

export default async function render(page, ctx) {
  const s = (await ctx.db.getSettings()) || {};
  page.append(el("div.topbar", {}, [el("div", {}, [el("h1", { text: "Настройки" })])]));

  // ---------- Курсы валют ----------
  // Вводим по-человечески: «сколько сумов/юаней за 1 доллар».
  // Внутри система хранит обратные величины (сколько $ в одной единице).
  const somPerUsd = s.rate_som_usd > 0 ? Math.round(1 / s.rate_som_usd) : 12700;
  const yuanPerUsd = s.rate_yuan_usd > 0 ? +(1 / s.rate_yuan_usd).toFixed(3) : 7.15;
  const fSom = input({ type: "number", step: "1", min: "0", value: somPerUsd });
  const fYuan = input({ type: "number", step: "0.01", min: "0", value: yuanPerUsd });
  const updated = el("div.hint", { text: "Обновлено: " + new Date(s.rates_updated_at || Date.now()).toLocaleString("ru-RU") });
  // подсказка «что получится» — сразу видно, не ошиблись ли в нуле
  const preview = el("div.hint", { style: { marginTop: "-4px" } });
  const drawPreview = () => {
    const sp = +fSom.value || 0, yp = +fYuan.value || 0;
    preview.textContent = sp > 0 && yp > 0
      ? `Получится: $1 = ${sp.toLocaleString("ru-RU")} сум · $1 = ${yp} ¥ · 1 ¥ = ${Math.round(sp / yp).toLocaleString("ru-RU")} сум`
      : "Впишите оба курса";
  };
  drawPreview();
  fSom.addEventListener("input", drawPreview);
  fYuan.addEventListener("input", drawPreview);

  const fxCard = el("div.card", { style: { marginBottom: "18px" } }, [
    el("div.section-h", { text: "Курсы валют", style: { marginTop: 0 } }),
    el("p.muted", { text: "Впишите курс вручную — сколько сумов и юаней вы считаете за 1 доллар. По этому курсу пересчитываются отчёты и итоги.", style: { lineHeight: "1.55", marginBottom: "14px" } }),
    el("div.row2", {}, [
      field("Сколько сумов за 1 доллар", fSom),
      field("Сколько юаней за 1 доллар", fYuan),
    ]),
    preview,
    updated,
    el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap" } }, [
      el("button.btn.btn-outline", { text: "Подставить из интернета", onclick: async () => {
        toast("Получаю курсы…", "info");
        try {
          const live = await fetchLiveRates();
          fSom.value = Math.round(1 / live.rate_som_usd);
          fYuan.value = +(1 / live.rate_yuan_usd).toFixed(3);
          drawPreview();
          toast("Курсы подставлены, нажмите «Сохранить»", "ok");
        } catch (e) { toast(e.message, "err"); }
      } }),
      el("button.btn.btn-primary", { text: "Сохранить курсы", onclick: async () => {
        const sp = +fSom.value || 0, yp = +fYuan.value || 0;
        if (sp <= 0 || yp <= 0) { toast("Курсы должны быть больше нуля", "err"); return; }
        const patch = { rate_som_usd: 1 / sp, rate_yuan_usd: 1 / yp, rates_updated_at: new Date().toISOString() };
        await ctx.db.saveSettings(patch); setRates({ ...s, ...patch });
        toast("Курсы сохранены", "ok"); ctx.refresh();
      } }),
    ]),
  ]);

  // ---------- Telegram ----------
  const fChannel = input({ value: s.telegram_channel || (() => { try { return localStorage.getItem("gm_tg_channel") || ""; } catch { return ""; } })() || cfg.TELEGRAM_CHANNEL || "", placeholder: "@my_channel или -100…" });
  const tgCard = el("div.card", { style: { marginBottom: "18px" } }, [
    el("div.section-h", { text: "Telegram", style: { marginTop: 0 } }),
    field("Канал для накладных", fChannel),
    el("div.hint", { text: "Токен бота хранится на сервере (переменные Vercel), не здесь. Бот должен быть админом канала." }),
    el("button.btn.btn-primary", { text: "Сохранить канал", onclick: async () => { const v = fChannel.value.trim(); try { localStorage.setItem("gm_tg_channel", v); } catch {} try { await ctx.db.saveSettings({ telegram_channel: v }); toast("Сохранено", "ok"); } catch (e) { toast("Запомнили локально; в облако не сохранилось: " + (e.message || e), "err"); } } }),
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

  // ---------- Видео-инструкция для клиентов ----------
  const guideLang = select([{ value: "ru", label: "Русская версия" }, { value: "uz", label: "O'zbekcha" }], "ru");
  const guideTest = input({ placeholder: "chat_id для теста (необязательно)", style: { maxWidth: "260px" } });
  async function sendGuide(all) {
    const lang = guideLang.value;
    const chat_id = guideTest.value.trim();
    if (all && !chat_id) {
      // массовая рассылка — только после подтверждения
      return confirmDialog("Отправить видео-инструкцию ВСЕМ клиентам с Telegram? Сообщение придёт каждому.", () => doSend(lang, null));
    }
    if (!chat_id) { toast("Впишите chat_id для теста или нажмите «Отправить всем»", "err"); return; }
    doSend(lang, chat_id);
  }
  async function doSend(lang, chat_id) {
    showLoader(chat_id ? "Отправка…" : "Рассылка клиентам…");
    try {
      const r = await fetch("/api/send-guide", {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ lang, ...(chat_id ? { chat_id } : {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      toast(`Отправлено: ${j.sent || 0}` + (j.failed ? ` · не дошло: ${j.failed}` : ""), j.sent ? "ok" : "err");
    } catch (e) { toast("Ошибка: " + (e.message || e), "err"); }
    finally { hideLoader(); }
  }
  const guideUrl = (l) => location.origin + "/guide/guide-" + l + ".gif";
  const guideCard = el("div.card", { style: { marginBottom: "18px" } }, [
    el("div.section-h", { text: "Видео-инструкция для клиентов", style: { marginTop: 0 } }),
    el("div.hint", { text: "Короткое видео: как зарегистрироваться на сайте и в Telegram-боте. Бот отправит его клиентам как видео." }),
    el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", margin: "10px 0" } }, [
      guideLang, guideTest,
      el("button.btn.btn-outline", { text: "Отправить себе (тест)", onclick: () => sendGuide(false) }),
      el("button.btn.btn-primary", { text: "📢 Отправить всем клиентам", onclick: () => sendGuide(true) }),
    ]),
    el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
      el("a.btn.btn-outline.btn-sm", { text: "Посмотреть (ru)", href: guideUrl("ru"), target: "_blank" }),
      el("a.btn.btn-outline.btn-sm", { text: "Посмотреть (uz)", href: guideUrl("uz"), target: "_blank" }),
      el("button.btn.btn-outline.btn-sm", { text: "Копировать ссылку (ru)", onclick: () => { navigator.clipboard?.writeText(guideUrl("ru")); toast("Ссылка скопирована — можно вставить в Telegram", "ok"); } }),
    ]),
  ]);

  // ---------- Резервная копия данных ----------
  const TABLES = ["products", "customers", "sales", "purchases", "payments"];

  // Полная выгрузка таблицы. Читаем через серверный прокси (service_key, минуя RLS) —
  // прямой anon-клиент даёт "permission denied for table products" (только column-grants).
  // Постранично (limit/offset), т.к. PostgREST по умолчанию отдаёт максимум 1000 строк.
  async function dumpTable(t) {
    if (ctx.db.mode !== "supabase") return ctx.db[t].list();
    const headers = await authHeaders();
    const PAGE = 1000;
    let from = 0, out = [];
    for (;;) {
      const r = await fetch(`/api/admin/db?table=${encodeURIComponent(t)}&limit=${PAGE}&offset=${from}`, { headers });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(t + ": " + ((data && data.error) || r.status));
      const arr = Array.isArray(data) ? data : [];
      out = out.concat(arr);
      if (arr.length < PAGE) break;
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

    // и для облака, и для локали пишем через единый интерфейс (в облаке — прокси с service_key).
    // Прямой anon-клиент дал бы "permission denied" на запись в products и др.
    for (const t of TABLES)
      for (const row of (d[t] || [])) await ctx.db[t].upsert(row);
    if (settingsRow) await ctx.db.saveSettings(settingsRow);
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

  // ---------- Прибыль по группам товаров ----------
  // Правило = «категория/название → % от выручки или $ за штуку».
  // Приоритет при подборе: точное название → содержит → категория (см. js/profit.js).
  let rules = loadRules(s);
  let allProducts = [];
  try { allProducts = await ctx.db.products.list(); } catch { allProducts = []; }
  const allCats = [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const allNames = allProducts.map(p => p.name).filter(Boolean).sort((a, b) => a.localeCompare(b, "ru"));

  const rulesBox = el("div");
  function drawRules() {
    rulesBox.innerHTML = "";
    if (!rules.length) rulesBox.append(el("div.empty", { style: { padding: "18px" } }, [el("p", { text: "Правил нет — прибыль везде считается по общему проценту валюты" })]));
    rules.forEach((r, i) => {
      const fKind = select([
        { value: "category", label: KIND_LABEL.category },
        { value: "name", label: KIND_LABEL.name },
        { value: "contains", label: KIND_LABEL.contains },
      ], r.kind, { style: { minWidth: "150px" } });
      const fKey = inputList(r.kind === "category" ? allCats : allNames, { value: r.key, placeholder: r.kind === "category" ? "Например: Нинала" : "Например: Нож-100", style: { minWidth: "180px" } });
      const fMode = select([
        { value: "pct", label: MODE_LABEL.pct },
        { value: "fixed_usd", label: MODE_LABEL.fixed_usd },
      ], r.mode, { style: { minWidth: "140px" } });
      const fVal = input({ type: "number", step: "0.1", min: "0", value: r.value, style: { width: "100px", textAlign: "center" } });
      // группа = название отдельной карточки на Дашборде (Иглы, Ножи…)
      const fGroup = inputList([...new Set(rules.map(x => x.group).filter(Boolean))], { value: r.group || "", placeholder: "Группа (напр. Иглы)", style: { width: "160px" } });

      fKind.addEventListener("change", () => { r.kind = fKind.value; drawRules(); });
      fKey.addEventListener("input", () => { r.key = fKey.value; });
      fMode.addEventListener("change", () => { r.mode = fMode.value; drawRules(); });
      fVal.addEventListener("input", () => { r.value = +fVal.value || 0; });
      fGroup.addEventListener("input", () => { r.group = fGroup.value; });

      rulesBox.append(el("div.card", { style: { padding: "10px 12px", marginBottom: "8px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" } }, [
        fKind, fKey, fMode, fVal,
        el("span.muted", { style: { fontSize: "12px" }, text: r.mode === "fixed_usd" ? "$ с каждой штуки" : "% от суммы продажи" }),
        fGroup,
        el("button.btn.btn-danger.btn-sm.btn-icon", { title: "Удалить правило", onclick: () => { rules.splice(i, 1); drawRules(); } }, ["🗑"]),
      ]));
    });
  }
  drawRules();

  const profitCard = el("div.card", { style: { marginBottom: "18px" } }, [
    el("div.section-h", { text: "Прибыль по группам товаров", style: { marginTop: 0 } }),
    el("p.muted", { text: "У разных товаров прибыль разная. Здесь можно задать: у категории «Нинала» (иглы) — 10% от выручки, у Нож-70/90/100/125 — по $5 с каждой штуки. Товары без правила считаются по общему проценту валюты с Дашборда.", style: { lineHeight: "1.55", marginBottom: "14px" } }),
    rulesBox,
    el("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" } }, [
      el("button.btn.btn-outline", { text: "+ Добавить правило", onclick: () => { rules.push({ id: "r" + Date.now(), kind: "category", key: "", mode: "pct", value: 10, group: "", note: "" }); drawRules(); } }),
      el("button.btn.btn-primary", { text: "Сохранить правила", onclick: async () => {
        const bad = rules.find(r => !String(r.key || "").trim());
        if (bad) { toast("Заполните значение во всех правилах (или удалите пустое)", "err"); return; }
        showLoader("Сохраняем…");
        const res = await saveRules(ctx, rules);
        hideLoader();
        if (res.ok) toast("Правила сохранены", "ok");
        else toast("Запомнили в браузере; в облако не сохранилось: " + res.error, "err");
      } }),
      el("button.btn.btn-outline", { text: "Вернуть базовые (иглы 10%, ножи $5)", onclick: () => confirmDialog("Заменить все правила базовыми: иглы (Нинала) — 10%, Нож-70/90/100/125 — $5 за штуку?", () => { rules = DEFAULT_RULES.map(r => ({ ...r })); drawRules(); toast("Базовые правила подставлены — нажмите «Сохранить»", "ok"); }) }),
    ]),
    el("div.hint", { text: "Порядок подбора: сначала точное название товара, потом «содержит в названии», потом категория. Первое подошедшее правило и применяется.", style: { marginTop: "14px", marginBottom: "6px", lineHeight: "1.5" } }),
    el("div.hint", { text: "«Группа» — под каким названием группа выходит отдельной карточкой на Дашборде (напр. все четыре ножа с группой «Ножи» дают одну карточку). Там же можно менять число, не заходя в Настройки.", style: { marginTop: 0, marginBottom: 0, lineHeight: "1.5" } }),
  ]);

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

  page.append(fxCard, profitCard, tgCard, linksCard, guideCard, passCard, backupCard, sysCard);
}
