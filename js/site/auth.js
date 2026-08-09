// Модуль авторизации: вход, регистрация, верификация через Telegram
import { api, saveToken, clearToken, isLoggedIn } from "./api.js?v=20260809a";
import { sToast, openModal, closeModal } from "./app.js?v=20260809a";

let onAuthChange = null;
export function setAuthChangeCallback(fn) { onAuthChange = fn; }

function notifyChange() { if (onAuthChange) onAuthChange(isLoggedIn()); }

// ---- Вход ----
export function openLogin() {
  openModal("auth-modal", buildAuthModal());
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

function buildAuthModal() {
  const wrap = document.createElement("div");
  let mode = "login"; // login | register | verify
  let verifToken = null;
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
  let loginStep = "phone"; // phone | code | pass
  let loginPhone = "";
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
        closeModal("auth-modal");
        sToast("Регистрация завершена! Добро пожаловать.", "ok");
        notifyChange();
      } catch (e) {
        err.textContent = e.message; err.style.display = "";
        finalBtn.disabled = false; finalBtn.textContent = "Завершить регистрацию";
      }
    });

    // опрашиваем статус верификации каждые 2 секунды
    pollInterval = setInterval(async () => {
      try {
        const res = await api.verifyStatus(verifToken);
        if (res.verified) {
          stopPoll();
          s2.classList.replace("active", "done");
          s3.classList.add("active");
          openBot.style.display = "none";
          passWrap.style.display = "";
        }
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
