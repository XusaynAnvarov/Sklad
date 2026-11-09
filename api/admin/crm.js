// ========================================================================
//  /api/admin/crm — раздел «Клиенты и безопасность» в складе.
//
//  GET                 → показатели, список людей, география, подозрительное, дубли
//  GET ?key=c:<id>|l:<id>  → полная карточка человека
//  GET ?export=<crm_id>    → все данные карточки одним файлом (запрос клиента о его данных)
//  POST {action,…}     → note | status | edit | promote | link | forget
//
//  Доступ: только токен склада (admin). Гостевой токен не проходит.
//  Каждое изменение пишется в crm_audit: кто, что, было → стало.
//
//  Ничего не сливаем автоматически. Дубли только ПОКАЗЫВАЕМ; привязка и
//  перенос в склад — кнопкой владельца.
// ========================================================================
import { getUser } from "../lib/auth.js";
import { sget, sinsert, spatch, sdelete, okId } from "../lib/supa.js";
import { audit, toE164, phone9, KIND_RU } from "../lib/crm.js";

const днейНазад = (n) => encodeURIComponent(new Date(Date.now() - n * 864e5).toISOString());
const ташкентДень = (d) => new Date(new Date(d).getTime() + 5 * 3600e3).toISOString().slice(0, 10);
async function мягко(fn, fb) { try { return await fn(); } catch (e) { return fb; } }
const номера = (c) => [c.contact, ...(Array.isArray(c.phones) ? c.phones : [])].map(phone9).filter(n => n.length >= 7);
const сумма = (s) => (s.items || []).reduce((a, it) => a + (Number(it.qty) || 0) * (Number(it.unit_price) || 0), 0);

async function загрузить() {
  const [crm, customers, accounts, recent, suspicious] = await Promise.all([
    мягко(() => sget("crm_clients?select=*&order=created_at.desc&limit=5000"), null),
    sget("customers?select=id,name,contact,phones,tg_chat_id,created_at"),
    мягко(() => sget("site_accounts?select=id,customer_id,phone,created_at,last_login,origin,tg_username"), []),
    // последнее известное гео для клиентов без CRM-карточки — из их входов и визитов
    мягко(() => sget(`client_events?customer_id=not.is.null&created_at=gte.${днейНазад(90)}&select=customer_id,country_code,country,region,city,geo_source,created_at&order=created_at.desc&limit=3000`), []),
    мягко(() => sget(`client_events?risk=gte.40&created_at=gte.${днейНазад(30)}&select=id,kind,channel,phone9,customer_id,crm_client_id,country,city,device,os,browser,risk,flags,created_at&order=created_at.desc&limit=300`), []),
  ]);
  return { crmReady: Array.isArray(crm), crm: crm || [], customers, accounts, recent, suspicious };
}

