// ========================================================================
//  ПЕРЕТАСКИВАНИЕ КАРТОЧЕК НА ДОСКЕ СБОРКИ (js/pages/fulfillment.js).
//
//  Своё, без библиотек: склад — ванильный JS без сборки, а dnd-kit и
//  подобные живут в React. Здесь нужно немного и под полным контролем:
//  отпустил карточку — она встаёт на место, но статус НЕ меняется, пока
//  страница не скажет «подтверждено» (или вернёт карточку назад).
//
//  Как устроено:
//   • мышь — перетаскивание начинается, когда указатель сдвинулся на 6px
//     (обычный щелчок остаётся щелчком);
//   • палец — долгое нажатие 380 мс без движения (обычная прокрутка не
//     начинает перетаскивание) или сразу за ручку .ff-grip;
//   • за пальцем/мышью едет копия карточки (position: fixed, только
//     transform), на месте вставки — пустое место той же высоты;
//   • соседние карточки уступают место плавно (FLIP на transform);
//   • у краёв экрана список и доска прокручиваются сами;
//   • Esc — отмена, карточка возвращается.
//  Чтение раскладки — не каждый кадр, а при смене колонки/места, поэтому
//  движение не тормозит даже на длинных колонках.
// ========================================================================

const ПОРОГ_МЫШИ = 6;
const ДОЛГОЕ_НАЖАТИЕ = 380;
const ДРОЖЬ_ПАЛЬЦА = 10;
const КРАЙ = 64;          // зона автопрокрутки у края, px
const СКОРОСТЬ = 18;      // px за кадр у самого края

const меньшеДвижения = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

