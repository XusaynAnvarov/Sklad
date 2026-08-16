// Модуль авторизации: вход, регистрация, верификация через Telegram
import { api, saveToken, clearToken, isLoggedIn } from "./api.js?v=20260816c";
import { sToast, openModal, closeModal } from "./app.js?v=20260816c";

let onAuthChange = null;
export function setAuthChangeCallback(fn) { onAuthChange = fn; }

function notifyChange() { if (onAuthChange) onAuthChange(isLoggedIn()); }

// ========================================================================
//  НЕЗАКОНЧЕННЫЕ РЕГИСТРАЦИЯ / ВХОД
//  Клиент уходит в Telegram (подтвердить номер или взять код) и возвращается —
//  а телефон успел выгрузить вкладку, и всё начиналось сначала: шаг жил только
//  в переменных этого модуля. Теперь шаг лежит в localStorage и переживает
//  закрытие вкладки. Сроки совпадают с серверными: токен верификации живёт
//  1 час, код входа — 5 минут; после этого продолжать всё равно нечего.
// ========================================================================
const REG_KEY = "gm_reg_pending";     // { token, phone, at }
const LOGIN_KEY = "gm_login_pending"; // { phone, at }
const REG_TTL = 60 * 60 * 1000;
const LOGIN_TTL = 5 * 60 * 1000;

function saveState(key, data) { try { localStorage.setItem(key, JSON.stringify({ ...data, at: Date.now() })); } catch { } }
function readState(key, ttl) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    if (v && v.at && Date.now() - v.at < ttl) return v;
  } catch { }
  clearState(key);
  return null;
}
function clearState(key) { try { localStorage.removeItem(key); } catch { } }
export function clearPendingAuth() { clearState(REG_KEY); clearState(LOGIN_KEY); }

// Есть ли что продолжать (для автооткрытия окна при загрузке сайта).
// Регистрация важнее: там клиент уже подтвердил номер в Telegram.
export function pendingAuth() {
  const reg = readState(REG_KEY, REG_TTL);
  if (reg && reg.token) return { mode: "verify", token: reg.token, phone: reg.phone || "" };
  const log = readState(LOGIN_KEY, LOGIN_TTL);
  if (log && log.phone) return { mode: "login", step: "code", phone: log.phone };
  return null;
}

// ---- Вход ----
// start — с какого шага открыть окно:
//   { mode:"verify", token }              — продолжить регистрацию (ждать/задать пароль)
//   { mode:"login", step:"code", phone }  — вернуться к вводу кода из Telegram
export function openLogin(start) {
  openModal("auth-modal", buildAuthModal(start));
}

// Ссылка «Как зарегистрироваться?» → открывает видео-инструкцию (GIF, по языку сайта)
const GUIDE_TXT = {
  ru: { link: "❓ Как зарегистрироваться? Смотреть инструкцию", title: "Как зарегистрироваться", close: "Закрыть" },
  uz: { link: "❓ Qanday ro'yxatdan o'tish? Yo'riqnomani ko'rish", title: "Qanday ro'yxatdan o'tish", close: "Yopish" },
  en: { link: "❓ How to register? Watch the guide", title: "How to register", close: "Close" },
};
function guideLang() { const l = localStorage.getItem("gm_lang") || "ru"; return GUIDE_TXT[l] ? l : "ru"; }
export function openGuide() {
  const lang = guideLang(), T = GUIDE_TXT[lang];
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;z-index:10000;background:rgba(10,16,28,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px";
  const img = document.createElement("img");
  img.src = `/guide/guide-${lang === "en" ? "ru" : lang}.gif`;   // англ. версии пока нет — показываем русскую
  img.alt = T.title;
  img.style.cssText = "max-width:min(92vw,420px);max-height:78vh;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.6)";
  const btn = document.createElement("button");
  btn.textContent = T.close;
  btn.style.cssText = "background:#e3c163;color:#1c2b4a;border:none;border-radius:10px;padding:10px 24px;font-weight:700;font-size:15px;cursor:pointer";
  btn.addEventListener("click", () => ov.remove());
  ov.addEventListener("click", (e) => { if (e.target === ov) ov.remove(); });
  document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { ov.remove(); document.removeEventListener("keydown", esc); } });
  ov.append(img, btn);
  document.body.append(ov);
}
function guideLink() {
  const T = GUIDE_TXT[guideLang()];
  const d = document.createElement("div");
  d.style.cssText = "text-align:center;margin-top:14px;padding-top:12px;border-top:1px solid var(--border,#e6e2d8)";
  const a = document.createElement("a");
  a.href = "#"; a.textContent = T.link;
  a.style.cssText = "font-size:13px;color:var(--navy,#1c2b4a);font-weight:600;text-decoration:none";
  a.addEventListener("click", (e) => { e.preventDefault(); openGuide(); });
  d.append(a);
  return d;
}