function люди({ crm, customers, accounts, recent }) {
  const accByCust = new Map(), crmByCust = new Map(), гео = new Map();
  for (const a of accounts) if (a.customer_id) accByCust.set(a.customer_id, a);
  for (const r of crm) if (r.customer_id) { if (!crmByCust.has(r.customer_id)) crmByCust.set(r.customer_id, []); crmByCust.get(r.customer_id).push(r); }
  for (const e of recent) if (e.country_code && !гео.has(e.customer_id)) гео.set(e.customer_id, e);
  const out = [];
  for (const c of customers) {
    const rs = (crmByCust.get(c.id) || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const r = rs[0] || null, acc = accByCust.get(c.id), g = r?.country_code || r?.city ? r : гео.get(c.id);
    out.push({
      key: "c:" + c.id, kind: "customer", customer_id: c.id, crm_id: r?.id || null, crm_num: r?.num ?? null, tg_accounts: rs.length,
      name: c.name || "—", phone: toE164(c.contact) || c.contact || null,
      tg_username: r?.tg_username || acc?.tg_username || null, tg_user_id: r?.tg_user_id || c.tg_chat_id || null,
      source: r?.source || (acc?.origin === "site" ? "site" : "warehouse"), entry_point: r?.entry_point || null,
      registered_at: r?.registered_at || acc?.created_at || c.created_at, created_at: c.created_at,
      last_active_at: [r?.last_active_at, acc?.last_login].filter(Boolean).sort().pop() || null,
      country_code: g?.country_code || null, country: g?.country || null, region: g?.region || null, city: g?.city || null,
      geo_source: g?.geo_source || null, has_site: !!acc, status: r?.status || "active",
    });
  }
  for (const r of crm) {
    if (r.customer_id) continue;
    out.push({
      key: "l:" + r.id, kind: r.link_status === "review" ? "review" : r.registered_at ? "lead" : "started",
      customer_id: null, crm_id: r.id, crm_num: r.num, tg_accounts: 1,
      name: [r.first_name, r.last_name].filter(Boolean).join(" ") || "—", phone: r.phone || null,
      tg_username: r.tg_username, tg_user_id: r.tg_user_id, source: r.source, entry_point: r.entry_point,
      registered_at: r.registered_at, created_at: r.created_at, last_active_at: r.last_active_at,
      country_code: r.country_code, country: r.country, region: r.region, city: r.city, geo_source: r.geo_source,
      has_site: !!r.site_account_id, status: r.status || "new",
    });
  }
  return out;
}

function дубли(customers, crm) {
  const поНомеру = new Map();
  for (const c of customers) for (const n of new Set(номера(c))) { if (!поНомеру.has(n)) поНомеру.set(n, []); поНомеру.get(n).push({ id: c.id, name: c.name }); }
  const out = [];
  for (const [n, list] of поНомеру) if (list.length > 1) out.push({ phone: toE164(n), reason: "один номер у нескольких клиентов склада", customers: list });
  // лиды, чей номер уже есть у клиента склада, — кандидаты на ручную привязку
  for (const r of crm) {
    if (r.customer_id || !r.phone9) continue;
    const list = поНомеру.get(r.phone9);
    if (list?.length) out.push({ phone: r.phone, reason: r.link_status === "review" ? "бот не привязал: номер у нескольких клиентов" : "лид с номером клиента склада", crm_id: r.id, crm_num: r.num, customers: list });
  }
  return out;
}

async function карточка(key) {
  const [тип, id] = String(key || "").split(":");
  if (!okId(id) || !["c", "l"].includes(тип)) return null;
  let customer = null, crm = [];
  if (тип === "c") {
    customer = (await sget(`customers?id=eq.${id}&select=*`))[0];
    if (!customer) return null;
    crm = await мягко(() => sget(`crm_clients?customer_id=eq.${id}&select=*&order=created_at.asc`), []);
  } else {
    crm = await мягко(() => sget(`crm_clients?id=eq.${id}&select=*`), []);
    if (!crm.length) return null;
  }
  const crmIds = crm.map(r => r.id).filter(okId);
  const custId = customer?.id;
  const [accounts, orders, evC, evL, auditRows] = await Promise.all([
    custId ? мягко(() => sget(`site_accounts?customer_id=eq.${custId}&select=id,phone,created_at,last_login,origin,tg_username,tg_verified`), []) : [],
    custId ? мягко(() => sget(`sales?customer_id=eq.${custId}&select=id,date,status,currency,items,source&order=date.desc&limit=200`), []) : [],
    custId ? мягко(() => sget(`client_events?customer_id=eq.${custId}&select=*&order=created_at.desc&limit=300`), []) : [],
    crmIds.length ? мягко(() => sget(`client_events?crm_client_id=in.(${crmIds.join(",")})&select=*&order=created_at.desc&limit=300`), []) : [],
    мягко(() => sget(`crm_audit?target=in.(${[...crmIds, custId].filter(Boolean).join(",") || "none"})&select=*&order=created_at.desc&limit=200`), []),
  ]);
  const seen = new Set(), events = [];
  for (const e of [...evC, ...evL]) if (!seen.has(e.id)) { seen.add(e.id); events.push(e); }
  events.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  // география посещений: город/страна → сколько раз и когда последний
  const geo = new Map();
  for (const e of events) {
    const k = [e.city, e.country].filter(Boolean).join(", ") || "Не определено";
    const g = geo.get(k) || { place: k, source: e.geo_source, count: 0, last: e.created_at };
    g.count++; geo.set(k, g);
  }
  return {
    customer: customer ? { id: customer.id, name: customer.name, contact: customer.contact, phones: customer.phones, note: customer.note, created_at: customer.created_at, tg_chat_id: customer.tg_chat_id } : null,
    crm, accounts,
    orders: orders.map(s => ({ id: s.id, date: s.date, status: s.status, currency: s.currency, source: s.source, total: Math.round(сумма(s) * 100) / 100, items: (s.items || []).length })),
    // IP показываем только последние символы: полный адрес нужен лишь для расследования, а не для просмотра
    events: events.map(e => ({ ...e, ip: e.ip ? e.ip.replace(/^(.*)([.:][^.:]+)$/, "…$2") : null, ua: undefined, kind_ru: KIND_RU[e.kind] || e.kind })),
    geo: [...geo.values()].sort((a, b) => b.count - a.count),
    audit: auditRows,
  };
}

export default async function handler(req, res) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });
  // Персональные данные — только владельцу склада (наш admin-токен).
  // Старый вход через Supabase Auth сюда не пускаем.
  if (user.role !== "admin") return res.status(403).json({ error: "Доступ только владельцу склада" });
  const actor = "admin";
  try {
    if (req.method === "GET") {
      const q = req.query || {};
      if (q.export) {
        if (!okId(q.export)) return res.status(400).json({ error: "Неверный id" });
        const crm = (await sget(`crm_clients?id=eq.${q.export}&select=*`))[0];
        if (!crm) return res.status(404).json({ error: "Не найдено" });
        const events = await мягко(() => sget(`client_events?crm_client_id=eq.${q.export}&select=*&order=created_at.desc&limit=2000`), []);
        await audit(actor, "export", crm.id, { num: crm.num });
        res.setHeader("Content-Disposition", `attachment; filename="client-${String(crm.num ?? "").replace(/[^\w-]/g, "")}.json"`);
        return res.status(200).json({ crm, events, exported_at: new Date().toISOString() });
      }
      if (q.key) {
        const card = await карточка(q.key);
        return card ? res.status(200).json(card) : res.status(404).json({ error: "Клиент не найден" });
      }
      const d = await загрузить();
      const list = люди(d);
      const сегодня = ташкентДень(Date.now());
      const reg = list.filter(p => p.kind !== "started");
      const byCountry = new Map(), byCity = new Map();
      for (const p of reg) {
        const c = p.country || "Не определено"; byCountry.set(c, (byCountry.get(c) || 0) + 1);
        if (p.city) { const k = p.city + (p.country ? ", " + p.country : ""); byCity.set(k, (byCity.get(k) || 0) + 1); }
      }
      const top = (m, n) => [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, n);
      return res.status(200).json({
        crmReady: d.crmReady,
        stats: {
          total: reg.length,
          today: reg.filter(p => p.registered_at && ташкентДень(p.registered_at) === сегодня).length,
          telegram: reg.filter(p => p.source === "telegram").length,
          site: reg.filter(p => p.has_site).length,
          uz: reg.filter(p => p.country_code === "UZ").length,
          other: reg.filter(p => p.country_code && p.country_code !== "UZ").length,
          unknown: reg.filter(p => !p.country_code).length,
          leads: reg.filter(p => p.kind === "lead" || p.kind === "review").length,
          started: list.length - reg.length,
          suspicious: d.suspicious.filter(e => new Date(e.created_at) > Date.now() - 7 * 864e5).length,
        },
        people: list,
        geo: { countries: top(byCountry, 12), cities: top(byCity, 12) },
        suspicious: d.suspicious.map(e => ({ ...e, kind_ru: KIND_RU[e.kind] || e.kind })),
        duplicates: дубли(d.customers, d.crm),
      });
    }

    if (req.method === "POST") {
      let b = req.body; if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
      const { action, crm_id } = b || {};
      if (!okId(crm_id)) return res.status(400).json({ error: "Нет crm_id" });
      const crm = (await sget(`crm_clients?id=eq.${crm_id}&select=*`))[0];
      if (!crm) return res.status(404).json({ error: "Карточка не найдена" });
      const now = new Date().toISOString();

      if (action === "note") {
        const text = String(b.text || "").slice(0, 4000);
        await spatch(`crm_clients?id=eq.${crm_id}`, { admin_notes: text, updated_at: now });
        await audit(actor, "note", crm_id, { было: crm.admin_notes || "", стало: text });
        return res.status(200).json({ ok: true });
      }
      if (action === "status") {
        if (!["new", "active", "blocked", "archived"].includes(b.status)) return res.status(400).json({ error: "Неверный статус" });
        await spatch(`crm_clients?id=eq.${crm_id}`, { status: b.status, updated_at: now });
        await audit(actor, "status", crm_id, { было: crm.status, стало: b.status });
        return res.status(200).json({ ok: true });
      }
      if (action === "edit") {
        // исправление данных по просьбе клиента — только эти поля
        const allowed = ["first_name", "last_name", "city", "region", "country"];
        const patch = {}, было = {};
        for (const k of allowed) if (b.fields && k in b.fields) { patch[k] = String(b.fields[k] || "").slice(0, 80) || null; было[k] = crm[k] ?? null; }
        if (!Object.keys(patch).length) return res.status(400).json({ error: "Нечего менять" });
        if ("city" in patch || "country" in patch) Object.assign(patch, { geo_source: "admin", geo_accuracy: "city", geo_updated_at: now });
        await spatch(`crm_clients?id=eq.${crm_id}`, { ...patch, updated_at: now });
        await audit(actor, "edit", crm_id, { было, стало: patch });
        return res.status(200).json({ ok: true });
      }
      if (action === "promote") {
        if (crm.customer_id) return res.status(409).json({ error: "Уже клиент склада" });
        if (!crm.phone9) return res.status(400).json({ error: "У лида нет подтверждённого номера" });
        const все = await sget("customers?select=id,name,contact,phones");
        const есть = все.filter(c => номера(c).includes(crm.phone9));
        if (есть.length) return res.status(409).json({ error: `Номер уже есть у клиента «${есть.map(c => c.name).join("», «")}». Используйте «Привязать».` });
        const name = String(b.name || [crm.first_name, crm.last_name].filter(Boolean).join(" ") || crm.phone).slice(0, 120);
        const tg = crm.tg_user_id ? String(crm.tg_user_id) : null;
        const created = await sinsert("customers", { name, contact: crm.phone, tg_chat_id: tg, ...(tg ? { tg_chat_ids: [tg], tg_accounts: [{ phone: crm.phone, chat_id: tg, name }] } : {}) });
        const cid = created?.[0]?.id;
        if (!cid) return res.status(500).json({ error: "Не удалось создать клиента" });
        await spatch(`crm_clients?id=eq.${crm_id}`, { customer_id: cid, link_status: "linked", status: "active", updated_at: now });
        await audit(actor, "promote", crm_id, { customer_id: cid, name });
        return res.status(200).json({ ok: true, customer_id: cid });
      }
      if (action === "link") {
        // ручная привязка после проверки владельцем (например, номер у двух клиентов)
        if (!okId(b.customer_id)) return res.status(400).json({ error: "Нет customer_id" });
        const c = (await sget(`customers?id=eq.${b.customer_id}&select=id,name,tg_chat_id,tg_chat_ids,tg_accounts`))[0];
        if (!c) return res.status(404).json({ error: "Клиент склада не найден" });
        await spatch(`crm_clients?id=eq.${crm_id}`, { customer_id: c.id, link_status: "linked", updated_at: now });
        const tg = crm.tg_user_id ? String(crm.tg_user_id) : null;
        if (tg) {
          const ids = Array.isArray(c.tg_chat_ids) ? c.tg_chat_ids.map(String) : [];
          const accs = Array.isArray(c.tg_accounts) ? c.tg_accounts : [];
          const patch = {};
          if (!c.tg_chat_id) patch.tg_chat_id = tg;
          if (!ids.includes(tg)) patch.tg_chat_ids = [...ids, tg];
          if (!accs.some(a => String(a.chat_id) === tg)) patch.tg_accounts = [...accs, { phone: crm.phone, chat_id: tg, name: [crm.first_name, crm.last_name].filter(Boolean).join(" ") }];
          if (Object.keys(patch).length) await мягко(() => spatch(`customers?id=eq.${c.id}`, patch), null);
        }
        await audit(actor, "link", crm_id, { было: crm.customer_id, стало: c.id, клиент: c.name });
        return res.status(200).json({ ok: true });
      }
      if (action === "forget") {
        // Удаление по запросу клиента: CRM-карточка и журнал событий.
        // Накладные и оплаты склада НЕ трогаем — это бухгалтерия.
        if (b.confirm !== "УДАЛИТЬ") return res.status(400).json({ error: "Нужно подтверждение" });
        await мягко(() => sdelete(`client_events?crm_client_id=eq.${crm_id}`), null);
        await sdelete(`crm_clients?id=eq.${crm_id}`);
        await audit(actor, "forget", crm_id, { num: crm.num, customer_id: crm.customer_id || null });
        return res.status(200).json({ ok: true });
      }
      return res.status(400).json({ error: "Неизвестное действие" });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("[admin/crm]", e);
    return res.status(500).json({ error: "Ошибка сервера" });
  }
}
