// Модуль авторизации: вход, регистрация, верификация через Telegram
import { api, saveToken, clearToken, isLoggedIn } from "./api.js?v=20261103f";
import { sToast, openModal, closeModal } from "./app.js?v=20261103f";

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

// Системное «меньше движения»: переключаем сразу, без размытия.
function меньшеДвижения() {
  try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

function buildAuthModal(start) {
  const wrap = document.createElement("div");
  let mode = (start && start.mode) || "login"; // login | register | verify
  let verifToken = (start && start.token) || null;
  let pollInterval = null;

  function stopPoll() { if (pollInterval) { clearInterval(pollInterval); pollInterval = null; } }

  // Левая половина карточки — приветствие и переход «вход ↔ регистрация».
  // Текст меняется вместе с режимом, поэтому строится здесь же, а не в
  // оболочке окна. На телефоне половины не помещаются: стили (css/site.css,
  // .auth-grid) кладут её сверху одной строкой.
  function buildSide() {
    const вход = mode !== "register";
    const бок = el("div.auth-side");
    const знак = el("div.auth-side-logo");
    знак.innerHTML = `<span>GM</span><b>GENERAL MODERN</b>`;
    // Класс задаётся в имени тега: местный el() свойство class не читает.
    const h = el("h3.auth-side-title", { text: вход ? "С возвращением!" : "Здравствуйте!" });
    const p = el("p.auth-side-text", { text: вход
      ? "Нет доступа? Оставьте номер — пришлём код в Telegram, и вы сразу увидите цены."
      : "Уже есть доступ? Войдите по номеру телефона и коду из Telegram." });
    const b = el("button.auth-side-btn", { text: вход ? "Регистрация →" : "Войти →" });
    b.type = "button";
    b.addEventListener("click", () => { loginStep = "phone"; mode = вход ? "register" : "login"; renderПлавно(вход ? "вперёд" : "назад"); });
    бок.append(знак, h, p, b);
    return бок;
  }

  // ====================================================================
  //  ПЕРЕХОД «ВХОД ↔ РЕГИСТРАЦИЯ» — СТРАНИЦЫ КНИГИ
  //
  //  Раньше вся карточка разом расплывалась и собиралась обратно: один
  //  кадр с размытием, и содержимое просто подменялось. Движения в этом
  //  не было — было мигание.
  //
  //  Теперь это перелистывание. «Вход» и «Регистрация» — две страницы:
  //  уходящая уезжает в сторону, откуда пришла новая, строка за строкой
  //  снизу вверх; приходящая выкладывается сверху вниз с той стороны,
  //  куда мы идём. Приветствие слева не едет вместе с формой — оно
  //  меняется мягче, потому что остаётся на месте и только меняет текст.
  //
  //  Та же лесенка работает и при ПЕРВОМ открытии окна: нажали «Вход» —
  //  строки выкладываются по очереди, а не возникают пачкой.
  // ====================================================================
  const ШАГ_РЯДА = 55;   // мс между соседними строками формы
  const УХОД = 250;      // сколько живёт уход, прежде чем подменить содержимое

  // Строки, которые участвуют в лесенке: поля, подписи и кнопки формы.
  function рядыФормы(корень) {
    const форма = корень.querySelector(".s-form");
    return форма ? [...форма.children] : [];
  }

  function пуститьПриход(грид, ход) {
    if (меньшеДвижения()) return;
    грид.dataset.ход = ход || "вперёд";
    const ряды = рядыФормы(грид);
    ряды.forEach((р, i) => р.style.setProperty("--задержка", (i * ШАГ_РЯДА) + "ms"));
    грид.classList.add("auth-приходит");
  }

  function renderПлавно(ход) {
    const старое = wrap.firstElementChild;
    if (!старое || меньшеДвижения()) { render(ход); return; }
    старое.dataset.ход = ход || "вперёд";
    // Класс прихода обязательно снять. Он остаётся на сетке после
    // появления, весит столько же, сколько класс ухода, и стоит ниже по
    // файлу стилей — то есть побеждает. С ним уходящая форма продолжала
    // играть анимацию ПРИХОДА и просто подменялась на месте.
    старое.classList.remove("auth-приходит");
    // Уход — снизу вверх: последняя строка уезжает первой. Так взгляд
    // идёт за движением, а не теряет его.
    const ряды = рядыФормы(старое);
    ряды.forEach((р, i) => р.style.setProperty("--задержка", ((ряды.length - 1 - i) * ШАГ_РЯДА) + "ms"));
    старое.classList.add("auth-уходит");
    setTimeout(() => render(ход), УХОД);
  }

  function render(ход) {
    wrap.innerHTML = "";
    stopPoll();
    const грид = el("div.auth-grid");
    const форма = el("div.auth-form");
    if (mode === "login") форма.append(buildLogin());
    else if (mode === "register") форма.append(buildRegister());
    else if (mode === "verify") форма.append(buildVerify());
    форма.append(guideLink());   // «Как зарегистрироваться?» — видео-инструкция
    // Во время подтверждения (ждём нажатия в боте) переключать режим нечем —
    // показываем только форму, чтобы не сбить человека с толку.
    if (mode !== "verify") грид.append(buildSide());
    грид.append(форма);
    wrap.append(грид);
    пуститьПриход(грид, ход);
  }

  // ====================================================================
  //  ВХОД — ДВА ЭКРАНА
  //
  //  1) «phone»: номер телефона и пароль сразу вместе, у пароля — глаз.
  //     По кнопке уходит запрос за кодом (api.loginStart).
  //  2) «code»: шесть отдельных ячеек для кода из Telegram. Код и пароль
  //     уходят на сервер одним запросом (api.login) — там и проверяются.
  //
  //  ПОЧЕМУ ПАРОЛЬ СПРАШИВАЕМ ДО КОДА. Так просит порядок в жизни: человек
  //  вводит, что помнит, и только потом идёт в Telegram. При этом пароль
  //  НЕ проверяется до подтверждения кодом — ответ «верный/неверный»
  //  приходит один раз, уже после второго шага. Подбирать пароль через
  //  этот экран нельзя: без кода из Telegram ответа о пароле не будет.
  //
  //  ПОЧЕМУ ЯЧЕЕК ШЕСТЬ, А НЕ ЧЕТЫРЕ. Код выдаёт сервер
  //  (api/lib/clientauth.js, genCode) — он шестизначный. Четыре ячейки
  //  означали бы перевыпуск кода на четыре цифры, то есть десять тысяч
  //  вариантов вместо миллиона. Экран устроен ровно так, как описано в
  //  задании, просто ячеек шесть; сделать четыре — это одна строка
  //  ДЛИНА_КОДА ниже и столько же на сервере.
  // ====================================================================
  const ДЛИНА_КОДА = 6;

  let loginStep = (start && start.mode === "login" && start.step) || "phone"; // phone | code
  let loginPhone = (start && start.phone) || "";
  let loginPass = "";
  let loginNeedsCode = true;

  function buildLogin() {
    // Вернулись из Telegram после перезагрузки вкладки: шаг сохранился, а
    // пароль — нет (и хранить его негде). Без пароля проверять нечего,
    // поэтому возвращаемся на первый экран, а не показываем пустые ячейки.
    if (loginStep === "code" && !loginPass) loginStep = "phone";
    if (loginStep === "code") return buildCode();

    const f = el("div.s-form");
    const err = el("div.s-error", { style: "display:none" });
    const reg = el("div", { style: "text-align:center;margin-top:10px" });
    reg.innerHTML = `<span style="color:var(--muted);font-size:13px">Нет аккаунта? </span><a href="#" style="font-size:13px;color:var(--navy);font-weight:600">Зарегистрироваться</a>`;
    reg.querySelector("a").addEventListener("click", (e) => { e.preventDefault(); loginStep = "phone"; mode = "register"; renderПлавно("вперёд"); });

    const phone = input("tel", "+998 90 123 45 67");
    phone.autocomplete = "tel";
    if (loginPhone) phone.value = loginPhone;
    const { поле: pass, обёртка: passWrap } = полеПароля("Пароль", "current-password");
    if (loginPass) pass.value = loginPass;

    const btn = button("Продолжить", "btn-primary", { style: "width:100%;margin-top:4px" });
    const hint = el("div.s-hint", {}, [
      document.createTextNode("Код подтверждения придёт в Telegram-бот "),
      mkEl("strong", {}, ["@generalmodernbot"]),
      document.createTextNode(". Откройте его заранее (/start)."),
    ]);

    const отправить = async () => {
      err.style.display = "none";
      const ph = phone.value.trim();
      if (!ph) { err.textContent = "Введите номер телефона"; err.style.display = ""; phone.focus(); return; }
      if (!pass.value) { err.textContent = "Введите пароль"; err.style.display = ""; pass.focus(); return; }
      btn.disabled = true; btn.innerHTML = '<span class="s-spinner"></span>';
      try {
        const r = await api.loginStart(ph);
        loginPhone = ph;
        loginPass = pass.value;
        loginNeedsCode = !(r && r.code_required === false);
        if (!loginNeedsCode) {
          // Админ и доверенное устройство входят без кода — сразу вторым шагом.
          await завершитьВход("", (сообщение) => {
            err.textContent = сообщение; err.style.display = "";
            btn.disabled = false; btn.textContent = "Продолжить";
          });
          return;
        }
        saveState(LOGIN_KEY, { phone: ph });   // уход в Telegram не должен сбрасывать вход
        loginStep = "code";
        renderПлавно("вперёд");
        sToast("Код отправлен в Telegram", "ok");
      } catch (e) {
        err.textContent = e.message; err.style.display = "";
        btn.disabled = false; btn.textContent = "Продолжить";
      }
    };
    btn.addEventListener("click", отправить);
    [phone, pass].forEach(п => п.addEventListener("keydown", e => { if (e.key === "Enter") отправить(); }));

    f.append(err, field("Телефон", phone), field("Пароль", passWrap), hint, btn, reg);
    setTimeout(() => (loginPhone ? pass : phone).focus(), 60);
    return f;
  }

  // ---- Шаг 2: код из Telegram ----
  function buildCode() {
    const f = el("div.s-form.gm-code-form");
    const err = el("div.s-error", { style: "display:none" });
    const шапка = el("div.gm-code-head", {}, [
      el("div.gm-code-title", { text: "Подтвердите личность" }),
      el("div.s-hint", { text: `Код из ${ДЛИНА_КОДА} цифр отправлен в Telegram на номер ${loginPhone}. Он действует 5 минут.` }),
    ]);

    const ячейки = ячейкиКода(ДЛИНА_КОДА, (код) => проверить(код));
    const btn = button("Подтвердить", "btn-primary", { style: "width:100%;margin-top:4px" });
    const успех = el("div.gm-ok", { style: "display:none" });
    успех.innerHTML = ЗНАК_ГАЛОЧКИ;

    // Повторная отправка: сервер не чаще одного кода в минуту — столько же
    // держим кнопку закрытой, чтобы человек не ловил отказ 429.
    const повтор = button("Отправить код ещё раз", "s-link-btn", {});
    const отсчёт = el("div.gm-code-timer");
    let осталось = 60, таймер = 0;
    function тикать() {
      clearInterval(таймер);
      повтор.disabled = true;
      отсчёт.textContent = `Отправить код ещё раз можно через ${осталось} с`;
      таймер = setInterval(() => {
        осталось--;
        if (осталось <= 0) {
          clearInterval(таймер);
          повтор.disabled = false;
          отсчёт.textContent = "";
        } else отсчёт.textContent = `Отправить код ещё раз можно через ${осталось} с`;
      }, 1000);
    }
    тикать();
    повтор.addEventListener("click", async () => {
      err.style.display = "none";
      повтор.disabled = true;
      try {
        await api.loginStart(loginPhone);
        sToast("Новый код отправлен в Telegram", "ok");
        осталось = 60; тикать();
        ячейки.очистить();
      } catch (e) {
        err.textContent = e.message; err.style.display = "";
        повтор.disabled = false;
      }
    });

    const назад = el("div", { style: "text-align:center;margin-top:4px" });
    назад.innerHTML = `<a href="#" style="font-size:13px;color:var(--navy);font-weight:600">← Изменить номер</a>`;
    назад.querySelector("a").addEventListener("click", (e) => {
      e.preventDefault(); clearInterval(таймер); loginStep = "phone"; renderПлавно("назад");
    });

    let занято = false;
    async function проверить(код) {
      if (занято) return;
      const зн = String(код || ячейки.значение()).trim();
      if (зн.length < ДЛИНА_КОДА) { ячейки.ошибка(); err.textContent = "Введите код полностью"; err.style.display = ""; return; }
      занято = true;
      err.style.display = "none";
      btn.disabled = true; btn.innerHTML = '<span class="s-spinner"></span>';
      ячейки.заблокировать(true);
      await завершитьВход(зн, (сообщение) => {
        занято = false;
        err.textContent = сообщение; err.style.display = "";
        btn.disabled = false; btn.textContent = "Подтвердить";
        ячейки.заблокировать(false);
        ячейки.ошибка();
      }, () => {
        // успех: гасим форму и проигрываем галочку
        clearInterval(таймер);
        ячейки.принято();
        f.classList.add("gm-code-done");
        успех.style.display = "";
        // Заставляем браузер посчитать состояние «скрыто» ПРЯМО СЕЙЧАС,
        // иначе переход не запустится. Через requestAnimationFrame
        // делать нельзя: в фоновой вкладке кадры не рисуются, и галочка
        // осталась бы невидимой — ровно на этом уже обжигались в
        // переходе «вход ↔ регистрация» выше.
        void успех.offsetWidth;
        успех.classList.add("show");
      });
    }
    btn.addEventListener("click", () => проверить());

    f.append(шапка, err, ячейки.узел, успех, btn, отсчёт, повтор, назад);
    return f;
  }

  // Один и тот же вход и для админа (без кода), и после ячеек.
  async function завершитьВход(код, приОшибке, приУспехе) {
    try {
      const res = await api.login(loginPhone, код, loginPass);
      saveToken(res.token);
      clearPendingAuth();
      if (приУспехе) {
        приУспехе();
        // Галочке нужно время прорисоваться — только потом окно уходит.
        await new Promise(r => setTimeout(r, меньшеДвижения() ? 300 : 1250));
      }
      loginStep = "phone"; loginPass = "";
      closeModal("auth-modal");
      sToast("Вход выполнен", "ok");
      notifyChange();
    } catch (e) {
      приОшибке(e.message || "Не удалось войти");
    }
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
    login.querySelector("a").addEventListener("click", (e) => { e.preventDefault(); mode = "login"; renderПлавно("назад"); });
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
    // У обоих полей — тот же глаз, что и на входе: пароль придумывают
    // один раз, и увидеть, что набрано, здесь нужнее всего.
    const { поле: pass, обёртка: pass1Wrap } = полеПароля("Придумайте пароль (мин. 6 символов)", "new-password");
    const { поле: pass2, обёртка: pass2Wrap } = полеПароля("Повторите пароль", "new-password");
    const finalBtn = button("Завершить регистрацию", "btn-primary", { style: "width:100%" });
    passWrap.append(field("Пароль", pass1Wrap), field("Повторите пароль", pass2Wrap), finalBtn);

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
// ======================================================================
//  ПОЛЕ ПАРОЛЯ С ГЛАЗОМ
//  Показать пароль нужно всем, кто печатает его на телефоне вслепую.
//  Кнопка лежит ВНУТРИ обёртки, поэтому поле не прыгает, когда значок
//  меняется, и ширина строки остаётся прежней.
// ======================================================================
const ГЛАЗ_ОТКРЫТ = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.6 12S5.5 5 12 5s10.4 7 10.4 7-3.9 7-10.4 7S1.6 12 1.6 12Z"/><circle cx="12" cy="12" r="3.2"/></svg>`;
const ГЛАЗ_ЗАКРЫТ = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c6.5 0 10.4 6 10.4 6a18 18 0 0 1-3.5 4.1"/><path d="M6.4 7.6A17.6 17.6 0 0 0 1.6 12S5.5 18 12 18c1.4 0 2.6-.2 3.7-.6"/><path d="M9.9 9.9a3.2 3.2 0 0 0 4.3 4.3"/></svg>`;

function полеПароля(подпись, автозаполнение) {
  const поле = input("password", подпись || "Пароль");
  if (автозаполнение) поле.autocomplete = автозаполнение;
  поле.classList.add("gm-pass-input");
  const кнопка = document.createElement("button");
  кнопка.type = "button";
  кнопка.className = "gm-eye";
  кнопка.innerHTML = ГЛАЗ_ОТКРЫТ;
  кнопка.setAttribute("aria-label", "Показать пароль");
  кнопка.addEventListener("click", () => {
    const видно = поле.type === "text";
    поле.type = видно ? "password" : "text";
    кнопка.innerHTML = видно ? ГЛАЗ_ОТКРЫТ : ГЛАЗ_ЗАКРЫТ;
    кнопка.setAttribute("aria-label", видно ? "Показать пароль" : "Скрыть пароль");
    кнопка.setAttribute("aria-pressed", видно ? "false" : "true");
    // Курсор возвращаем в конец: иначе он прыгает в начало строки.
    поле.focus();
    const n = поле.value.length;
    try { поле.setSelectionRange(n, n); } catch { }
  });
  const обёртка = el("div.gm-pass");
  обёртка.append(поле, кнопка);
  return { поле, обёртка, кнопка };
}

// ======================================================================
//  ЯЧЕЙКИ ОДНОРАЗОВОГО КОДА
//
//  Отдельное поле на цифру. Что обязательно должно работать и работает:
//    • переход к следующей ячейке сам, как только введена цифра;
//    • Backspace в пустой ячейке возвращает курсор назад и стирает;
//    • вставка всего кода целиком (Ctrl+V, подсказка из Telegram, и
//      автоподстановка одноразового кода телефоном) раскладывает цифры
//      по ячейкам и сразу отправляет;
//    • стрелки влево-вправо ходят по ячейкам;
//    • когда код набран полностью, проверка начинается без нажатия
//      кнопки — кнопка остаётся для тех, кто вставил код мышью.
// ======================================================================
function ячейкиКода(длина, приГотовности) {
  const узел = el("div.gm-code");
  const поля = [];
  for (let i = 0; i < длина; i++) {
    const п = document.createElement("input");
    п.type = "text";
    п.inputMode = "numeric";
    п.autocomplete = i === 0 ? "one-time-code" : "off";
    п.maxLength = 1;
    п.className = "gm-code-cell";
    п.setAttribute("aria-label", `Цифра ${i + 1} из ${длина}`);
    поля.push(п);
    узел.append(п);
  }
  const значение = () => поля.map(п => п.value).join("");

  function разложить(текст) {
    const цифры = String(текст || "").replace(/\D/g, "").slice(0, длина);
    if (!цифры) return;
    поля.forEach((п, i) => { п.value = цифры[i] || ""; });
    const след = Math.min(цифры.length, длина - 1);
    поля[след].focus();
    if (цифры.length >= длина) приГотовности(цифры);
  }

  поля.forEach((п, i) => {
    п.addEventListener("input", () => {
      // В ячейку могли вставить сразу весь код — раскладываем.
      if (п.value.length > 1) { разложить(п.value); return; }
      п.value = п.value.replace(/\D/g, "");
      if (п.value && i < длина - 1) поля[i + 1].focus();
      узел.classList.remove("gm-code-err");
      if (значение().length === длина) приГотовности(значение());
    });
    п.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !п.value && i > 0) {
        e.preventDefault();
        поля[i - 1].value = "";
        поля[i - 1].focus();
      } else if (e.key === "ArrowLeft" && i > 0) { e.preventDefault(); поля[i - 1].focus(); }
      else if (e.key === "ArrowRight" && i < длина - 1) { e.preventDefault(); поля[i + 1].focus(); }
      else if (e.key === "Enter") { e.preventDefault(); приГотовности(значение()); }
    });
    п.addEventListener("paste", (e) => {
      e.preventDefault();
      разложить((e.clipboardData || window.clipboardData).getData("text"));
    });
    п.addEventListener("focus", () => п.select());
  });

  setTimeout(() => поля[0].focus(), 80);

  return {
    узел,
    значение,
    очистить() { поля.forEach(п => п.value = ""); узел.classList.remove("gm-code-err"); поля[0].focus(); },
    заблокировать(да) { поля.forEach(п => п.disabled = !!да); },
    ошибка() {
      узел.classList.remove("gm-code-err");
      void узел.offsetWidth;          // перезапуск анимации встряски
      узел.classList.add("gm-code-err");
      поля.forEach(п => п.value = "");
      поля[0].focus();
    },
    принято() { узел.classList.add("gm-code-ok"); },
  };
}

// Галочка в стеклянном круге: круг появляется, линия прорисовывается.
const ЗНАК_ГАЛОЧКИ = `
  <div class="gm-ok-ring" aria-hidden="true">
    <svg viewBox="0 0 64 64" width="64" height="64">
      <circle class="gm-ok-c" cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="3"/>
      <path class="gm-ok-v" d="M20 33.5 28.5 42 44 24" fill="none" stroke="currentColor"
            stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>
  <div class="gm-ok-text">Личность подтверждена</div>`;

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