function buildAuthModal(start) {
  const wrap = document.createElement("div");
  let mode = (start && start.mode) || "login"; // login | register | verify
  let verifToken = (start && start.token) || null;
  let pollInterval = null;

  function stopPoll() { if (pollInterval) { clearInterval(pollInterval); pollInterval = null; } }

  function render() {
    wrap.innerHTML = "";
    stopPoll();
    if (mode === "login") wrap.append(buildLogin());
    else if (mode === "register") wrap.append(buildRegister());
    else if (mode === "verify") wrap.append(buildVerify());
    wrap.append(guideLink());   // «Как зарегистрироваться?» — видео-инструкция
  }

  // 2 шага: 1) телефон → код в Telegram; 2) код + пароль → вход.
  // Администратору код не нужен (login-start вернёт code_required:false) → шаг «pass» (только пароль).
  let loginStep = (start && start.mode === "login" && start.step) || "phone"; // phone | code | pass
  let loginPhone = (start && start.phone) || "";
  let loginNeedsCode = true;

  function buildLogin() {
    const f = el("div.s-form");
    let err = el("div.s-error", { style: "display:none" });
    const reg = el("div", { style: "text-align:center;margin-top:10px" });
    reg.innerHTML = `<span style="color:var(--muted);font-size:13px">Нет аккаунта? </span><a href="#" style="font-size:13px;color:var(--navy);font-weight:600">Зарегистрироваться</a>`;
    reg.querySelector("a").addEventListener("click", (e) => { e.preventDefault(); loginStep = "phone"; mode = "register"; render(); });

    if (loginStep === "phone") {
      const phone = input("tel", "Номер телефона", "+998 90 123 45 67");
      if (loginPhone) phone.value = loginPhone;
      const btn = button("Получить код", "btn-primary", { style: "width:100%;margin-top:4px" });
      const hint = el("div.s-hint", {}, [
        document.createTextNode("Код придёт в Telegram-бот "),
        mkEl("strong", {}, ["@generalmodernbot"]),
        document.createTextNode(". Откройте его заранее (/start)."),
      ]);
      btn.addEventListener("click", async () => {
        err.style.display = "none";
        const ph = phone.value.trim();
        if (!ph) { err.textContent = "Введите номер телефона"; err.style.display = ""; return; }
        btn.disabled = true; btn.innerHTML = '<span class="s-spinner"></span>';
        try {
          const r = await api.loginStart(ph);
          loginPhone = ph;
          loginNeedsCode = !(r && r.code_required === false);
          loginStep = loginNeedsCode ? "code" : "pass";
          // код ушёл в Telegram — запоминаем шаг, чтобы уход за кодом не сбросил вход
          if (loginNeedsCode) saveState(LOGIN_KEY, { phone: ph });
          render();
          if (loginNeedsCode) sToast("Код отправлен в Telegram", "ok");
        } catch (e) {
          err.textContent = e.message; err.style.display = "";
          btn.disabled = false; btn.textContent = "Получить код";
        }
      });
      f.append(err, field("Телефон", phone), hint, btn, reg);
      return f;
    }

    // шаг «код + пароль» (для админа — только пароль)
    const needCode = loginStep === "code";
    const code = input("tel", "Код из Telegram", "______");
    const pass = input("password", "Пароль");
    const btn = button("Войти", "btn-primary", { style: "width:100%;margin-top:4px" });
    const back = el("div", { style: "text-align:center;margin-top:10px" });
    back.innerHTML = `<a href="#" style="font-size:13px;color:var(--navy);font-weight:600">← Изменить номер</a>`;
    back.querySelector("a").addEventListener("click", (e) => { e.preventDefault(); loginStep = "phone"; render(); });
    btn.addEventListener("click", async () => {
      err.style.display = "none";
      btn.disabled = true; btn.innerHTML = '<span class="s-spinner"></span>';
      try {
        const res = await api.login(loginPhone, needCode ? code.value.trim() : "", pass.value);
        saveToken(res.token);
        loginStep = "phone";
        clearPendingAuth();          // вошли — продолжать нечего
        closeModal("auth-modal");
        sToast("Вход выполнен", "ok");
        notifyChange();
      } catch (e) {
        err.textContent = e.message; err.style.display = "";
        btn.disabled = false; btn.textContent = "Войти";
      }
    });
    const rows = [err];
    if (needCode) rows.push(el("div.s-hint", { text: "Код отправлен в Telegram на номер +998 " + loginPhone }), field("Код из Telegram", code));
    rows.push(field("Пароль", pass), btn, back);
    f.append(...rows);
    return f;
  }

  function buildRegister() {
    const f = el("div.s-form");
    let err = el("div.s-error", { style: "display:none" });
    const phone = input("tel", "Номер телефона", "+998 90 123 45 67");
    const hint = el("div.s-hint", {}, [
      document.createTextNode("Номер должен быть открыт в "),
      mkEl("strong", {}, ["Telegram"]),
      document.createTextNode(" — на него придёт подтверждение."),
    ]);
    const btn = button("Продолжить", "btn-primary", { style: "width:100%;margin-top:4px" });
    const login = el("div", { style: "text-align:center;margin-top:10px" });
    login.innerHTML = `<a href="#" style="font-size:13px;color:var(--navy);font-weight:600">Уже есть аккаунт? Войти</a>`;
    login.querySelector("a").addEventListener("click", (e) => { e.preventDefault(); mode = "login"; render(); });
    btn.addEventListener("click", async () => {
      err.style.display = "none";
      btn.disabled = true; btn.innerHTML = '<span class="s-spinner"></span>';
      try {
        const res = await api.verifyStart(phone.value.trim());
        verifToken = res.token;
        mode = "verify";
        window._gmVerifBotUrl = res.bot_url;
        // клиент сейчас уйдёт в Telegram — запоминаем токен, чтобы возврат
        // не сбросил регистрацию на самое начало
        saveState(REG_KEY, { token: res.token, phone: phone.value.trim(), bot_url: res.bot_url });
        render();
      } catch (e) {
        err.textContent = e.message; err.style.display = "";
        btn.disabled = false; btn.textContent = "Продолжить";
      }
    });
    f.append(err, field("Телефон", phone), hint, btn, login);
    return f;
  }

  function buildVerify() {
    const f = el("div.s-form");
    const steps = el("div.verify-steps");
    const s1 = verifyStep(1, "Откройте Telegram-бот", "Нажмите кнопку ниже — бот спросит поделиться контактом", "done");
    const s2 = verifyStep(2, "Поделитесь номером в боте", "Нажмите кнопку «Поделиться номером» внутри бота", "active");
    const s3 = verifyStep(3, "Задайте пароль на сайте", "После подтверждения — поле появится здесь");
    steps.append(s1, s2, s3);

    // После перезагрузки страницы window._gmVerifBotUrl теряется — берём ссылку
    // на бота из сохранённого состояния, иначе кнопка стала бы пустышкой.
    if (!window._gmVerifBotUrl) {
      const saved = readState(REG_KEY, REG_TTL);
      if (saved && saved.bot_url) window._gmVerifBotUrl = saved.bot_url;
      else if (verifToken) window._gmVerifBotUrl = "https://t.me/generalmodernbot?start=verify_" + verifToken;
    }
    const openBot = button("Открыть Telegram-бот", "btn-primary", { style: "width:100%" });
    openBot.addEventListener("click", () => { if (window._gmVerifBotUrl) window.open(window._gmVerifBotUrl, "_blank"); });

    const passWrap = el("div", { style: "display:none" });
    const pass = input("password", "Придумайте пароль (мин. 6 символов)");
    const pass2 = input("password", "Повторите пароль");
    const finalBtn = button("Завершить регистрацию", "btn-primary", { style: "width:100%" });
    passWrap.append(field("Пароль", pass), field("Повторите пароль", pass2), finalBtn);

    let err = el("div.s-error", { style: "display:none" });

    finalBtn.addEventListener("click", async () => {
      err.style.display = "none";
      if (pass.value.length < 6) { err.textContent = "Пароль должен быть не менее 6 символов"; err.style.display = ""; return; }
      if (pass.value !== pass2.value) { err.textContent = "Пароли не совпадают"; err.style.display = ""; return; }
      finalBtn.disabled = true; finalBtn.innerHTML = '<span class="s-spinner"></span>';
      try {
        const res = await api.register(verifToken, pass.value);
        saveToken(res.token);
        clearPendingAuth();          // зарегистрировались — продолжать нечего
        closeModal("auth-modal");
        sToast("Регистрация завершена! Добро пожаловать.", "ok");
        notifyChange();
      } catch (e) {
        err.textContent = e.message; err.style.display = "";
        finalBtn.disabled = false; finalBtn.textContent = "Завершить регистрацию";
      }
    });

    // перейти к полям пароля (номер уже подтверждён в боте)
    function showPassword() {
      stopPoll();
      s2.classList.remove("active"); s2.classList.add("done");
      s3.classList.add("active");
      openBot.style.display = "none";
      passWrap.style.display = "";
      setTimeout(() => pass.focus(), 50);
    }

    // Сразу спрашиваем статус: если клиент уже подтвердил номер в Telegram и
    // вернулся (сам или по кнопке из бота) — не заставляем его ждать и жать заново.
    (async () => {
      if (!verifToken) return;
      try {
        const res = await api.verifyStatus(verifToken);
        if (res.verified) showPassword();
      } catch (e) {
        // токен истёк или не найден — продолжать нечего, начинаем заново
        stopPoll();
        clearState(REG_KEY);
        err.textContent = "Ссылка устарела. Начните регистрацию заново.";
        err.style.display = "";
        openBot.style.display = "none";
        const again = button("Начать заново", "btn-primary", { style: "width:100%;margin-top:10px" });
        again.addEventListener("click", () => { verifToken = null; mode = "register"; render(); });
        f.append(again);
      }
    })();

    // опрашиваем статус верификации каждые 2 секунды
    pollInterval = setInterval(async () => {
      try {
        const res = await api.verifyStatus(verifToken);
        if (res.verified) showPassword();
      } catch {}
    }, 2000);

    f.append(steps, err, openBot, passWrap);
    return f;
  }

  render();
  return wrap;
}

