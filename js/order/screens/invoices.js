// ========================================================================
//  НАКЛАДНЫЕ — все оформленные накладные клиента.
//
//  В чате бота помещаются только последние десять, а у постоянных клиентов
//  их десятки. Здесь — полный список по месяцам, с остатком долга по
//  каждой накладной и фильтром «все / с долгом / оплачено».
//  Нажал на накладную — PDF приходит в чат с ботом.
// ========================================================================
import { el } from "../../el.js?v=20260926a";
import { icon } from "../../icons.js?v=20260926a";
import { toast } from "../../ui.js?v=20260926a";
import { fmt } from "../../fx.js?v=20260926a";
import { getLang } from "../../i18n.js?v=20260926a";
import { мои } from "../api.js?v=20260926a";

const ВАЛЮТЫ = ["som", "usd", "yuan"];
const суммой = (o) => ВАЛЮТЫ.filter(c => o && o[c]).map(c => fmt(o[c], c)).join(" + ") || "0";
const естьДолг = (inv) => ВАЛЮТЫ.some(c => inv.remaining && inv.remaining[c]);

const МЕСЯЦ = {
  ru: ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"],
  uz: ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const ШТ = { ru: "шт", uz: "ta", en: "pcs" };
const язык = () => (МЕСЯЦ[getLang()] ? getLang() : "ru");

// Подписи здесь собираются из кусков и перерисовываются при смене фильтра,
// поэтому переводим сами, а не общим проходом по странице.
const СЛОВА = {
  "Долг по накладным": { uz: "Nakladnoylar bo‘yicha qarz", en: "Debt on invoices" },
  "Все накладные оплачены": { uz: "Barcha nakladnoylar to‘langan", en: "All invoices are paid" },
  "Накладных": { uz: "Nakladnoylar", en: "Invoices" },
  "с долгом": { uz: "qarzdor", en: "with debt" },
  "Все": { uz: "Hammasi", en: "All" },
  "С долгом": { uz: "Qarzdor", en: "With debt" },
  "Оплачено": { uz: "To‘langan", en: "Paid" },
  "Долг": { uz: "Qarz", en: "Debt" },
  "Накладных пока нет.": { uz: "Hozircha nakladnoy yo‘q.", en: "No invoices yet." },
  "Накладных с долгом нет.": { uz: "Qarzdor nakladnoy yo‘q.", en: "No invoices with debt." },
  "Оплаченных накладных пока нет.": { uz: "Hozircha to‘langan nakladnoy yo‘q.", en: "No paid invoices yet." },
  "PDF отправлен в чат с ботом": { uz: "PDF bot chatiga yuborildi", en: "PDF sent to the bot chat" },
  "Не удалось отправить PDF": { uz: "PDF yuborilmadi", en: "Could not send the PDF" },
  "Не удалось загрузить накладные": { uz: "Nakladnoylar yuklanmadi", en: "Could not load invoices" },
};
const т = (ru) => { const я = язык(); return я === "ru" ? ru : ((СЛОВА[ru] && СЛОВА[ru][я]) || ru); };

const дата = (d) => {
  const t = new Date(d);
  return isFinite(t) ? String(t.getDate()).padStart(2, "0") + "." + String(t.getMonth() + 1).padStart(2, "0") : "—";
};

// Сложить суммы по валютам.
function сложить(список, поле) {
  const out = {};
  for (const inv of список) for (const c of ВАЛЮТЫ) if (inv[поле] && inv[поле][c]) out[c] = (out[c] || 0) + inv[поле][c];
  return out;
}

export default async function render(box) {
  let все = [];
  let фильтр = "all";

  box.append(el("div.mini-boot", {}, [el("div.mini-spin")]));
  try {
    все = (await мои("invoices")).invoices || [];
  } catch (e) {
    box.innerHTML = "";
    box.append(el("div.mini-empty", { text: e.message || т("Не удалось загрузить накладные") }));
    return;
  }

  function рисовать() {
    box.innerHTML = "";
    if (!все.length) {
      box.append(el("div.mini-empty", { text: т("Накладных пока нет.") }));
      return;
    }

    // итог долга по всем накладным — сверху
    const долг = сложить(все, "remaining");
    const сДолгом = все.filter(естьДолг).length;
    box.append(el("div.inv-sum" + (сДолгом ? ".debt" : ".paid"), {}, [
      el("div.l", { text: сДолгом ? т("Долг по накладным") : т("Все накладные оплачены") }),
      сДолгом ? el("div.v", { text: суммой(долг) }) : null,
      el("div.s", { text: `${т("Накладных")}: ${все.length}` + (сДолгом ? ` · ${т("с долгом")}: ${сДолгом}` : "") }),
    ].filter(Boolean)));

    // фильтр
    const кнопки = [["all", т("Все")], ["debt", т("С долгом")], ["paid", т("Оплачено")]];
    box.append(el("div.inv-filter", {}, кнопки.map(([k, t]) =>
      el("button" + (фильтр === k ? ".on" : ""), { text: t, onclick: () => { фильтр = k; рисовать(); } }))));

    const видно = все.filter(inv => фильтр === "all" || (фильтр === "debt" ? естьДолг(inv) : !естьДолг(inv)));
    if (!видно.length) {
      box.append(el("div.mini-empty", { text: фильтр === "debt" ? т("Накладных с долгом нет.") : т("Оплаченных накладных пока нет.") }));
      return;
    }

    // по месяцам
    const месяцы = new Map();
    for (const inv of видно) {
      const t = new Date(inv.date);
      const ключ = isFinite(t) ? t.getFullYear() * 100 + t.getMonth() : 0;
      if (!месяцы.has(ключ)) месяцы.set(ключ, []);
      месяцы.get(ключ).push(inv);
    }
    const я = язык();
    for (const [ключ, список] of месяцы) {
      const название = ключ ? `${МЕСЯЦ[я][ключ % 100]} ${Math.floor(ключ / 100)}` : "—";
      box.append(el("div.inv-month", {}, [
        el("span", { text: название }),
        el("span.s", { text: `${список.length} ${ШТ[я]} · ${суммой(сложить(список, "totals"))}` }),
      ]));
      const лента = el("div.mini-list");
      for (const inv of список) лента.append(строка(inv));
      box.append(лента);
    }
  }

  function строка(inv) {
    const долг = естьДолг(inv);
    const кнопка = el("div.mini-row.inv-row", {}, [
      el("div.inv-date", { text: дата(inv.date) }),
      el("div.info", {}, [
        el("div.nm", { text: суммой(inv.totals) }),
        el("div.ord-mark." + (долг ? "no" : "done"), { text: долг ? т("Долг") + " " + суммой(inv.remaining) : т("Оплачено") }),
      ]),
      el("div.qty", {}, [icon("send", { size: 16 })]),
    ]);
    кнопка.addEventListener("click", async () => {
      if (кнопка.classList.contains("busy")) return;
      кнопка.classList.add("busy");
      try {
        await мои("invoice_pdf", { invoice_id: inv.id });
        toast(т("PDF отправлен в чат с ботом"), "ok");
      } catch (e) {
        toast(e.message || т("Не удалось отправить PDF"), "err");
      } finally {
        кнопка.classList.remove("busy");
      }
    });
    return кнопка;
  }

  рисовать();
}
