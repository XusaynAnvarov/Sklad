// ========================================================================
//  НАРИСОВАННЫЕ ДЕТАЛИ ШВЕЙНЫХ МАШИН (SVG).
//  Свои иллюстрации, а не снимки с сайта: одинаково чистые на любом
//  экране, весят несколько килобайт и не зависят от базы.
//  деталь(вид, id) → строка <svg>. id делает градиенты уникальными,
//  когда одна и та же деталь стоит на странице несколько раз.
// ========================================================================

const сталь = (id) => `
  <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff"/><stop offset=".28" stop-color="#e4e9f1"/>
    <stop offset=".55" stop-color="#9aa6b8"/><stop offset=".78" stop-color="#d5dce7"/><stop offset="1" stop-color="#6b7689"/>
  </linearGradient>
  <linearGradient id="${id}t" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#7d889b"/><stop offset=".35" stop-color="#f4f7fb"/><stop offset=".6" stop-color="#b9c3d1"/><stop offset="1" stop-color="#5f6a7d"/>
  </linearGradient>
  <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff4c9"/><stop offset=".35" stop-color="#ecd081"/><stop offset=".7" stop-color="#c79a33"/><stop offset="1" stop-color="#8f6a1c"/>
  </linearGradient>
  <radialGradient id="${id}r" cx=".38" cy=".32" r=".75">
    <stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#cfd7e3"/><stop offset="1" stop-color="#6b7689"/>
  </radialGradient>
  <linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </linearGradient>`;

const ВИДЫ = {
  // лапка: стержень с винтом и подошва с прорезью
  foot: (i) => `
    <rect x="49" y="8" width="22" height="50" rx="6" fill="url(#${i}t)"/>
    <rect x="52" y="10" width="5" height="44" rx="2.5" fill="#fff" opacity=".55"/>
    <circle cx="60" cy="22" r="5" fill="#3b4558"/><circle cx="60" cy="22" r="2.2" fill="#9aa6b8"/>
    <path d="M46 54h28l6 14H40z" fill="url(#${i}s)"/>
    <path d="M14 70h86c6 0 10 4 10 10v8c0 9-7 14-16 14H34c-14 0-22-8-22-20 0-7 0-12 2-12z" fill="url(#${i}s)"/>
    <path d="M18 73h80c3 0 5 2 5 5" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/>
    <rect x="55" y="72" width="10" height="30" rx="3" fill="#2a3346"/>
    <path d="M22 96c10 4 66 4 82-2" stroke="#59647a" stroke-width="2" fill="none" opacity=".5"/>`,
  // шпулька с намотанной золотой нитью
  bobbin: (i) => `
    <circle cx="60" cy="60" r="46" fill="url(#${i}r)"/>
    <circle cx="60" cy="60" r="46" fill="none" stroke="#6b7689" stroke-width="1.5" opacity=".6"/>
    <circle cx="60" cy="60" r="34" fill="url(#${i}g)"/>
    ${[30, 26, 22, 18].map(r => `<circle cx="60" cy="60" r="${r}" fill="none" stroke="#a8802a" stroke-width="1.2" opacity=".55"/>`).join("")}
    <path d="M36 44a30 30 0 0 1 22-14" stroke="#fff7d6" stroke-width="3" fill="none" stroke-linecap="round" opacity=".9"/>
    ${[0, 60, 120, 180, 240, 300].map(a => { const x = 60 + 40 * Math.cos(a * Math.PI / 180), y = 60 + 40 * Math.sin(a * Math.PI / 180); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="#4a5468"/>`; }).join("")}
    <circle cx="60" cy="60" r="11" fill="url(#${i}s)"/><circle cx="60" cy="60" r="4" fill="#2a3346"/>`,
  // челнок: кольцо, носик-крючок золотом
  hook: (i) => `
    <circle cx="58" cy="62" r="40" fill="url(#${i}r)"/>
    <circle cx="58" cy="62" r="27" fill="#e9edf3"/>
    <circle cx="58" cy="62" r="27" fill="none" stroke="#8792a5" stroke-width="2"/>
    <path d="M20 54C26 26 62 10 98 22c-26-2-48 8-62 30z" fill="url(#${i}g)"/>
    <path d="M30 46c10-16 30-26 52-26" stroke="#fff6cf" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="58" cy="62" r="10" fill="url(#${i}s)"/><circle cx="58" cy="62" r="3.6" fill="#2a3346"/>
    <path d="M30 84a34 34 0 0 0 40 12" stroke="#fff" stroke-width="3" fill="none" opacity=".55" stroke-linecap="round"/>`,
  // игла: золотая колба, стальное жало, ушко
  needle: (i) => `
    <g transform="rotate(-38 60 60)">
      <rect x="53" y="2" width="14" height="34" rx="4" fill="url(#${i}g)"/>
      <rect x="56" y="4" width="3" height="30" rx="1.5" fill="#fff7d6" opacity=".8"/>
      <path d="M55 36h10l-2 58-3 22-3-22z" fill="url(#${i}t)"/>
      <ellipse cx="60" cy="88" rx="1.6" ry="5" fill="#2a3346"/>
      <path d="M58 40v44" stroke="#fff" stroke-width="1.4" opacity=".8"/>
    </g>`,
  // шпульный колпачок с защёлкой
  case: (i) => `
    <circle cx="54" cy="64" r="38" fill="url(#${i}r)"/>
    <circle cx="54" cy="64" r="38" fill="none" stroke="#6b7689" stroke-width="1.5" opacity=".6"/>
    <circle cx="54" cy="64" r="18" fill="#2a3346"/><circle cx="54" cy="64" r="12" fill="url(#${i}g)"/>
    <path d="M76 44l32-16c4-2 8 4 4 7L84 56z" fill="url(#${i}g)"/>
    <path d="M24 82c12 12 36 14 52 0" stroke="#4a5468" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M30 42a30 30 0 0 1 24-10" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".85"/>`,
  // нож: лезвие со скосом и крепёжными отверстиями
  knife: (i) => `
    <g transform="rotate(-24 60 60)">
      <path d="M10 46h86l14 14-14 14H10z" fill="url(#${i}s)"/>
      <path d="M96 46l14 14-14 14z" fill="url(#${i}t)"/>
      <path d="M12 50h82" stroke="#fff" stroke-width="3" opacity=".85" stroke-linecap="round"/>
      <rect x="10" y="46" width="22" height="28" rx="3" fill="url(#${i}g)"/>
      <circle cx="44" cy="60" r="4" fill="#2a3346"/><circle cx="70" cy="60" r="4" fill="#2a3346"/>
    </g>`,
};
export const ДЕТАЛИ_СПИСОК = Object.keys(ВИДЫ);

let счётчик = 0;
export function деталь(вид, id) {
  const i = (id || "d") + (++счётчик);
  const тело = (ВИДЫ[вид] || ВИДЫ.foot)(i);
  return `<svg viewBox="0 0 120 120" aria-hidden="true"><defs>${сталь(i)}</defs>${тело}</svg>`;
}
