// ========================================================================
//  СОЗДАНИЕ ЭЛЕМЕНТА — короткая замена document.createElement.
//
//  el("div.mini-row.low", { text: "Кайчи", onclick: … }, [дети])
//    · теги через точку — классы: "div.info", "span.qty.neg"
//    · text — текстом, а не HTML: чужое имя товара не станет разметкой
//    · style объектом, on* — обработчики, остальное — атрибуты
//
//  Живёт отдельным файлом, потому что им пользуются оба мини-приложения:
//  склад (только для владельца) и заказ (для клиентов). Импорт склада
//  тянет за собой вход владельца, и клиентскому приложению он не нужен.
// ========================================================================
export const el = (tag, props = {}, children = []) => {
  const parts = String(tag).split(".");
  const e = document.createElement(parts[0] || "div");
  parts.slice(1).forEach(c => c && e.classList.add(c));
  Object.entries(props).forEach(([k, v]) => {
    if (v == null) return;
    if (k === "text") e.textContent = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null || c === false) return;
    e.append(c.nodeType ? c : document.createTextNode(String(c)));
  });
  return e;
};
