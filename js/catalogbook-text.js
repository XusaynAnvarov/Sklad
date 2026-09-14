// ========================================================================
//  ПОДПИСИ ПЕЧАТНОГО КАТАЛОГА НА ТРЁХ ЯЗЫКАХ: ru / uz / en.
//
//  Названия товаров не переводим — клиенты знают их именно так, как они
//  записаны в складе. Переводим только оформление и названия разделов.
//
//  Разделы в складе записаны «как говорят» («Ножы», «Нинала», «Тень»).
//  Для книги — нормальные названия. Узбекские и английские — черновик,
//  владельцу проверить; поправить можно в настройках каталога
//  (settings.catalog_info.разделы), они важнее этой таблицы.
// ========================================================================

export const ЯЗЫКИ = ["ru", "uz", "en"];

export const ПОДПИСИ = {
  ru: {
    каталог: "Каталог товаров",
    оглавление: "Содержание",
    оКомпании: "О компании",
    разделы: "Разделы каталога",
    товаров: (n) => `${n} ${склонение(n, "товар", "товара", "товаров")}`,
    стр: "стр.",
    код: "Код",
    какЗаказать: "Как заказать",
    шагиЗаказа: [
      "Найдите товар в каталоге и запишите его код — например, LP-017.",
      "Отправьте коды и количество в Telegram-бот или менеджеру.",
      "Мы подтвердим наличие и цену и соберём заказ.",
    ],
    ботПодпись: "Заказ через Telegram-бот",
    сайтПодпись: "Каталог на сайте",
    телефоны: "Телефоны",
    адрес: "Адрес",
    заметки: "Для заметок",
    продолжение: "продолжение",
    безФото: "фото скоро",
    ценыНет: "Цены и наличие уточняйте у менеджера — они меняются чаще, чем печатается каталог.",
  },
  uz: {
    каталог: "Mahsulotlar katalogi",
    оглавление: "Mundarija",
    оКомпании: "Kompaniya haqida",
    разделы: "Katalog bo‘limlari",
    товаров: (n) => `${n} ta mahsulot`,
    стр: "bet",
    код: "Kod",
    какЗаказать: "Qanday buyurtma berish mumkin",
    шагиЗаказа: [
      "Katalogdan mahsulotni toping va kodini yozib oling — masalan, LP-017.",
      "Kodlar va sonini Telegram-botga yoki menejerga yuboring.",
      "Biz mavjudligi va narxini tasdiqlab, buyurtmani tayyorlaymiz.",
    ],
    ботПодпись: "Telegram-bot orqali buyurtma",
    сайтПодпись: "Saytdagi katalog",
    телефоны: "Telefonlar",
    адрес: "Manzil",
    заметки: "Eslatmalar uchun",
    продолжение: "davomi",
    безФото: "rasm tez orada",
    ценыНет: "Narx va mavjudligini menejerdan so‘rang — ular katalog chop etilganidan tezroq o‘zgaradi.",
  },
  en: {
    каталог: "Product catalog",
    оглавление: "Contents",
    оКомпании: "About us",
    разделы: "Catalog sections",
    товаров: (n) => `${n} ${n === 1 ? "item" : "items"}`,
    стр: "p.",
    код: "Code",
    какЗаказать: "How to order",
    шагиЗаказа: [
      "Find the item in the catalog and note its code — for example, LP-017.",
      "Send the codes and quantities to our Telegram bot or your manager.",
      "We confirm stock and price and pack your order.",
    ],
    ботПодпись: "Order via Telegram bot",
    сайтПодпись: "Online catalog",
    телефоны: "Phone",
    адрес: "Address",
    заметки: "Notes",
    продолжение: "continued",
    безФото: "photo coming soon",
    ценыНет: "Please check prices and stock with your manager — they change more often than the catalog is printed.",
  },
};

