// ========================================================================
//  РЕДАКТОР ФОТО ТОВАРА: порядок снимков и выбор главного.
//
//  Один виджет на два склада — на сайте (js/pages/products.js) и в
//  телефоне (js/sklad/screens/products.js). Два редактора развелись бы
//  через месяц: в одном фото двигаются, в другом нет.
//
//  КАК ДВИГАТЬ. Перетаскивание сделано на pointer-событиях, а не на
//  HTML5 drag-and-drop: тот на телефонах и планшетах не работает вовсе,
//  а это половина случаев — товар в руках, фото снято телефоном, им же
//  и расставляют.
//
//  ЗА ЧТО ТЯНУТЬ. На телефоне — только за ручку (⠿): ей задан
//  touch-action: none, поэтому палец на ручке тянет снимок, а палец на
//  самом снимке по-прежнему прокручивает страницу. Если тянуть можно
//  было бы за любое место, карточку стало бы нельзя пролистать. Мышью
//  можно тянуть за всю плитку — колесо прокрутки у мыши отдельное.
//
//  БЕЗ МЫШИ И БЕЗ ПАЛЬЦА. Ручка получает фокус с клавиатуры, стрелки
//  ← → переставляют снимок. Перетаскивание — не единственный путь.
//
//  ГЛАВНОЕ ФОТО — отдельная кнопка (★), а не «первое в списке».
//  Порядок и аватар не связаны: см. js/photo.js.
// ========================================================================
import { thumb } from "./img.js?v=20261113d";
import { iconSvg } from "./icons.js?v=20261113d";
import { главноеИз, переставить, убрать, сделатьГлавным, добавить, поляТовара } from "./photo.js?v=20261113d";

// Стили лежат в css/theme.css (её грузят и admin.html, и sklad.html).

