// ========================================================================
//  НАСТРОЙКИ — курсы валют, Telegram, доступ, демо-данные
// ========================================================================
import { el, toast, field, input, confirmDialog } from "../ui.js";
import { fetchLiveRates, setRates, getRates } from "../fx.js";

const cfg = window.APP_CONFIG || {};

export default async function render(page, ctx) {
  const s = await ctx.db.getSettings();
  page.append(el("div.topbar", {}, [el("div", {}, [el("h1", { text: "Настройки" })])]));

  // ---------- Курсы валют ----------
  const fYuan = input({ type: "number", step: "0.0001", value: s.rate_yuan_usd });
  const fSom = input({ type: "number", step: "0.0000001", value: s.rate_som_usd });
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
  const catalogUrl = new URL(cfg.CATALOG_URL || "catalog.html", location.href).href;
  // хэш-форма ключа не теряется при редиректах сервера (надёжнее, чем ?key=)
  const adminUrl = location.origin + location.pathname.replace(/index\.html$/, "") + "#key=" + (cfg.SECRET_KEY || "");
  const linksCard = el("div.card", { style: { marginBottom: "18px" } }, [
    el("div.section-h", { text: "Ссылки", style: { marginTop: 0 } }),
    linkRow("Публичный каталог (для клиентов)", catalogUrl),
    linkRow("Секретная ссылка на админку", adminUrl),
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

  // ---------- Режим / демо ----------
  const sysCard = el("div.card", {}, [
    el("div.section-h", { text: "Система", style: { marginTop: 0 } }),
    el("p.muted", { text: "Режим хранения: " + (ctx.db.mode === "supabase" ? "Облако (Supabase)" : "Локальный (браузер)") }),
    ctx.db.mode === "local" && el("button.btn.btn-danger", { text: "Сбросить демо-данные", onclick: () => confirmDialog("Сбросить все локальные данные к демо?", () => { ctx.db.resetLocal(); toast("Сброшено", "ok"); ctx.refresh(); }) }),
  ].filter(Boolean));

  page.append(fxCard, tgCard, linksCard, sysCard);
}