function склонение(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

// Ключ — раздел, как он записан в складе.
export const РАЗДЕЛЫ = {
  "Лапки":             { ru: "Лапки",                         uz: "Lapkalar",                          en: "Presser feet" },
  "Приборы для машин": { ru: "Приспособления для машин",      uz: "Tikuv mashinasi moslamalari",        en: "Sewing attachments" },
  "Улитки":            { ru: "Улитки",                        uz: "Ulitkalar",                          en: "Hemmers & folders" },
  "Ножы":              { ru: "Ножи",                          uz: "Pichoqlar",                          en: "Knives" },
  "Нинала":            { ru: "Иглы",                          uz: "Ninalar",                            en: "Needles" },
  "Аппараты":          { ru: "Аппараты",                      uz: "Apparatlar",                         en: "Machines & devices" },
  "Утюги":             { ru: "Утюги и запчасти",              uz: "Dazmollar va ehtiyot qismlar",       en: "Irons & parts" },
  "Пластина":          { ru: "Игольные пластины",             uz: "Igna plastinalari",                  en: "Needle plates" },
  "Чельнок":           { ru: "Челноки",                       uz: "Chelnoklar",                         en: "Rotary hooks" },
  "Крышки":            { ru: "Крышки",                        uz: "Qopqoqlar",                          en: "Covers & lids" },
  "Ремень":            { ru: "Ремни и шланги",                uz: "Tasmalar va shlanglar",              en: "Belts & hoses" },
  "Петлител":          { ru: "Петлители",                     uz: "Petlitellar",                        en: "Loopers" },
  "Регулятор":         { ru: "Регуляторы натяжения",          uz: "Ip taranglik regulyatorlari",        en: "Tension regulators" },
  "Иглодержател":      { ru: "Иглодержатели",                 uz: "Igna ushlagichlar",                  en: "Needle bars & clamps" },
  "Калиш":             { ru: "Калиш",                         uz: "Kalish",                             en: "Kalish" },
  "Светилник":         { ru: "Светильники",                   uz: "Chiroqlar",                          en: "Sewing lamps" },
  "Насатки":           { ru: "Насадки",                       uz: "Nasadkalar",                         en: "Setting dies" },
  "Мокки":             { ru: "Шпульные колпачки",             uz: "Mokilar",                            en: "Bobbin cases" },
  "Бабина стойки":     { ru: "Бобинные стойки",               uz: "Bobina stoykalari",                  en: "Thread stands" },
  "Тиш":               { ru: "Зубчатые рейки",                uz: "Tishlar",                            en: "Feed dogs" },
  "Тень":              { ru: "ТЭНы",                          uz: "Tenlar (qizdirgichlar)",             en: "Heating elements" },
  "Магниты":           { ru: "Магниты",                       uz: "Magnitlar",                          en: "Magnetic guides" },
  "Диск":              { ru: "Дисковые ножи",                 uz: "Disk pichoqlar",                     en: "Round blades" },
  "Шпулка":            { ru: "Шпульки",                       uz: "Shpulkalar",                         en: "Bobbins" },
  "Метры":             { ru: "Сантиметры и рулетки",          uz: "Santimetr va ruletkalar",            en: "Tape measures" },
  "Шестеренки":        { ru: "Шестерёнки",                    uz: "Shesternyalar",                      en: "Gears" },
  "Пинцеты":           { ru: "Пинцеты",                       uz: "Pinsetlar",                          en: "Tweezers" },
  "Болть":             { ru: "Болты",                         uz: "Boltlar",                            en: "Screws" },
  "Без категории":     { ru: "Разное",                        uz: "Turli mahsulotlar",                  en: "Other" },
};

// Название раздела на языке книги. Порядок: правка владельца → таблица →
// как записано в складе.
export function названиеРаздела(раздел, язык, правки = {}) {
  const своё = правки && правки[раздел] && правки[раздел][язык];
  if (своё) return своё;
  const т = РАЗДЕЛЫ[раздел];
  return (т && т[язык]) || раздел;
}
