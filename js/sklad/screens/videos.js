// ========================================================================
//  ВИДЕО ТОВАРОВ — в телефоне.
//
//  То же, что в складе на сайте (js/pages/videos_admin.js), но под руку:
//  снять ролик камерой и сразу выложить. Файл идёт прямо в защищённое
//  хранилище, на сайте его видят только вошедшие клиенты.
//
//  Видео привязывается к товару — тогда в карточке товара на сайте видно,
//  о чём ролик. Поиск товара здесь тот же, что в продаже и приходе
//  (js/productsearch.js), чтобы искалось одинаково везде.
// ========================================================================
import { el, go } from "../app.js?v=20261010h";
import { icon } from "../../icons.js?v=20261010h";
import { toast, modal, confirmDialog, showLoader, hideLoader } from "../../ui.js?v=20261010h";
import { thumb } from "../../img.js?v=20261010h";
import { подходит } from "../../productsearch.js?v=20261010h";
import { подписьКода } from "../../catalogcode.js?v=20261010h";

const дата = (d) => { const t = new Date(d); return isFinite(t) ? t.toLocaleDateString("ru-RU") : "—"; };

export default async function render(box, ctx) {
  const [видео, товары] = await Promise.all([
    ctx.db.videos.list().catch(() => []),
    ctx.db.products.list().catch(() => []),
  ]);
  const pmap = Object.fromEntries(товары.map(p => [p.id, p]));

  // ---------- выбор товара (общий для загрузки и правки) ----------
  function выборТовара(начальный) {
    const состояние = { id: начальный || null };
    const подпись = el("div.sku", { style: { marginTop: "4px" } });
    const поиск = el("input.inp", { type: "search", placeholder: "Товар (необязательно): название, артикул или код",
      style: { width: "100%", minHeight: "44px", fontSize: "16px" } });
    const найдено = el("div.mini-list", { style: { maxHeight: "190px", overflowY: "auto" } });

    const показать = () => {
      const p = состояние.id ? pmap[состояние.id] : null;
      подпись.textContent = p ? "Привязано: " + p.name : "Не привязано к товару";
    };
    const искать = () => {
      const q = поиск.value.trim().toLowerCase();
      найдено.innerHTML = "";
      if (q.length < 2) return;
      товары.filter(p => подходит(p, q)).slice(0, 6).forEach(p => {
        найдено.append(el("div.mini-row", { onclick: () => { состояние.id = p.id; поиск.value = ""; найдено.innerHTML = ""; показать(); } }, [
          el("div.info", {}, [el("div.nm", { text: p.name }), el("div.sku", { text: подписьКода(p) || "—" })]),
        ]));
      });
    };
    let t = 0;
    поиск.addEventListener("input", () => { clearTimeout(t); t = setTimeout(искать, 180); });
    показать();

    const убрать = el("button.btn.btn-outline.btn-sm", { text: "Убрать привязку", onclick: () => { состояние.id = null; показать(); } });
    return { состояние, поле: el("div", {}, [поиск, найдено, подпись, el("div", { style: { marginTop: "6px" } }, [убрать])]) };
  }

  // ---------- загрузка нового ----------
  function загрузить() {
    const fTitle = el("input.inp", { placeholder: "Название (напр. «Установка лапки P36LN»)",
      style: { width: "100%", minHeight: "44px", fontSize: "16px" } });
    // capture=camera даёт сразу снять ролик, а не искать его в галерее
    const fFile = el("input.inp", { type: "file", accept: "video/*", style: { width: "100%" } });
    const товар = выборТовара(null);
    modal({
      title: "Новое видео",
      wide: true,
      body: el("div", { style: { display: "grid", gap: "10px" } }, [
        fTitle,
        fFile,
        el("div.hint", { text: "MP4, MOV или WebM, примерно до 100 МБ. Можно снять прямо сейчас — телефон предложит камеру." }),
        товар.поле,
      ]),
      actions: [
        { label: "Отмена", kind: "btn-outline", onClick: c => c() },
        {
          label: "Загрузить", kind: "btn-primary", onClick: async (close) => {
            const file = fFile.files && fFile.files[0];
            if (!file) { toast("Выберите или снимите видео", "err"); return; }
            if (!fTitle.value.trim()) { toast("Впишите название", "err"); return; }
            showLoader("Загружаем видео… большой файл идёт минуту");
            try {
              const path = await ctx.db.uploadVideo(file);
              await ctx.db.videos.upsert({ title: fTitle.value.trim(), path, product_id: товар.состояние.id || null });
              toast("Видео загружено", "ok");
              close(); go("videos");
            } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
            finally { hideLoader(); }
          },
        },
      ],
    });
  }

  // ---------- правка ----------
  function правка(v) {
    const fTitle = el("input.inp", { value: v.title || "", placeholder: "Название",
      style: { width: "100%", minHeight: "44px", fontSize: "16px" } });
    const товар = выборТовара(v.product_id || null);
    modal({
      title: v.title || "Видео",
      wide: true,
      body: el("div", { style: { display: "grid", gap: "10px" } }, [
        fTitle,
        товар.поле,
        el("div.hint", { text: "Сам файл не меняется. Чтобы заменить ролик — удалите этот и загрузите новый." }),
      ]),
      actions: [
        {
          label: "Удалить", kind: "btn-danger", onClick: (close) => {
            confirmDialog("Удалить видео «" + (v.title || "") + "»?", async () => {
              try { await ctx.db.videos.remove(v.id); toast("Удалено", "ok"); close(); go("videos"); }
              catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
            });
          },
        },
        { label: "Отмена", kind: "btn-outline", onClick: c => c() },
        {
          label: "Сохранить", kind: "btn-primary", onClick: async (close) => {
            if (!fTitle.value.trim()) { toast("Впишите название", "err"); return; }
            try {
              await ctx.db.videos.upsert({ id: v.id, title: fTitle.value.trim(), product_id: товар.состояние.id || null });
              toast("Сохранено", "ok"); close(); go("videos");
            } catch (e) { toast("Не удалось: " + (e.message || e), "err"); }
          },
        },
      ],
    });
  }

  // ---------- экран ----------
  box.append(el("div.mini-acts", { style: { marginBottom: "12px" } }, [
    el("button.mini-act.wide", { onclick: загрузить }, [
      icon("plus", { size: 20 }),
      el("div", {}, [el("div", { text: "Загрузить видео" }), el("div.sub", { text: "снять камерой или выбрать файл" })]),
    ]),
  ]));

  if (!Array.isArray(видео) || !видео.length) {
    box.append(el("div.mini-empty", { text: "Видео пока нет" }));
    return;
  }

  const список = el("div.mini-list");
  видео.forEach(v => {
    const p = v.product_id ? pmap[v.product_id] : null;
    список.append(el("div.mini-row", { onclick: () => правка(v) }, [
      p && p.photo_url
        ? el("img.ph", { src: thumb(p.photo_url, 84), loading: "lazy", decoding: "async", alt: "" })
        : el("div.ph", {}, [icon("broadcast", { size: 18 })]),
      el("div.info", {}, [
        el("div.nm", { text: v.title || "—" }),
        el("div.sku", { text: (p ? p.name : "без товара") + " · " + дата(v.created_at) }),
      ]),
      el("button.mini-icon-btn", { title: "Изменить", onclick: (e) => { e.stopPropagation(); правка(v); } }, [icon("edit", { size: 16 })]),
    ]));
  });
  box.append(список);
}
