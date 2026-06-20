// ========================================================================
//  Клиентская генерация PDF каталога (все товары, с фото, по категориям).
//  pdf-lib + fontkit через CDN; шрифт NotoSans (кириллица) из /fonts/.
//  Все картинки нормализуются через canvas → JPEG (работает и с webp),
//  битые/недоступные — заменяются плейсхолдером.
// ========================================================================

let _libs = null;
async function libs() {
  if (_libs) return _libs;
  const pdf = await import("https://esm.sh/pdf-lib@1.17.1");
  const fontkit = (await import("https://esm.sh/@pdf-lib/fontkit@1.1.1")).default;
  _libs = { ...pdf, fontkit };
  return _libs;
}

// Картинку (любой формат) → JPEG-байты фиксированного квадрата. null при ошибке/CORS.
function imgToJpeg(url, size) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    const done = (v) => resolve(v);
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = size; c.height = size;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#f2f4f7"; ctx.fillRect(0, 0, size, size);
        const r = Math.min(size / img.width, size / img.height);
        const w = img.width * r, h = img.height * r;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        const b64 = c.toDataURL("image/jpeg", 0.7).split(",")[1];
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        done(arr);
      } catch { done(null); }
    };
    img.onerror = () => done(null);
    img.src = url;
  });
}

function ellipsize(text, maxW, size, font) {
  text = String(text || "");
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  while (text.length > 1 && font.widthOfTextAtSize(text + "…", size) > maxW) text = text.slice(0, -1);
  return text + "…";
}

export async function downloadCatalogPDF(groups, onProgress) {
  const { PDFDocument, rgb, fontkit } = await libs();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const [regBuf, boldBuf] = await Promise.all([
    fetch("/fonts/NotoSans-Regular.ttf").then(r => r.arrayBuffer()),
    fetch("/fonts/NotoSans-Bold.ttf").then(r => r.arrayBuffer()),
  ]);
  const font = await doc.embedFont(regBuf);
  const bold = await doc.embedFont(boldBuf);

  const NAVY = rgb(0.09, 0.13, 0.22), TEXT = rgb(0.1, 0.1, 0.12), GREY = rgb(0.42, 0.44, 0.5);
  const GREEN = rgb(0.04, 0.5, 0.32), AMBER = rgb(0.72, 0.46, 0.06), LINE = rgb(0.85, 0.86, 0.88), PHBG = rgb(0.95, 0.96, 0.97);

  const W = 595.28, H = 841.89, M = 36, G = 14, COLS = 3;
  const colW = (W - 2 * M - (COLS - 1) * G) / COLS;
  const imgH = colW * 0.82;
  const cardH = imgH + 36;
  const rowH = cardH + 14;

  let page = doc.addPage([W, H]);
  let y = H - M;

  // шапка первой страницы: логотип + название + дата
  try {
    const logo = await doc.embedPng(await fetch("/icon-512.png").then(r => r.arrayBuffer()));
    page.drawImage(logo, { x: M, y: y - 44, width: 44, height: 44 });
  } catch {}
  page.drawText("GENERAL MODERN", { x: M + 56, y: y - 22, size: 18, font: bold, color: NAVY });
  page.drawText("Каталог товаров · " + new Date().toLocaleDateString("ru-RU"), { x: M + 56, y: y - 38, size: 10, font, color: GREY });
  y -= 64;

  const newPage = () => { page = doc.addPage([W, H]); y = H - M; };
  const ensure = (need) => { if (y - need < M + 20) newPage(); };

  const total = groups.reduce((s, [, l]) => s + l.length, 0);
  let done = 0;

  for (const [cat, list] of groups) {
    ensure(34 + rowH);
    page.drawText(`${cat}  (${list.length})`, { x: M, y: y - 15, size: 13, font: bold, color: NAVY });
    page.drawLine({ start: { x: M, y: y - 23 }, end: { x: W - M, y: y - 23 }, thickness: 0.5, color: LINE });
    y -= 36;

    for (let i = 0; i < list.length; i += COLS) {
      ensure(rowH);
      const top = y;
      for (let c = 0; c < COLS; c++) {
        const p = list[i + c];
        if (!p) break;
        const x = M + c * (colW + G);
        const jpeg = await imgToJpeg(p.photo_url, 240);
        let drew = false;
        if (jpeg) { try { const im = await doc.embedJpg(jpeg); page.drawImage(im, { x, y: top - imgH, width: colW, height: imgH }); drew = true; } catch {} }
        if (!drew) {
          page.drawRectangle({ x, y: top - imgH, width: colW, height: imgH, color: PHBG });
          const ch = (p.name || "?").trim().charAt(0).toUpperCase();
          page.drawText(ch, { x: x + colW / 2 - 9, y: top - imgH / 2 - 10, size: 28, font: bold, color: rgb(0.78, 0.79, 0.82) });
        }
        page.drawText(ellipsize(p.name, colW, 9, font), { x, y: top - imgH - 13, size: 9, font, color: TEXT });
        const inStock = p.status === "in_stock";
        page.drawText(inStock ? "● В наличии" : "○ Под заказ", { x, y: top - imgH - 26, size: 8, font, color: inStock ? GREEN : AMBER });
        done++;
        if (onProgress && done % 5 === 0) onProgress(done, total);
      }
      y = top - rowH;
    }
  }
  if (onProgress) onProgress(total, total);

  const bytes = await doc.save();
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `general-modern-catalog-${new Date().toISOString().slice(0, 10)}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
