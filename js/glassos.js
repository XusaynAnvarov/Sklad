// ========================================================================
//  GLASSOS — движение и поведение каркаса.
//
//  Здесь живут три вещи, которых не хватало стилям:
//    1. Подсказки у правого рейла: в нём только значки, а название
//       раздела нужно. Подсказка — отдельный элемент поверх страницы,
//       иначе её срезал бы прокручиваемый ряд значков.
//    2. Поиск в стиле Apple: кнопка-лупа разъезжается в поле, соседи
//       уезжают сами (их двигает флекс-строка), Escape закрывает.
//    3. Последовательные переходы: уход старого раздела обратной
//       лесенкой, приход нового — прямой, по смысловым слоям.
//
//  Главное про переходы. Быстрые нажатия по разделам раньше копили
//  очередь незакончённых анимаций. Здесь на всё один «жетон»: новая
//  навигация отменяет прежнюю, недоигранное мгновенно доигрывается.
//  Ждать нечего — человек уже выбрал другой раздел.
// ========================================================================

const МЕНЬШЕ_ДВИЖЕНИЯ = () => {
  try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

// ====================== 1. ПОДСКАЗКИ РЕЙЛА ==============================

let подсказка = null;
let таймерПодсказки = 0;

function узелПодсказки() {
  if (!подсказка) {
    подсказка = document.createElement("div");
    подсказка.className = "gm-tip";
    подсказка.setAttribute("role", "tooltip");
    document.body.append(подсказка);
  }
  return подсказка;
}

function показатьПодсказку(цель, текст) {
  if (!текст) return;
  const т = узелПодсказки();
  т.textContent = текст;
  const вРейле = !!(цель.closest && цель.closest(".gm-rail"));
  т.classList.toggle("gm-tip-рейл", вРейле);
  // Сначала показываем за кадром, чтобы узнать размер, потом ставим на место.
  т.style.visibility = "hidden";
  т.classList.remove("show");
  т.style.left = "0px";
  т.style.top = "0px";
  const р = цель.getBoundingClientRect();
  const ш = т.offsetWidth, в = т.offsetHeight;
  let x, y;
  if (вРейле) {
    // Рейл справа — подсказка слева от значка. Если слева не хватает
    // места (узкое окно), кладём справа: за край экрана уходить нельзя.
    x = р.left - ш - 10;
    if (x < 8) x = Math.min(р.right + 10, window.innerWidth - ш - 8);
    y = р.top + (р.height - в) / 2;
  } else {
    // Обычный элемент (карточка показателя) — подсказка под ним, по
    // центру. Если внизу не осталось места, уходит наверх.
    x = р.left + (р.width - ш) / 2;
    y = р.bottom + 9;
    if (y + в > window.innerHeight - 8) y = р.top - в - 9;
  }
  x = Math.max(8, Math.min(x, window.innerWidth - ш - 8));
  y = Math.max(8, Math.min(y, window.innerHeight - в - 8));
  т.style.left = Math.round(x) + "px";
  т.style.top = Math.round(y) + "px";
  т.style.visibility = "";
  requestAnimationFrame(() => т.classList.add("show"));
}

function спрятатьПодсказку() {
  clearTimeout(таймерПодсказки);
  if (подсказка) подсказка.classList.remove("show");
}

// Один слушатель на документ: пункты рейла и карточки показателей
// перерисовываются, и вешать обработчик на каждый — значит забыть про
// него после перерисовки. Подсказку получает всё, у чего есть data-tip:
// значки рейла, показатели дашборда (там это объяснение расчёта),
// служебные кнопки.
export function initПодсказкиРейла() {
  const внутри = (e) => e.target && e.target.closest && e.target.closest("[data-tip]");
  document.addEventListener("pointerover", (e) => {
    const пункт = внутри(e);
    if (!пункт) return;
    if (e.pointerType && e.pointerType !== "mouse") return;   // на касании подсказка не нужна
    clearTimeout(таймерПодсказки);
    таймерПодсказки = setTimeout(() => показатьПодсказку(пункт, пункт.dataset.tip || пункт.getAttribute("aria-label") || ""), 90);
  });
  document.addEventListener("pointerout", (e) => { if (внутри(e)) спрятатьПодсказку(); });
  document.addEventListener("pointerdown", (e) => { if (внутри(e)) спрятатьПодсказку(); });
  // С клавиатуры подсказка тоже нужна — иначе рейл непонятен без мыши.
  document.addEventListener("focusin", (e) => {
    const пункт = внутри(e);
    if (пункт) показатьПодсказку(пункт, пункт.dataset.tip || "");
    else спрятатьПодсказку();
  });
  window.addEventListener("scroll", спрятатьПодсказку, { passive: true });
  window.addEventListener("resize", спрятатьПодсказку);
}

// ====================== 2. ПОИСК В СТИЛЕ APPLE ==========================

const ЛУПА = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>`;

/**
 * Компактный поиск: кнопка-лупа → поле разъезжается → список подсказок.
 *
 * @param {object} o
 * @param {string} o.placeholder   подпись в поле
 * @param {function} o.искать      (запрос) => [{ id, title, hint, kind, go }]
 * @param {function} [o.выбрать]   (результат) => void; по умолчанию зовётся result.go()
 * @returns {HTMLElement} готовый блок для шапки
 */
export function создатьПоиск({ placeholder = "Поиск…", искать, выбрать } = {}) {
  const блок = document.createElement("div");
  блок.className = "gm-search";

  const кнопка = document.createElement("button");
  кнопка.type = "button";
  кнопка.className = "gm-search-btn";
  кнопка.innerHTML = ЛУПА;
  кнопка.setAttribute("aria-label", "Поиск");
  кнопка.setAttribute("aria-expanded", "false");

  const обёртка = document.createElement("div");
  обёртка.className = "gm-search-field";
  const поле = document.createElement("input");
  поле.type = "search";
  поле.placeholder = placeholder;
  поле.setAttribute("aria-label", placeholder);
  обёртка.append(поле);

  const список = document.createElement("div");
  список.className = "gm-search-pop";
  список.setAttribute("role", "listbox");

  // Поле стоит ПЕРЕД кнопкой: раскрываясь, оно отодвигает кнопку и
  // соседние значки влево — тот самый сдвиг, который нужен.
  блок.append(обёртка, кнопка, список);

  let открыт = false;
  let найдено = [];
  let выбран = -1;

  function открыть() {
    if (открыт) return;
    открыт = true;
    блок.classList.add("open");
    кнопка.setAttribute("aria-expanded", "true");
    // focus() сразу — Safari на телефоне открывает клавиатуру только в
    // том же действии пользователя, дожидаться конца анимации нельзя.
    поле.focus();
  }

  function закрыть() {
    if (!открыт) return;
    открыт = false;
    блок.classList.remove("open");
    кнопка.setAttribute("aria-expanded", "false");
    список.classList.remove("show");
    поле.value = "";
    найдено = []; выбран = -1;
    поле.blur();
  }

  кнопка.addEventListener("click", () => (открыт ? закрыть() : открыть()));

  function нарисовать() {
    список.innerHTML = "";
    if (!поле.value.trim()) { список.classList.remove("show"); return; }
    if (!найдено.length) {
      const п = document.createElement("div");
      п.className = "gm-sr-empty";
      п.textContent = "Ничего не нашли";
      список.append(п);
      список.classList.add("show");
      return;
    }
    найдено.forEach((р, i) => {
      const строка = document.createElement("div");
      строка.className = "gm-sr" + (i === выбран ? " sel" : "");
      строка.setAttribute("role", "option");
      const т = document.createElement("span");
      т.textContent = р.title;
      т.style.cssText = "flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
      строка.append(т);
      if (р.hint) {
        const к = document.createElement("span");
        к.className = "gm-sr-k";
        к.textContent = р.hint;
        строка.append(к);
      }
      строка.addEventListener("mousedown", (e) => {
        e.preventDefault();          // иначе поле теряет фокус до нажатия
        применить(р);
      });
      список.append(строка);
    });
    список.classList.add("show");
  }

  function применить(р) {
    закрыть();
    if (выбрать) выбрать(р);
    else if (typeof р.go === "function") р.go();
  }

  // Поиск по вводу — через небольшую паузу: иначе на каждый символ
  // перебирается тысяча товаров и ввод начинает «залипать».
  let пауза = 0;
  поле.addEventListener("input", () => {
    clearTimeout(пауза);
    пауза = setTimeout(() => {
      const q = поле.value.trim();
      найдено = q && искать ? (искать(q) || []).slice(0, 12) : [];
      выбран = найдено.length ? 0 : -1;
      нарисовать();
    }, 110);
  });

  поле.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); закрыть(); return; }
    if (!найдено.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); выбран = (выбран + 1) % найдено.length; нарисовать(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); выбран = (выбран - 1 + найдено.length) % найдено.length; нарисовать(); }
    else if (e.key === "Enter" && выбран >= 0) { e.preventDefault(); применить(найдено[выбран]); }
  });

  // Нажатие мимо — закрываем. Внутри блока нажатия не трогаем.
  document.addEventListener("pointerdown", (e) => {
    if (открыт && !блок.contains(e.target)) закрыть();
  });
  // Общее сочетание для поиска по странице.
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); открыт ? закрыть() : открыть(); }
    else if (e.key === "Escape" && открыт) закрыть();
  });

  блок.закрыть = закрыть;
  return блок;
}

// ====================== 3. ПОСЛЕДОВАТЕЛЬНЫЕ ПЕРЕХОДЫ ====================

const ШАГ = 45;           // мс между соседними блоками при приходе (ТЗ: 35–70)
const МАКС_БЛОКОВ = 12;   // дальше лесенку не тянем: ждать дольше, чем приятно
// Уход всегда короче прихода: ждать, пока уедет то, что человек уже
// закрыл, — это и есть ощущение «тормозит». Поэтому шаг меньше и
// блоков в лесенке меньше: остальные гаснут вместе с последним.
const ШАГ_УХОД = 26;
const МАКС_УХОД = 6;

// Жетон: у каждой навигации свой. Если пришла новая — прежняя больше не
// рисует ничего и мгновенно освобождает экран.
let жетон = 0;

function слойБлоков(корень) {
  let слой = [...корень.children];
  // Некоторые разделы кладут всё в одну обёртку — лесенки из одного
  // блока не выйдет, спускаемся на уровень ниже.
  if (слой.length === 1 && слой[0].children.length > 1) слой = [...слой[0].children];
  // Обёртка, которая нужна только для раскладки (первый экран дашборда
  // держит высоту), не должна становиться одним блоком лесенки: иначе
  // шесть показателей и шесть панелей выехали бы разом. Она прозрачна —
  // вместо неё в слой идут её собственные дети.
  слой = слой.flatMap(у => (у.classList && у.classList.contains("gm-сквозной")) ? [...у.children] : [у]);
  return слой;
}

/**
 * Уход раздела: сначала внутренние блоки (снизу вверх), затем страница.
 * Возвращает Promise, который исполняется, когда экран можно очищать.
 */
export function уйти(страница) {
  жетон++;
  const мой = жетон;
  if (!страница || МЕНЬШЕ_ДВИЖЕНИЯ()) return Promise.resolve();

  const блоки = слойБлоков(страница);
  const сколько = Math.min(блоки.length, МАКС_УХОД);
  // Обратный порядок: первым гаснет то, что ниже, последним — заголовок.
  блоки.slice(0, сколько).forEach((узел, i) => {
    узел.style.setProperty("--задержка", ((сколько - 1 - i) * ШАГ_УХОД) + "ms");
    узел.classList.add("gm-ух");
  });
  страница.classList.add("gm-уходит");
  document.documentElement.classList.add("gm-переход");

  // Страница уходит последней — после своих блоков.
  const задержкаСтраницы = сколько * ШАГ_УХОД;
  страница.style.setProperty("--задержка", задержкаСтраницы + "ms");
  страница.classList.add("gm-страница-уходит");

  const всего = задержкаСтраницы + 220;   // 220 мс — var(--t-exit)
  return new Promise((готово) => {
    // Жетон здесь не для отмены, а для честности: если за время ухода
    // нажали ещё раз, экран всё равно нужно освободить — и сделает это
    // тот переход, который пришёл последним.
    setTimeout(готово, Math.min(всего, 400));
  });
}

// Какие блоки приходят раньше. Порядок из техзадания: заголовок →
// финансовые показатели → основные карточки → таблицы → остальное.
const ВЕС = [
  [".topbar, h1", 0],
  [".gm-kpi", 1],
  [".stat-grid, .gm-board, .card, .advice", 2],
  [".tbl, .gm-panel", 3],
];

function весБлока(узел) {
  for (const [селектор, вес] of ВЕС) {
    if (узел.matches && узел.matches(селектор)) return вес;
    if (узел.querySelector && узел.querySelector(селектор)) return вес;
  }
  return 4;
}

/**
 * Приход раздела: блоки выходят лесенкой по смысловым слоям.
 * Вызывать ПОСЛЕ того, как раздел уже отрисован в DOM.
 */
export function прийти(страница) {
  document.documentElement.classList.remove("gm-переход");
  if (!страница || МЕНЬШЕ_ДВИЖЕНИЯ()) return;
  const мой = жетон;

  const блоки = слойБлоков(страница)
    .map((узел, i) => ({ узел, i, вес: весБлока(узел) }))
    .sort((a, b) => a.вес - b.вес || a.i - b.i);

  let n = 0;
  for (const { узел } of блоки) {
    if (n >= МАКС_БЛОКОВ) break;
    // .reveal и .gm-входит ведут свою анимацию (сетка товаров, старые
    // разделы) — не мешаем ни им, ни обёртке над ними: иначе блок едет
    // на 14 px, его карточки на 22, и движение читается как рябь.
    if (узел.classList.contains("reveal") || узел.classList.contains("gm-входит")) continue;
    if (узел.querySelector && узел.querySelector(".reveal")) continue;
    узел.style.setProperty("--задержка", (n * ШАГ) + "ms");
    узел.classList.add("gm-вход");
    n++;
  }

  // Если за время лесенки человек ушёл в другой раздел — снимаем
  // анимацию, чтобы недоигранное не осталось прозрачным.
  const всего = n * ШАГ + 400;
  setTimeout(() => {
    if (мой !== жетон) return;
    страница.querySelectorAll(".gm-вход").forEach(у => у.classList.remove("gm-вход"));
  }, всего);
}

/** Текущий жетон — чтобы роутер мог проверить, не устарел ли его переход. */
export function жетонПерехода() { return жетон; }

// ====================== 4. ПЕРЕХОД К НАЙДЕННОМУ =========================

// Глобальный поиск знает только раздел и запрос. Чтобы не вмешиваться в
// четырнадцать страниц, после отрисовки раздела запрос вписывается в его
// собственное поле поиска и подаётся событие input — дальше раздел
// фильтрует сам, своим кодом.
const КЛЮЧ_ПРЫЖКА = "gm_jump_q";

export function запомнитьЗапрос(запрос) {
  try { sessionStorage.setItem(КЛЮЧ_ПРЫЖКА, String(запрос || "")); } catch { }
}

export function применитьЗапрос(корень) {
  let запрос = "";
  try { запрос = sessionStorage.getItem(КЛЮЧ_ПРЫЖКА) || ""; sessionStorage.removeItem(КЛЮЧ_ПРЫЖКА); } catch { }
  if (!запрос || !корень) return;
  const поле = корень.querySelector('input[placeholder^="Поиск"], input[type="search"]');
  if (!поле) return;
  поле.value = запрос;
  поле.dispatchEvent(new Event("input", { bubbles: true }));
  поле.focus();
}
