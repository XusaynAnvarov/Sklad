// ========================================================================
//  Генератор QR-кода. Свой, потому что внешние библиотеки в мини-приложении
//  не подключить — их блокирует политика безопасности Telegram.
//  Версии 1–4 (21×21 … 33×33), байтовый режим, коррекция ошибок M.
//  Этого с запасом хватает: в наклейке лежит короткая строка вида gm:<id>.
//  Наклейка печатается ОДИН раз и живёт вечно — внутри неизменный номер
//  товара, а остаток и цена подтягиваются из базы при сканировании.
// ========================================================================

// Сколько байт данных влезает в версию при коррекции M
const CAP_M = { 1: 14, 2: 26, 3: 42, 4: 62 };
// Число кодовых слов данных и блоков (версия → [всего слов, блоков])
const EC_M = { 1: [16, 1], 2: [28, 1], 3: [44, 1], 4: [64, 2] };
// Слов коррекции на блок
const ECC_PER_BLOCK_M = { 1: 10, 2: 16, 3: 26, 4: 18 };

// ---------- арифметика Галуа GF(256) ----------
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

// Многочлен-генератор для n слов коррекции
function genPoly(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

// Слова коррекции для блока данных
function ecc(data, n) {
  const gen = genPoly(n);
  const res = new Array(n).fill(0);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.shift(); res.push(0);
    for (let i = 0; i < n; i++) res[i] ^= mul(gen[i + 1], factor);
  }
  return res;
}

// ---------- сборка потока бит ----------
function bitStream(text, version) {
  const bytes = new TextEncoder().encode(text);
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(0b0100, 4);                 // байтовый режим
  push(bytes.length, 8);           // длина (для версий 1–9 — 8 бит)
  bytes.forEach(b => push(b, 8));
  const totalWords = EC_M[version][0];
  const capacityBits = totalWords * 8;
  push(0, Math.min(4, capacityBits - bits.length));        // терминатор
  while (bits.length % 8) bits.push(0);                     // добить до байта
  const words = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    words.push(v);
  }
  const PAD = [0xec, 0x11];
  let k = 0;
  while (words.length < totalWords) words.push(PAD[k++ % 2]);
  return words;
}

// Данные + коррекция, с чередованием блоков
function codewords(text, version) {
  const words = bitStream(text, version);
  const blocks = EC_M[version][1];
  const eccLen = ECC_PER_BLOCK_M[version];
  const per = Math.floor(words.length / blocks);
  const dataBlocks = [], eccBlocks = [];
  for (let i = 0; i < blocks; i++) {
    const chunk = words.slice(i * per, (i + 1) * per);
    dataBlocks.push(chunk);
    eccBlocks.push(ecc(chunk, eccLen));
  }
  const out = [];
  for (let i = 0; i < per; i++) for (const b of dataBlocks) out.push(b[i]);
  for (let i = 0; i < eccLen; i++) for (const b of eccBlocks) out.push(b[i]);
  return out;
}

// ---------- матрица ----------
function emptyMatrix(size) {
  return { m: Array.from({ length: size }, () => new Array(size).fill(null)), size };
}
function placeFinder(M, r, c) {
  for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
    const y = r + i, x = c + j;
    if (y < 0 || x < 0 || y >= M.size || x >= M.size) continue;
    const on = (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
               (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
               (i >= 2 && i <= 4 && j >= 2 && j <= 4);
    M.m[y][x] = on ? 1 : 0;
  }
}
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26] };
function placeAlign(M, version) {
  const pos = ALIGN[version];
  for (const r of pos) for (const c of pos) {
    if ((r === 6 && c === 6) || (r === 6 && c === pos[pos.length - 1]) || (r === pos[pos.length - 1] && c === 6)) continue;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      M.m[r + i][c + j] = (Math.abs(i) === 2 || Math.abs(j) === 2 || (i === 0 && j === 0)) ? 1 : 0;
    }
  }
}
// Сведения о формате: коррекция M (10) + маска 0, с кодом БЧХ
function formatBits() {
  const data = (0b00 << 3) | 0;                  // M = 00, маска 0
  let v = data << 10;
  const g = 0b10100110111;
  for (let i = 4; i >= 0; i--) if (v & (1 << (i + 10))) v ^= g << i;
  return ((data << 10) | v) ^ 0b101010000010010;
}
function placeFormat(M) {
  const bits = formatBits();
  const get = (i) => (bits >> i) & 1;
  for (let i = 0; i <= 5; i++) M.m[8][i] = get(i);
  M.m[8][7] = get(6); M.m[8][8] = get(7); M.m[7][8] = get(8);
  for (let i = 9; i <= 14; i++) M.m[14 - i][8] = get(i);
  const n = M.size;
  for (let i = 0; i <= 7; i++) M.m[n - 1 - i][8] = get(i);
  // бит 7 второй копии лежит в столбце n-8; без него ячейка остаётся пустой,
  // уходит под данные и сдвигает весь поток — код становится нечитаемым
  for (let i = 7; i <= 14; i++) M.m[8][n - 15 + i] = get(i);
  M.m[n - 8][8] = 1;                              // всегда тёмный модуль
}

export function qrMatrix(text) {
  const bytes = new TextEncoder().encode(String(text || "")).length;
  let version = 0;
  for (const v of [1, 2, 3, 4]) if (bytes <= CAP_M[v]) { version = v; break; }
  if (!version) throw new Error("Слишком длинная строка для наклейки");

  const size = 17 + version * 4;
  const M = emptyMatrix(size);
  placeFinder(M, 0, 0); placeFinder(M, 0, size - 7); placeFinder(M, size - 7, 0);
  placeAlign(M, version);
  for (let i = 8; i < size - 8; i++) {            // дорожки синхронизации
    const bit = (i % 2 === 0) ? 1 : 0;
    if (M.m[6][i] === null) M.m[6][i] = bit;
    if (M.m[i][6] === null) M.m[i][6] = bit;
  }
  placeFormat(M);

  // данные змейкой снизу вверх, сразу с маской 0 ((r+c) % 2 === 0)
  const words = codewords(text, version);
  const bits = [];
  words.forEach(w => { for (let i = 7; i >= 0; i--) bits.push((w >> i) & 1); });

  let idx = 0, up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;                          // столбец синхронизации пропускаем
    for (let k = 0; k < size; k++) {
      const row = up ? size - 1 - k : k;
      for (const c of [col, col - 1]) {
        if (M.m[row][c] !== null) continue;
        let bit = idx < bits.length ? bits[idx++] : 0;
        if ((row + c) % 2 === 0) bit ^= 1;          // маска 0
        M.m[row][c] = bit;
      }
    }
    up = !up;
  }
  return M.m.map(row => row.map(v => v ? 1 : 0));
}

// Отрисовать QR как SVG-строку (без внешних файлов и шрифтов)
export function qrSvg(text, { size = 120, quiet = 2, color = "#000", bg = "#fff" } = {}) {
  const m = qrMatrix(text);
  const n = m.length + quiet * 2;
  let path = "";
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m.length; c++) {
      if (m[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR"><rect width="${n}" height="${n}" fill="${bg}"/><path d="${path}" fill="${color}"/></svg>`;
}

// ---------- содержимое наклейки ----------
const PREFIX = "gm:";
export const skuPayload = (productId) => PREFIX + String(productId || "");

// Разобрать отсканированное. Чужие QR из магазина игнорируем.
export function parsePayload(text) {
  const s = String(text || "").trim();
  if (!s.startsWith(PREFIX)) return null;
  const id = s.slice(PREFIX.length).trim();
  return /^[\w-]{1,64}$/.test(id) ? id : null;
}