export function редакторФото({
  фото = [],
  главное = "",
  наПросмотр = null,        // (список, индекс) — открыть во весь экран
  наСообщение = null,       // (текст) — toast
  наИзменение = null,       // ({ photos, photo_url }) — сохранить
} = {}) {
  let список = (фото || []).filter(Boolean).map(String);
  let аватар = главноеИз(список, главное);

  const сетка = document.createElement("div");
  сетка.className = "phed-grid";
  const подсказка = document.createElement("div");
  подсказка.className = "phed-hint";
  const узел = document.createElement("div");
  узел.className = "phed";
  узел.append(сетка, подсказка);

  const скажи = (т) => { if (наСообщение && т) наСообщение(т); };
  const сообщить = () => { if (наИзменение) наИзменение(данные()); };
  const данные = () => поляТовара(список, аватар);

  // ---------------- перетаскивание ----------------
  let тащим = null;

  // Ближайшая к курсору плитка, кроме той, которую тащим.
  // По расстоянию до центра: снимки лежат в несколько рядов, и попадание
  // «мимо плитки, между рядами» тоже должно куда-то вести.
  function ближайшая(x, y, кроме) {
    let лучшая = null, ближе = Infinity;
    for (const т of сетка.children) {
      if (т === кроме || !т.classList.contains("phed-t")) continue;
      const r = т.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < ближе) { ближе = d; лучшая = т; }
    }
    return лучшая;
  }

  function двинуть(e) {
    if (!тащим || (e.pointerId !== undefined && e.pointerId !== тащим.id)) return;
    // Палец не должен заодно прокручивать страницу.
    if (e.cancelable) e.preventDefault();
    тащим.призрак.style.transform =
      `translate(${e.clientX - тащим.сдвигX}px, ${e.clientY - тащим.сдвигY}px)`;
    const цель = ближайшая(e.clientX, e.clientY, тащим.плитка);
    if (!цель) return;
    const r = цель.getBoundingClientRect();
    const раньше = e.clientX < r.left + r.width / 2;
    сетка.insertBefore(тащим.плитка, раньше ? цель : цель.nextSibling);
  }

  function отпустить() {
    if (!тащим) return;
    const { плитка, призрак } = тащим;
    document.removeEventListener("pointermove", двинуть);
    document.removeEventListener("pointerup", отпустить);
    document.removeEventListener("pointercancel", отпустить);
    призрак.remove();
    плитка.classList.remove("phed-lift");
    узел.classList.remove("phed-dragging");
    тащим = null;

    // Порядок читаем из самой разметки: во время перетаскивания двигали её.
    // В data-i лежит номер снимка в прежнем списке — поэтому два одинаковых
    // адреса (если такие как-то попали в товар) не перепутаются.
    const номера = [...сетка.children]
      .filter(т => т.classList.contains("phed-t"))
      .map(т => Number(т.dataset.i));
    const новый = номера.map(i => список[i]).filter(Boolean);
    const изменился = новый.length === список.length && новый.some((u, k) => u !== список[k]);
    if (изменился) { список = новый; перерисовать(); сообщить(); }
    else перерисовать();
  }

  function начать(e, плитка) {
    if (тащим) return;
    if (e.button !== undefined && e.button !== 0) return;   // только левая кнопка
    if (список.length < 2) return;                          // двигать нечего
    if (e.cancelable) e.preventDefault();
    const r = плитка.getBoundingClientRect();
    const призрак = плитка.cloneNode(true);
    призрак.className = "phed-ghost";
    призрак.style.width = r.width + "px";
    призрак.style.height = r.height + "px";
    document.body.append(призрак);
    тащим = {
      плитка, призрак, id: e.pointerId,
      сдвигX: e.clientX - r.left, сдвигY: e.clientY - r.top,
    };
    плитка.classList.add("phed-lift");
    узел.classList.add("phed-dragging");
    двинуть(e);
    // passive: false — иначе preventDefault в двинуть() не остановит прокрутку.
    document.addEventListener("pointermove", двинуть, { passive: false });
    document.addEventListener("pointerup", отпустить);
    document.addEventListener("pointercancel", отпустить);
  }

  // ---------------- отрисовка ----------------
  function кнопка(класс, подпись, значок) {
    const b = document.createElement("button");
    b.type = "button";                 // внутри формы иначе отправит её
    b.className = класс;
    b.title = подпись;
    b.setAttribute("aria-label", подпись);
    b.innerHTML = значок;
    return b;
  }

  function плитка(url, i) {
    const т = document.createElement("div");
    т.className = "phed-t" + (url === аватар ? " phed-main" : "");
    т.dataset.i = String(i);

    const img = document.createElement("img");
    img.className = "phed-img";
    img.src = thumb(url, 160);
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.title = "Нажмите, чтобы увеличить";
    // Не открылось через свой сервер — пробуем исходный адрес. Иначе на
    // месте снимка остаётся битая картинка, и непонятно, что случилось.
    img.dataset.full = url;
    img.onerror = function () {
      const о = this.dataset.full;
      if (о && this.src !== о) this.src = о; else this.classList.add("phed-bad");
    };
    img.addEventListener("click", (e) => {
      e.preventDefault();
      if (наПросмотр) наПросмотр(список.slice(), i);
    });

    const ручка = document.createElement("span");
    ручка.className = "phed-grip";
    ручка.tabIndex = 0;
    ручка.setAttribute("role", "button");
    ручка.title = "Перетащите, чтобы изменить порядок (или стрелки ← →)";
    ручка.setAttribute("aria-label", "Переставить фото " + (i + 1) + " из " + список.length);
    ручка.innerHTML = iconSvg("grip", { size: 14 });
    ручка.addEventListener("pointerdown", (e) => начать(e, т));
    ручка.addEventListener("keydown", (e) => {
      const шаг = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      if (!шаг) return;
      e.preventDefault();
      const куда = i + шаг;
      if (куда < 0 || куда >= список.length) return;
      список = переставить(список, i, куда);
      перерисовать();
      сообщить();
      const новая = сетка.children[куда];
      const новаяРучка = новая && новая.querySelector(".phed-grip");
      if (новаяРучка) новаяРучка.focus();
    });

    const звезда = кнопка(
      "phed-star",
      url === аватар ? "Это главное фото" : "Сделать главным фото",
      iconSvg("star", { size: 13 }),
    );
    if (url === аватар) звезда.disabled = true;
    звезда.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (url === аватар) return;
      аватар = сделатьГлавным(список, i);
      перерисовать();
      сообщить();
    });

    const крестик = кнопка("phed-x", "Удалить фото", iconSvg("x", { size: 13 }));
    крестик.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const р = убрать(список, аватар, i);
      список = р.photos; аватар = р.главное;
      перерисовать();
      сообщить();
      if (р.потеряноГлавное) {
        скажи(список.length
          ? "Удалили главное фото — главным стало первое. Выберите другое, если нужно."
          : "Фотографий больше нет.");
      }
    });

    const полоса = document.createElement("div");
    полоса.className = "phed-bar";
    полоса.append(ручка, звезда);

    т.append(img, полоса, крестик);
    if (url === аватар) {
      const метка = document.createElement("span");
      метка.className = "phed-badge";
      метка.textContent = "Главное";
      т.append(метка);
    }
    // Мышью тянуть можно за всю плитку: прокручивать ей страницу не нужно.
    т.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "mouse") return;
      if (e.target.closest("button, .phed-grip")) return;
      начать(e, т);
    });
    return т;
  }

  function перерисовать() {
    сетка.innerHTML = "";
    if (!список.length) {
      const пусто = document.createElement("div");
      пусто.className = "phed-empty";
      пусто.textContent = "Фотографий нет — добавьте ниже";
      сетка.append(пусто);
      подсказка.textContent = "";
      return;
    }
    список.forEach((url, i) => сетка.append(плитка(url, i)));
    подсказка.textContent = список.length > 1
      ? "Тяните за ручку (или стрелками ← →), чтобы изменить порядок. ★ — главное фото: его видно в списке товаров, на складе, в поиске, в заказах, приходе и у клиентов."
      : "★ — главное фото: его видно в списке товаров, на складе, в заказах и у клиентов.";
  }

  перерисовать();

  return {
    узел,
    // После загрузки файла или ввода ссылки.
    добавить(url) {
      const было = список.length;
      список = добавить(список, url);
      if (список.length === было) { скажи("Это фото уже добавлено."); return false; }
      // Первое фото товара само становится главным — выбирать нечего.
      if (!аватар) аватар = список[0];
      перерисовать();
      сообщить();
      return true;
    },
    данные,
    список: () => список.slice(),
    главное: () => аватар,
    пусто: () => !список.length,
  };
}