// Ближайший предок, который прокручивается по вертикали.
function прокручиваемый(node) {
  for (let n = node?.parentElement; n; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return document.scrollingElement || document.documentElement;
}

// FLIP: сдвинуть узлы из старого положения в новое одной анимацией transform.
function довести(узлы, были, мс = 180) {
  if (меньшеДвижения()) return;
  for (const n of узлы) {
    const r0 = были.get(n); if (!r0) continue;
    const r1 = n.getBoundingClientRect();
    const dy = r0.top - r1.top, dx = r0.left - r1.left;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    n.style.transition = "none";
    n.style.transform = `translate(${dx}px, ${dy}px)`;
    requestAnimationFrame(() => {
      n.style.transition = `transform ${мс}ms cubic-bezier(.22,1,.36,1)`;
      n.style.transform = "";
      setTimeout(() => { n.style.transition = ""; }, мс + 40);
    });
  }
}

/**
 * @param {HTMLElement} доска — .ff-board
 * @param {object} о
 *   колонки(): [{ stage, col, list }]
 *   проверить(fromStage, toStage) → { ok: boolean, why?: string }
 *   наБросок({ id, from, to, index, вернуть, оставить }) → Promise<void>
 *     вернуть() — плавно вернуть карточку на старое место;
 *     оставить() — карточка остаётся там, куда её бросили.
 *   можноНачать(card) → boolean
 *   начато(), закончено() — для блокировки опроса и т. п.
 */
export function включитьПеретаскивание(доска, о) {
  let д = null;       // текущее перетаскивание
  let ожидание = null; // нажатие, которое ещё может стать перетаскиванием

  const карточкиСписка = (list) => [...list.children].filter(n => n.classList.contains("ff-card") && !n.classList.contains("ff-drag-src"));

  // ---------- начало ----------
  function нажатие(e) {
    if (д || ожидание) return;
    if (e.button != null && e.button !== 0) return;
    const card = e.target.closest(".ff-card");
    if (!card || !доска.contains(card)) return;
    const заРучку = !!e.target.closest(".ff-grip");
    if (!заРучку && e.target.closest("button, a, input, select, textarea, label, .ff-details")) return;
    if (о.можноНачать && !о.можноНачать(card)) return;
    const палец = e.pointerType === "touch" || e.pointerType === "pen";
    ожидание = { card, x: e.clientX, y: e.clientY, палец, pointerId: e.pointerId, таймер: 0 };
    if (палец && !заРучку) {
      ожидание.таймер = setTimeout(() => { if (ожидание) начать(ожидание.x, ожидание.y, true); }, ДОЛГОЕ_НАЖАТИЕ);
    } else if (палец && заРучку) {
      e.preventDefault();
      начать(e.clientX, e.clientY, true);
    }
  }

  function движениеДо(e) {
    if (!ожидание || д) return;
    const dx = e.clientX - ожидание.x, dy = e.clientY - ожидание.y;
    const путь = Math.hypot(dx, dy);
    if (ожидание.палец) {
      if (путь > ДРОЖЬ_ПАЛЬЦА) сброситьОжидание();   // это прокрутка, а не перетаскивание
      return;
    }
    if (путь >= ПОРОГ_МЫШИ) начать(e.clientX, e.clientY, false);
  }

  function сброситьОжидание() {
    if (ожидание) clearTimeout(ожидание.таймер);
    ожидание = null;
  }

  function начать(x, y, палец) {
    const card = ожидание.card;
    сброситьОжидание();
    const r = card.getBoundingClientRect();
    const колонки = о.колонки();
    const откуда = колонки.find(k => k.list.contains(card));
    if (!откуда) return;
    if (палец && navigator.vibrate) { try { navigator.vibrate(12); } catch {} }

    // копия, которая едет за указателем
    const призрак = card.cloneNode(true);
    призрак.classList.add("ff-ghost");
    призрак.classList.remove("open", "ff-enter", "ff-fresh", "ff-landed");
    призрак.removeAttribute("id");
    призрак.setAttribute("aria-hidden", "true");
    Object.assign(призрак.style, { width: r.width + "px", left: r.left + "px", top: r.top + "px" });
    document.body.append(призрак);

    // пустое место той же высоты
    const место = document.createElement("div");
    место.className = "ff-ph";
    место.style.height = r.height + "px";
    card.after(место);
    card.classList.add("ff-drag-src");

    д = {
      card, призрак, место, палец,
      dx: x - r.left, dy: y - r.top, x, y,
      откуда, куда: откуда, можно: true,
      исход: { parent: card.parentElement, next: место.nextSibling },
      кадр: 0, скролл: прокручиваемый(доска), середины: null,
      исходнаяПозиция: позицияМеста(место),
    };
    document.documentElement.classList.add("ff-dragging");
    requestAnimationFrame(() => призрак.classList.add("ff-lift"));
    отметитьКолонки();
    о.начато?.();
    цикл();
  }

  // ---------- движение ----------
  function движение(e) {
    if (!д) return движениеДо(e);
    if (e.cancelable) e.preventDefault();
    д.x = e.clientX; д.y = e.clientY;
  }

  // Один кадр: призрак, колонка под пальцем, место вставки, автопрокрутка.
  function цикл() {
    if (!д) return;
    const { призрак, x, y } = д;
    призрак.style.transform = `translate3d(${x - д.dx - parseFloat(призрак.style.left)}px, ${y - д.dy - parseFloat(призрак.style.top)}px, 0) scale(var(--ff-lift-scale, 1.03))`;
    автопрокрутка();
    const колонка = колонкаПод(x, y);
    if (колонка && колонка !== д.куда) { д.куда = колонка; д.середины = null; отметитьКолонки(); }
    if (д.можно) поставитьМесто(y);
    д.кадр = requestAnimationFrame(цикл);
  }

  function колонкаПод(x, y) {
    let лучшая = null, дист = Infinity;
    for (const k of о.колонки()) {
      if (k.col.hidden) continue;
      const r = k.col.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top - 40 && y <= r.bottom + 40) return k;
      const d = Math.abs(x - (r.left + r.right) / 2);
      if (x >= r.left - 24 && x <= r.right + 24 && d < дист) { лучшая = k; дист = d; }
    }
    return лучшая;
  }

  function отметитьКолонки() {
    const from = д.откуда.stage, to = д.куда.stage;
    const п = о.проверить(from, to);
    д.можно = п.ok;
    for (const k of о.колонки()) {
      k.col.classList.remove("ff-drop-ok", "ff-drop-no", "ff-drop-home");
      const ч = k.col.querySelector(".ff-drop-why"); if (ч) ч.remove();
    }
    if (to === from) д.куда.col.classList.add(п.ok ? "ff-drop-home" : "ff-drop-no");
    else д.куда.col.classList.add(п.ok ? "ff-drop-ok" : "ff-drop-no");
    if (!п.ok && п.why) {
      const ч = document.createElement("div");
      ч.className = "ff-drop-why"; ч.textContent = п.why;
      д.куда.col.querySelector(".ff-col-h")?.after(ч);
    }
    // нельзя сюда — место возвращается домой
    if (!п.ok) вернутьМестоДомой();
    else д.середины = null;
  }

  function вернутьМестоДомой() {
    const { место, исход } = д;
    if (место.parentElement === исход.parent && место.previousSibling === д.card) return;
    const list = место.parentElement;
    const были = снять([...(list ? карточкиСписка(list) : []), ...карточкиСписка(исход.parent)]);
    д.card.after(место);
    довести([...были.keys()], были);
  }

  const снять = (узлы) => new Map(узлы.map(n => [n, n.getBoundingClientRect()]));

  function поставитьМесто(y) {
    const list = д.куда.list;
    if (!д.середины || д.середины.list !== list) {
      // замер раз на колонку/перестановку — не каждый кадр
      const карты = карточкиСписка(list);
      д.середины = { list, карты, y: карты.map(n => { const r = n.getBoundingClientRect(); return r.top + r.height / 2; }) };
    }
    const { карты, y: мид } = д.середины;
    let i = 0;
    while (i < мид.length && y > мид[i]) i++;
    const перед = карты[i] || null;
    const сейчасПеред = (() => { let n = д.место.nextSibling; while (n && !(n.classList?.contains("ff-card") && !n.classList.contains("ff-drag-src"))) n = n.nextSibling; return n; })();
    if (д.место.parentElement === list && сейчасПеред === перед) return;
    const старый = д.место.parentElement;
    const были = снять([...карты, ...(старый && старый !== list ? карточкиСписка(старый) : [])]);
    if (перед) list.insertBefore(д.место, перед);
    else {
      const ещё = list.querySelector(".ff-more-btn, .ff-empty");
      if (ещё) list.insertBefore(д.место, ещё); else list.append(д.место);
    }
    довести([...были.keys()], были);
    д.середины = null;
  }

  function автопрокрутка() {
    const { x, y, скролл } = д;
    // по вертикали: страница/рабочая область
    const sr = скролл === document.scrollingElement || скролл === document.documentElement
      ? { top: 0, bottom: innerHeight } : скролл.getBoundingClientRect();
    let vy = 0;
    if (y < sr.top + КРАЙ) vy = -СКОРОСТЬ * (1 - (y - sr.top) / КРАЙ);
    else if (y > sr.bottom - КРАЙ) vy = СКОРОСТЬ * (1 - (sr.bottom - y) / КРАЙ);
    if (vy) { скролл.scrollTop += Math.max(-СКОРОСТЬ, Math.min(СКОРОСТЬ, vy)); д.середины = null; }
    // по горизонтали: доска на телефоне листается РОВНО на одну колонку,
    // если палец подержали у края 0,3 с. Следующий шаг — только после того,
    // как палец ушёл от края: иначе карточка проскакивала через колонку.
    if (доска.scrollWidth > доска.clientWidth + 1) {
      const br = доска.getBoundingClientRect();
      const сторона = x < br.left + КРАЙ ? -1 : x > br.right - КРАЙ ? 1 : 0;
      const сейчас = performance.now();
      if (!сторона) { д.уКрая = 0; д.шагСделан = false; }
      else if (!д.шагСделан) {
        if (!д.уКрая) д.уКрая = сейчас;
        // один шаг за одно касание края: чтобы листать дальше, отведите палец
        if (сейчас - д.уКрая > 300) {
          д.шагСделан = true;
          const ширина = (о.колонки()[0]?.col.offsetWidth || br.width * 0.88) + 10;
          доска.scrollBy({ left: сторона * ширина, behavior: меньшеДвижения() ? "auto" : "smooth" });
          д.шагВбок = сейчас; д.середины = null;
        }
      }
    }
    // внутри колонки (если у списка своя прокрутка)
    const list = д.куда.list;
    if (list.scrollHeight > list.clientHeight + 1) {
      const lr = list.getBoundingClientRect();
      if (y < lr.top + 40) { list.scrollTop -= 12; д.середины = null; }
      else if (y > lr.bottom - 40) { list.scrollTop += 12; д.середины = null; }
    }
  }

  // ---------- конец ----------
  async function отпускание() {
    if (!д) { сброситьОжидание(); return; }
    const тек = д; д = null;
    cancelAnimationFrame(тек.кадр);
    // щелчок, который браузер пришлёт следом за отпусканием, не раскрывает карточку
    доска.dataset.justDragged = "1";
    setTimeout(() => { delete доска.dataset.justDragged; }, 350);
    очиститьКолонки();
    document.documentElement.classList.remove("ff-dragging");

    const { card, призрак, место, откуда, исход } = тек;
    const куда = тек.можно ? тек.куда : откуда;
    if (!тек.можно) вернутьМестоДомойДля(тек);

    // копия плавно садится на место
    await посадить(призрак, место);
    const позиция = позицияМеста(место);
    место.replaceWith(card);
    card.classList.remove("ff-drag-src");
    призрак.remove();

    if (куда === откуда && позиция === тек.исходнаяПозиция) { о.закончено?.(); return; }

    const вернуть = () => {
      const были = снять([card]);
      if (исход.next && исход.next.parentElement === исход.parent) исход.parent.insertBefore(card, исход.next);
      else исход.parent.append(card);
      довести([card], были, 320);
    };
    card.classList.add("ff-pending");
    try {
      await о.наБросок({ id: card.dataset.id, from: откуда.stage, to: куда.stage, index: позиция, card, вернуть, оставить: () => {} });
    } finally {
      card.classList.remove("ff-pending");
      о.закончено?.();
    }
  }

  function вернутьМестоДомойДля(тек) { const сохр = д; д = тек; вернутьМестоДомой(); д = сохр; }

  // Позиция места среди карточек колонки (без перетаскиваемой).
  function позицияМеста(место) {
    let i = 0;
    for (let n = место.parentElement?.firstElementChild; n && n !== место; n = n.nextElementSibling) {
      if (n.classList.contains("ff-card") && !n.classList.contains("ff-drag-src")) i++;
    }
    return i;
  }

  function посадить(призрак, место) {
    return new Promise(готово => {
      if (меньшеДвижения()) return готово();
      const r = место.getBoundingClientRect();
      призрак.classList.remove("ff-lift");
      призрак.classList.add("ff-landing");
      призрак.style.transform = `translate3d(${r.left - parseFloat(призрак.style.left)}px, ${r.top - parseFloat(призрак.style.top)}px, 0)`;
      setTimeout(готово, 190);
    });
  }

  function очиститьКолонки() {
    for (const k of о.колонки()) {
      k.col.classList.remove("ff-drop-ok", "ff-drop-no", "ff-drop-home");
      k.col.querySelector(".ff-drop-why")?.remove();
    }
  }

  function отмена() {
    if (!д) { сброситьОжидание(); return; }
    const тек = д;
    вернутьМестоДомой();
    д.можно = false;
    д.куда = тек.откуда;
    отпускание();
  }

  // ---------- слушатели ----------
  доска.addEventListener("pointerdown", нажатие);
  addEventListener("pointermove", движение, { passive: false });
  addEventListener("pointerup", отпускание);
  addEventListener("pointercancel", () => { if (д && д.палец) return; отмена(); });
  // На телефоне после долгого нажатия прокрутку надо остановить вручную:
  // touchmove с preventDefault работает только с passive: false.
  const тачДвижение = (e) => {
    if (д) { e.preventDefault(); const t = e.touches[0]; if (t) { д.x = t.clientX; д.y = t.clientY; } return; }
    if (ожидание) { const t = e.touches[0]; if (t && Math.hypot(t.clientX - ожидание.x, t.clientY - ожидание.y) > ДРОЖЬ_ПАЛЬЦА) сброситьОжидание(); }
  };
  addEventListener("touchmove", тачДвижение, { passive: false });
  addEventListener("touchend", () => { if (д && д.палец) отпускание(); else сброситьОжидание(); });
  addEventListener("touchcancel", () => { if (д && д.палец) отмена(); else сброситьОжидание(); });
  const клавиша = (e) => { if (e.key === "Escape" && д) { e.preventDefault(); отмена(); } };
  addEventListener("keydown", клавиша);
  // долгое нажатие на телефоне не должно открывать меню «копировать»
  доска.addEventListener("contextmenu", (e) => { if (д || ожидание) e.preventDefault(); });
  // щелчок после перетаскивания не раскрывает карточку
  доска.addEventListener("click", (e) => { if (доска.dataset.justDragged) { e.stopPropagation(); e.preventDefault(); } }, true);

  return {
    идёт: () => !!д || !!ожидание,
    снять() {
      доска.removeEventListener("pointerdown", нажатие);
      removeEventListener("pointermove", движение);
      removeEventListener("pointerup", отпускание);
      removeEventListener("touchmove", тачДвижение);
      removeEventListener("keydown", клавиша);
    },
  };
}