// ---- helpers ----
function el(tag, opts = {}, children = []) {
  const [t, ...classes] = tag.split(".");
  const e = document.createElement(t || "div");
  classes.forEach(c => e.classList.add(c));
  if (opts.style) e.style.cssText += opts.style;
  if (opts.text) e.textContent = opts.text;
  children.forEach(c => c && e.append(c));
  return e;
}
function mkEl(tag, opts, children = []) { return el(tag, opts, children); }
function input(type, placeholder, hint) {
  const i = document.createElement("input");
  i.type = type; i.placeholder = placeholder || ""; i.className = "s-input";
  return i;
}
function field(label, inputEl) {
  const f = el("div.s-field");
  const l = el("label.s-label", { text: label });
  f.append(l, inputEl);
  return f;
}
function button(text, cls, attrs = {}) {
  const b = document.createElement("button");
  b.className = cls; b.textContent = text;
  Object.entries(attrs).forEach(([k, v]) => b.setAttribute(k, v));
  if (attrs.style) b.style.cssText = attrs.style;
  return b;
}
function verifyStep(num, title, desc, state = "") {
  const s = el("div.verify-step" + (state ? "." + state : ""));
  const numEl = el("div.verify-step-num", { text: String(num) });
  const body = el("div.verify-step-body");
  body.append(mkEl("strong", {}, [document.createTextNode(title)]), el("p", { text: desc }));
  s.append(numEl, body);
  return s;
}

export function logout() {
  clearToken();
  notifyChange();
  sToast("Вы вышли из аккаунта");
}
