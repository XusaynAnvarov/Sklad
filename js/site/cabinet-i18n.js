// ========================================================================
//  ТЕКСТЫ ЛИЧНОГО КАБИНЕТА — русский, узбекский (латиница), английский.
//
//  Язык берётся из настройки сайта (gm_lang) в момент отрисовки: при смене
//  языка сайт перерисовывает раздел, и кабинет сразу говорит на новом.
//  Чего нет в узбекском или английском, показывается по-русски.
// ========================================================================
import { подпись, заЕдиницу } from "../unit.js?v=20261114a";

let L = "ru";
export const задатьЯзык = (l) => { L = ["ru", "uz", "en"].includes(l) ? l : "ru"; };
export const язык = () => L;

// русское склонение: 1 накладная, 2 накладные, 5 накладных
export function склон(n, a, b, c) {
  const x = Math.abs(Math.trunc(Number(n) || 0)) % 100, y = x % 10;
  if (x > 10 && x < 15) return c;
  if (y === 1) return a;
  if (y > 1 && y < 5) return b;
  return c;
}
const en = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

// ---------- единицы измерения ----------
const ЕД_UZ = { "шт": "dona", "пачка": "pachka", "коробка": "quti", "набор": "to‘plam", "комплект": "komplekt", "метр": "metr", "кг": "kg" };
const ЕД_EN = { "шт": ["pc", "pcs"], "пачка": ["pack", "packs"], "коробка": ["box", "boxes"], "набор": ["set", "sets"], "комплект": ["kit", "kits"], "метр": ["m", "m"], "кг": ["kg", "kg"] };
const NF2 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

// «10 пачек» / «10 pachka» / «10 packs»
export function кол(q, u) {
  const unit = u || "шт", n = Number(q) || 0, s = NF2.format(n);
  if (L === "uz") return `${s} ${ЕД_UZ[unit] || unit}`;
  if (L === "en") { const e = ЕД_EN[unit] || [unit, unit]; return `${s} ${n === 1 ? e[0] : e[1]}`; }
  return подпись(s, { unit });
}
// «за пачку» / «1 pachka uchun» / «per pack»
export function заЕд(u) {
  const unit = u || "шт";
  if (L === "uz") return `1 ${ЕД_UZ[unit] || unit} uchun`;
  if (L === "en") return `per ${(ЕД_EN[unit] || [unit])[0]}`;
  return "за " + заЕдиницу(unit);
}
export function единица(u) {
  const unit = u || "шт";
  if (L === "uz") return ЕД_UZ[unit] || unit;
  if (L === "en") return (ЕД_EN[unit] || [unit])[0];
  return unit;
}

// ---------- деньги и даты ----------
const ВАЛ = { ru: "сум", uz: "so‘m", en: "sum" };
const NF0 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
export function money(v, c) {
  const n = Number(v) || 0, знак = n < 0 ? "−" : "";
  if (c === "som") return знак + NF0.format(Math.abs(n)) + " " + ВАЛ[L];
  return знак + (c === "usd" ? "$" : "¥") + NF2.format(Math.abs(n));
}
const МЕСТО = () => (L === "en" ? "en-GB" : "ru-RU");
export const dt = (d) => { const x = new Date(d); return isFinite(x) ? x.toLocaleDateString(МЕСТО()) : "—"; };
export const dtm = (d) => { const x = new Date(d); return isFinite(x) ? x.toLocaleString(МЕСТО(), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"; };

// ---------- словарь ----------
const СЛ = {
  ru: {
    home: "Главная", search: "Поиск", buys: "Покупки", fin: "Финансы", me: "Профиль",
    navAria: "Разделы кабинета", cabinet: "Кабинет", loading: "загрузка…", client: "Клиент",
    hHome: (n) => `Здравствуйте${n ? ", " + n : ""}!`, pHome: "Ваши покупки, заказы и оплаты — по данным склада",
    hSearch: "Поиск товаров", pSearch: "Сразу видно, покупали ли вы товар, по какой цене и когда",
    hBuys: "Мои покупки", pBuys: "Все накладные и заказы с фото товаров",
    hFin: "Мои финансы", pFin: "Покупки, оплаты и долг — каждая валюта отдельно",
    hMe: "Профиль", pMe: "Контакты, пароль и связь с менеджером",
    searchPh: "Название, артикул, код, категория…", searchAria: "Поиск товаров", clear: "Очистить поиск",
    loadErr: "Не удалось загрузить кабинет: ", retry: "Повторить", zoom: "Увеличить фото",
    deleted: "Товар удалён из каталога", item: "Товар",
    refund: "Возврат", paid: "Оплачено", partial: "Оплачено частично", unpaid: "Не оплачено", issued: "Выдан",
    stPlaced: "Оформлен, ещё не собран", stPacked: "Собран, ждёт отправки", stShipped: "Отправлен",
    ordOrder: "Принят — менеджер уточняет цены", ordPending: "Цены выставлены — ждёт вашего подтверждения",
    ordConfirmed: "Подтверждён — готовим накладную", ordCanceled: "Отменён", ordGeneric: "Заказ",
    inStock: "В наличии", outStock: "Нет в наличии", soon: "Скоро будет",
    kTurn: "Сумма покупок", nInv: (n) => `${n} ${склон(n, "накладная", "накладные", "накладных")}`,
    nRef: (n) => `${n} ${склон(n, "возврат", "возврата", "возвратов")}`,
    kPaid: "Оплачено", lastPay: (d) => "Последняя оплата " + d, noPay: "Оплат пока нет",
    kDebt: "Задолженность", none: "Нет", debtMore: "Подробнее — в «Финансах»", advance: (x) => "Аванс: " + x, noDebt: "Задолженности нет",
    kOrders: "Заказы", ordersSub: (d, w) => `${d} ${склон(d, "завершён", "завершено", "завершено")} · ${w} в работе`,
    lastOrder: "Последний заказ", noOrders: "Заказов пока нет.", findItem: "Найти товар", more: "Подробнее",
    repeatOrder: "Повторить заказ", priceTbd: "цена уточняется",
    andMore: (n) => `и ещё ${n} ${склон(n, "позиция", "позиции", "позиций")}`,
    positions: (n) => `${n} ${склон(n, "позиция", "позиции", "позиций")}`,
    notLinked: "Ваш аккаунт ещё не привязан к складу. Как только менеджер привяжет его, здесь появятся покупки, оплаты и ваши цены.",
    searchItems: "Искать товары",
    evShipped: (no) => `Заказ № ${no} отправлен`, inTransit: "Товар в пути",
    evPacked: (no) => `Заказ № ${no} собран`, evPackedSub: "Скоро передадим на отправку",
    evPlaced: (no) => `Заказ № ${no} оформлен`, evPlacedSub: "Готовим к сборке",
    evConfirm: (no) => `Цены по заказу № ${no} выставлены`, evConfirmSub: "Заказ ждёт вашего подтверждения",
    evOrder: (no) => `Заказ № ${no} принят`, evOrderSub: "Менеджер уточнит цены",
    notices: "Уведомления", twoWeeks: "за 2 недели", noNotices: "Новых событий нет. Когда заказ соберут или отправят, вы увидите это здесь.",
    recentBought: "Последние купленные товары", tapHistory: "нажмите — история цен",
    oftenBuy: "Покупаете чаще всего", times: (n) => `${n} ${склон(n, "раз", "раза", "раз")}`, lastPrice: (p) => "последняя " + p,
    toOrder: "В заказ", oftenEmpty: "Здесь появятся товары, которые вы берёте регулярно.",
    lastPayments: "Последние платежи", all: "Все", accepted: "Принят", noPayments: "Оплат пока не записано",
    fAll: "Все товары", fBought: "Покупал раньше", fNever: "Никогда не покупал", fFav: "Избранное",
    filterAria: "Какие товары показать", loadingCatalog: "Загружаем каталог…", showMore: (n) => `Показать ещё (${n})`,
    sku: "Арт.", code: "Код",
    boughtBefore: (n) => `Ранее покупали · ${n} ${склон(n, "раз", "раза", "раз")}`,
    yourLast: (d, q) => `Ваша последняя покупка: ${d} · ${q}`,
    notBought: "Ещё не покупали", neverBig: "Вы ещё не покупали этот товар", neverMeta: "Цена вашей предыдущей покупки отсутствует",
    history: "История покупок", askPrice: "Запросить цену", order: "Заказать", favAdd: "В избранное", favDel: "Убрать из избранного",
    catFail: "Каталог не загрузился. Проверьте интернет.",
    found: (n, b) => `Найдено: ${n}${b ? ` · из них вы покупали ${b}` : ""}`,
    listAll: (n) => `Весь каталог: ${n} ${склон(n, "товар", "товара", "товаров")} · сначала то, что вы покупали`,
    listShown: (n) => `Показано: ${n} ${склон(n, "товар", "товара", "товаров")}`,
    favEmpty: "В избранном пока пусто. Нажмите на звёздочку у товара, чтобы добавить его сюда.",
    allBought: "Вы уже покупали все товары из каталога.",
    nothing: "Ничего не нашлось. Попробуйте артикул, часть названия или другое написание.", askManager: "Спросить менеджера",
    ordersInWork: "Заказы в работе", notInvoicesYet: "ещё не накладные",
    invQ: "Товар, артикул или № накладной", invQAria: "Поиск по накладным",
    period: "Период", pAll: "За всё время", pM1: "Этот месяц", pM3: "Последние 3 месяца", pY: "Этот год",
    statusAria: "Статус", sAll: "Все накладные", sDebt: "С долгом", sPaid: "Оплаченные", sWay: "Собираются и в пути", sRef: "Возвраты",
    catAria: "Категория", catAll: "Все категории", dlHistory: "Скачать историю",
    invoice: "Накладная", debtShort: (x) => "долг " + x, refundNote: "Возврат уменьшил ваш долг на эту сумму",
    paidX: (x) => "Оплачено " + x, leftX: (x) => "осталось " + x, paidFull: "Оплачено полностью",
    moreItems: (n) => `+ ещё ${n} ${склон(n, "позиция", "позиции", "позиций")}`, repeat: "Повторить",
    invShown: (n, t, s) => `Показано ${n} из ${t} · на сумму ${s}`,
    noInvFilter: "Под этот фильтр накладных нет.",
    noInv: "Оформленных накладных пока нет. Как только менеджер оформит ваш заказ, накладная появится здесь — с фото товаров и ценами.",
    advanceK: "Аванс (переплата)", advanceSub: "Зачтём в следующую покупку", paymentsK: "Платежей", lastX: (d) => "Последний " + d, notYet: "Пока нет",
    allIssued: "все выданные накладные", byPayments: "по записанным платежам", curDebt: "Текущая задолженность",
    toPay: (n) => `${n} ${склон(n, "накладная", "накладные", "накладных")} к оплате`,
    noDebtThanks: "✓ Задолженности нет. Спасибо, что платите вовремя!",
    oldDebt: "Долг до начала учёта в системе", oldDebtSub: "Гасится вашими оплатами в первую очередь",
    unpaidInv: "Неоплаченные накладные", sumX: (x) => "сумма " + x, paidSmall: (x) => "оплачено " + x, allPaid: "Все накладные оплачены",
    allocNote: "Оплаты закрывают накладные по очереди: сначала самые старые. Каждая валюта считается отдельно — так же, как в акте сверки.",
    payHistory: "История платежей", date: "Дата", amount: "Сумма", note: "Примечание",
    contacts: "Контакты", edit: "Изменить", cancel: "Отмена", namePh: "Имя или название фирмы", nameAria: "Имя",
    phonePh: "Телефон (+998…)", phoneAria: "Телефон", save: "Сохранить",
    codePh: "Код из Telegram (6 цифр)", codeAria: "Код подтверждения", codeResend: "Отправить код ещё раз", codeNeed: "Введите 6 цифр кода из Telegram",
    codeSent: "Мы отправили код в Telegram нового номера. Введите его и нажмите «Сохранить».", codeNeedBot: "Новый номер ещё не подтверждён в Telegram. С Telegram этого номера откройте бота, нажмите /start и «Поделиться номером», затем сохраните снова.", codeOpenBot: "Открыть бота",
    changePass: "Сменить пароль", curPass: "Текущий пароль", newPass: "Новый пароль (минимум 6 символов)", newPassAria: "Новый пароль", newPass2: "Повторите новый пароль",
    writeManager: "Написать менеджеру", msgPh: "Например: нужна шпулька BC-DB1, 50 пачек — есть в наличии?", msgAria: "Сообщение",
    msgNote: "Сообщение придёт менеджеру в Telegram вместе с вашим именем и телефоном", send: "Отправить",
    profileSaved: "Данные обновлены", fillAll: "Заполните все поля", passShort: "Новый пароль — не меньше 6 символов",
    passMismatch: "Пароли не совпадают", passChanged: "Пароль изменён", writeMsg: "Напишите сообщение", msgSent: "Сообщение отправлено менеджеру", error: "Ошибка",
    details: "Подробности", close: "Закрыть", thProduct: "Товар", thQtyPrice: "Кол-во × цена", thSum: "Сумма",
    total: "Итого", refundReduced: "Возврат уменьшил ваш долг", paidByInv: "Оплачено по накладной", debtByInv: "Задолженность по накладной",
    statusHistory: "История статусов", issuedAt: "Накладная выдана",
    orderNo: (no) => `Заказ № ${no}`, invoiceNo: (no) => `Накладная № ${no}`, refundNo: (no) => `Возврат № ${no}`,
    canceledNote: "Заказ отменён — в долг он не попал.",
    orderNote: "Когда менеджер оформит накладную, здесь появятся сборка и отправка, а заказ перейдёт в список накладных.",
    priceChange: "Как менялась ваша цена", yourPrice: "Ваша цена", in_som: "в сумах", in_usd: "в долларах", in_yuan: "в юанях",
    unitLabel: (u) => "единица: " + u,
    kLastPrice: "Последняя цена", kLastTime: "В последний раз", invNoX: (no) => "накладная № " + no, kTotalBought: "Всего куплено",
    kReturned: "Возвращено", inDebt: "учтено в долге", noReturns: "возвратов не было",
    allPurchases: "Все покупки этого товара", thInvoice: "Накладная", refundMark: "возврат",
    histNote: "Здесь только ваши выданные накладные. Заказы без цены и отменённые не считаются покупкой; возвраты отмечены отдельно.",
    repeatX: (q) => "Повторить: " + q, noStockAsk: "Сейчас нет в наличии — можно спросить менеджера.", ask: "Спросить",
    orderProduct: "Заказать товар", repeatOrderNo: (no) => `Повторить заказ № ${no}`,
    checkQty: "Проверьте количество. Цены на новый заказ подтвердит менеджер — как при обычном заказе на сайте.",
    lastTime: (q) => "в прошлый раз " + q, less: "Меньше", moreQ: "Больше", qty: "Количество",
    sendOrder: "Отправить заказ", sending: "Отправляем…", noneInStock: "Этих товаров сейчас нет в наличии.",
    enterQty: "Укажите количество", orderSent: "Заказ отправлен. Менеджер подтвердит цены.", orderFail: "Не удалось отправить заказ",
    pdfFail: "Не удалось скачать PDF", xlsSaved: "Excel-файл сохранён", csvSaved: "Файл сохранён — откроется в Excel",
    priceRequested: "Запрос цены отправлен менеджеру", sendFail: "Не удалось отправить",
    csvHead: ["Дата", "Накладная", "Товар", "Артикул", "Количество", "Единица", "Цена за единицу", "Валюта", "Сумма", "Тип"],
    purchase: "Покупка", csvName: "istoriya-pokupok",
  },
  uz: {
    home: "Bosh sahifa", search: "Qidiruv", buys: "Xaridlar", fin: "Moliya", me: "Profil",
    navAria: "Kabinet bo‘limlari", cabinet: "Kabinet", loading: "yuklanmoqda…", client: "Mijoz",
    hHome: (n) => `Assalomu alaykum${n ? ", " + n : ""}!`, pHome: "Xaridlaringiz, buyurtmalaringiz va to‘lovlaringiz — ombor ma’lumotlari bo‘yicha",
    hSearch: "Mahsulot qidirish", pSearch: "Mahsulotni avval olganmisiz, qaysi narxda va qachon — darhol ko‘rinadi",
    hBuys: "Mening xaridlarim", pBuys: "Barcha yuk xatlari va buyurtmalar mahsulot rasmlari bilan",
    hFin: "Mening moliyam", pFin: "Xaridlar, to‘lovlar va qarz — har bir valyuta alohida",
    hMe: "Profil", pMe: "Kontaktlar, parol va menejer bilan aloqa",
    searchPh: "Nomi, artikul, kod, turkum…", searchAria: "Mahsulot qidirish", clear: "Qidiruvni tozalash",
    loadErr: "Kabinetni yuklab bo‘lmadi: ", retry: "Qayta urinish", zoom: "Rasmni kattalashtirish",
    deleted: "Mahsulot katalogdan olib tashlangan", item: "Mahsulot",
    refund: "Qaytarish", paid: "To‘langan", partial: "Qisman to‘langan", unpaid: "To‘lanmagan", issued: "Berilgan",
    stPlaced: "Rasmiylashtirildi, hali yig‘ilmagan", stPacked: "Yig‘ildi, jo‘natishni kutmoqda", stShipped: "Jo‘natildi",
    ordOrder: "Qabul qilindi — menejer narxlarni aniqlashtirmoqda", ordPending: "Narxlar qo‘yildi — tasdig‘ingizni kutmoqda",
    ordConfirmed: "Tasdiqlandi — yuk xati tayyorlanmoqda", ordCanceled: "Bekor qilindi", ordGeneric: "Buyurtma",
    inStock: "Mavjud", outStock: "Mavjud emas", soon: "Tez orada",
    kTurn: "Xaridlar summasi", nInv: (n) => `${n} ta yuk xati`, nRef: (n) => `${n} ta qaytarish`,
    kPaid: "To‘langan", lastPay: (d) => "Oxirgi to‘lov " + d, noPay: "Hali to‘lov yo‘q",
    kDebt: "Qarzdorlik", none: "Yo‘q", debtMore: "Batafsil — «Moliya» bo‘limida", advance: (x) => "Avans: " + x, noDebt: "Qarzdorlik yo‘q",
    kOrders: "Buyurtmalar", ordersSub: (d, w) => `${d} ta yakunlangan · ${w} ta jarayonda`,
    lastOrder: "Oxirgi buyurtma", noOrders: "Hali buyurtmalar yo‘q.", findItem: "Mahsulot topish", more: "Batafsil",
    repeatOrder: "Buyurtmani takrorlash", priceTbd: "narx aniqlanmoqda",
    andMore: (n) => `yana ${n} ta mahsulot`, positions: (n) => `${n} ta mahsulot`,
    notLinked: "Hisobingiz hali omborga bog‘lanmagan. Menejer bog‘lagach, bu yerda xaridlar, to‘lovlar va sizning narxlaringiz paydo bo‘ladi.",
    searchItems: "Mahsulot qidirish",
    evShipped: (no) => `№ ${no} buyurtma jo‘natildi`, inTransit: "Yo‘lda",
    evPacked: (no) => `№ ${no} buyurtma yig‘ildi`, evPackedSub: "Tez orada jo‘natamiz",
    evPlaced: (no) => `№ ${no} buyurtma rasmiylashtirildi`, evPlacedSub: "Yig‘ishga tayyorlanmoqda",
    evConfirm: (no) => `№ ${no} buyurtma narxlari qo‘yildi`, evConfirmSub: "Buyurtma tasdig‘ingizni kutmoqda",
    evOrder: (no) => `№ ${no} buyurtma qabul qilindi`, evOrderSub: "Menejer narxlarni aniqlashtiradi",
    notices: "Bildirishnomalar", twoWeeks: "2 hafta ichida", noNotices: "Yangi voqealar yo‘q. Buyurtma yig‘ilganda yoki jo‘natilganda shu yerda ko‘rasiz.",
    recentBought: "Oxirgi xarid qilingan mahsulotlar", tapHistory: "bosing — narxlar tarixi",
    oftenBuy: "Eng ko‘p xarid qilganlaringiz", times: (n) => `${n} marta`, lastPrice: (p) => "oxirgisi " + p,
    toOrder: "Buyurtmaga", oftenEmpty: "Bu yerda doimiy oladigan mahsulotlaringiz chiqadi.",
    lastPayments: "Oxirgi to‘lovlar", all: "Barchasi", accepted: "Qabul qilindi", noPayments: "Hali to‘lovlar yozilmagan",
    fAll: "Barcha mahsulotlar", fBought: "Avval olganman", fNever: "Hech olmaganman", fFav: "Sevimlilar",
    filterAria: "Qaysi mahsulotlarni ko‘rsatish", loadingCatalog: "Katalog yuklanmoqda…", showMore: (n) => `Yana ko‘rsatish (${n})`,
    sku: "Art.", code: "Kod",
    boughtBefore: (n) => `Avval olgansiz · ${n} marta`, yourLast: (d, q) => `Oxirgi xaridingiz: ${d} · ${q}`,
    notBought: "Hali olmagansiz", neverBig: "Siz bu mahsulotni hali sotib olmagansiz", neverMeta: "Oldingi xaridingiz narxi yo‘q",
    history: "Xaridlar tarixi", askPrice: "Narxni so‘rash", order: "Buyurtma berish", favAdd: "Sevimlilarga", favDel: "Sevimlilardan olib tashlash",
    catFail: "Katalog yuklanmadi. Internetni tekshiring.",
    found: (n, b) => `Topildi: ${n}${b ? ` · shundan ${b} tasini olgansiz` : ""}`,
    listAll: (n) => `Butun katalog: ${n} ta mahsulot · avval olganlaringiz`, listShown: (n) => `Ko‘rsatildi: ${n} ta mahsulot`,
    favEmpty: "Sevimlilar hozircha bo‘sh. Qo‘shish uchun mahsulotdagi yulduzchani bosing.",
    allBought: "Siz katalogdagi barcha mahsulotlarni olgansiz.",
    nothing: "Hech narsa topilmadi. Artikul, nomning bir qismi yoki boshqa yozilishini sinab ko‘ring.", askManager: "Menejerdan so‘rash",
    ordersInWork: "Jarayondagi buyurtmalar", notInvoicesYet: "hali yuk xati emas",
    invQ: "Mahsulot, artikul yoki yuk xati №", invQAria: "Yuk xatlari bo‘yicha qidiruv",
    period: "Davr", pAll: "Butun davr", pM1: "Shu oy", pM3: "Oxirgi 3 oy", pY: "Shu yil",
    statusAria: "Holat", sAll: "Barcha yuk xatlari", sDebt: "Qarzi bor", sPaid: "To‘langan", sWay: "Yig‘ilmoqda va yo‘lda", sRef: "Qaytarishlar",
    catAria: "Turkum", catAll: "Barcha turkumlar", dlHistory: "Tarixni yuklab olish",
    invoice: "Yuk xati", debtShort: (x) => "qarz " + x, refundNote: "Qaytarish qarzingizni shu summaga kamaytirdi",
    paidX: (x) => "To‘langan " + x, leftX: (x) => "qoldi " + x, paidFull: "To‘liq to‘langan",
    moreItems: (n) => `+ yana ${n} ta`, repeat: "Takrorlash",
    invShown: (n, t, s) => `${t} tadan ${n} tasi ko‘rsatildi · summa ${s}`,
    noInvFilter: "Bu filtr bo‘yicha yuk xatlari yo‘q.",
    noInv: "Hali rasmiylashtirilgan yuk xatlari yo‘q. Menejer buyurtmangizni rasmiylashtirgach, yuk xati shu yerda mahsulot rasmlari va narxlari bilan paydo bo‘ladi.",
    advanceK: "Avans (ortiqcha to‘lov)", advanceSub: "Keyingi xaridda hisobga olinadi", paymentsK: "To‘lovlar", lastX: (d) => "Oxirgisi " + d, notYet: "Hali yo‘q",
    allIssued: "barcha berilgan yuk xatlari", byPayments: "yozilgan to‘lovlar bo‘yicha", curDebt: "Joriy qarzdorlik",
    toPay: (n) => `${n} ta yuk xati to‘lanishi kerak`,
    noDebtThanks: "✓ Qarzdorlik yo‘q. O‘z vaqtida to‘laganingiz uchun rahmat!",
    oldDebt: "Tizimda hisob boshlanishidan oldingi qarz", oldDebtSub: "To‘lovlaringiz bilan birinchi navbatda yopiladi",
    unpaidInv: "To‘lanmagan yuk xatlari", sumX: (x) => "summa " + x, paidSmall: (x) => "to‘langan " + x, allPaid: "Barcha yuk xatlari to‘langan",
    allocNote: "To‘lovlar yuk xatlarini navbat bilan yopadi: avval eng eskilari. Har bir valyuta alohida hisoblanadi — solishtirma dalolatnomadagidek.",
    payHistory: "To‘lovlar tarixi", date: "Sana", amount: "Summa", note: "Izoh",
    contacts: "Kontaktlar", edit: "O‘zgartirish", cancel: "Bekor qilish", namePh: "Ism yoki firma nomi", nameAria: "Ism",
    phonePh: "Telefon (+998…)", phoneAria: "Telefon", save: "Saqlash",
    codePh: "Telegram’dagi kod (6 raqam)", codeAria: "Tasdiqlash kodi", codeResend: "Kodni qayta yuborish", codeNeed: "Telegram’dagi 6 xonali kodni kiriting",
    codeSent: "Kodni yangi raqamning Telegram’iga yubordik. Uni kiriting va «Saqlash»ni bosing.", codeNeedBot: "Yangi raqam hali Telegram’da tasdiqlanmagan. Shu raqamning Telegram’idan botni oching, /start va «Raqamni yuborish»ni bosing, so‘ng qayta saqlang.", codeOpenBot: "Botni ochish",
    changePass: "Parolni o‘zgartirish", curPass: "Joriy parol", newPass: "Yangi parol (kamida 6 belgi)", newPassAria: "Yangi parol", newPass2: "Yangi parolni takrorlang",
    writeManager: "Menejerga yozish", msgPh: "Masalan: BC-DB1 shpulkasi kerak, 50 pachka — bormi?", msgAria: "Xabar",
    msgNote: "Xabar menejerga Telegram orqali ismingiz va telefoningiz bilan boradi", send: "Yuborish",
    profileSaved: "Ma’lumotlar yangilandi", fillAll: "Barcha maydonlarni to‘ldiring", passShort: "Yangi parol kamida 6 belgidan iborat bo‘lsin",
    passMismatch: "Parollar mos kelmadi", passChanged: "Parol o‘zgartirildi", writeMsg: "Xabar yozing", msgSent: "Xabar menejerga yuborildi", error: "Xatolik",
    details: "Batafsil", close: "Yopish", thProduct: "Mahsulot", thQtyPrice: "Miqdor × narx", thSum: "Summa",
    total: "Jami", refundReduced: "Qaytarish qarzingizni kamaytirdi", paidByInv: "Yuk xati bo‘yicha to‘langan", debtByInv: "Yuk xati bo‘yicha qarz",
    statusHistory: "Holatlar tarixi", issuedAt: "Yuk xati berildi",
    orderNo: (no) => `№ ${no} buyurtma`, invoiceNo: (no) => `Yuk xati № ${no}`, refundNo: (no) => `Qaytarish № ${no}`,
    canceledNote: "Buyurtma bekor qilindi — qarzga qo‘shilmadi.",
    orderNote: "Menejer yuk xatini rasmiylashtirgach, bu yerda yig‘ish va jo‘natish ko‘rinadi, buyurtma esa yuk xatlari ro‘yxatiga o‘tadi.",
    priceChange: "Narxingiz qanday o‘zgargan", yourPrice: "Sizning narxingiz", in_som: "so‘mda", in_usd: "dollarda", in_yuan: "yuanda",
    unitLabel: (u) => "birlik: " + u,
    kLastPrice: "Oxirgi narx", kLastTime: "Oxirgi marta", invNoX: (no) => "yuk xati № " + no, kTotalBought: "Jami olingan",
    kReturned: "Qaytarilgan", inDebt: "qarzda hisobga olingan", noReturns: "qaytarish bo‘lmagan",
    allPurchases: "Bu mahsulotning barcha xaridlari", thInvoice: "Yuk xati", refundMark: "qaytarish",
    histNote: "Bu yerda faqat sizga berilgan yuk xatlari. Narxsiz va bekor qilingan buyurtmalar xarid hisoblanmaydi; qaytarishlar alohida belgilangan.",
    repeatX: (q) => "Takrorlash: " + q, noStockAsk: "Hozir mavjud emas — menejerdan so‘rashingiz mumkin.", ask: "So‘rash",
    orderProduct: "Mahsulotga buyurtma", repeatOrderNo: (no) => `№ ${no} buyurtmani takrorlash`,
    checkQty: "Miqdorni tekshiring. Yangi buyurtma narxlarini menejer tasdiqlaydi — saytdagi oddiy buyurtmadagidek.",
    lastTime: (q) => "oldingi safar " + q, less: "Kamroq", moreQ: "Ko‘proq", qty: "Miqdor",
    sendOrder: "Buyurtmani yuborish", sending: "Yuborilmoqda…", noneInStock: "Bu mahsulotlar hozir mavjud emas.",
    enterQty: "Miqdorni kiriting", orderSent: "Buyurtma yuborildi. Menejer narxlarni tasdiqlaydi.", orderFail: "Buyurtmani yuborib bo‘lmadi",
    pdfFail: "PDF yuklab bo‘lmadi", xlsSaved: "Excel fayl saqlandi", csvSaved: "Fayl saqlandi — Excel’da ochiladi",
    priceRequested: "Narx so‘rovi menejerga yuborildi", sendFail: "Yuborib bo‘lmadi",
    csvHead: ["Sana", "Yuk xati", "Mahsulot", "Artikul", "Miqdor", "Birlik", "Birlik narxi", "Valyuta", "Summa", "Turi"],
    purchase: "Xarid", csvName: "xaridlar-tarixi",
  },
  en: {
    home: "Home", search: "Search", buys: "Purchases", fin: "Finance", me: "Profile",
    navAria: "Cabinet sections", cabinet: "Cabinet", loading: "loading…", client: "Client",
    hHome: (n) => `Hello${n ? ", " + n : ""}!`, pHome: "Your purchases, orders and payments, straight from our warehouse records",
    hSearch: "Product search", pSearch: "See at once whether you bought an item before, at what price and when",
    hBuys: "My purchases", pBuys: "All invoices and orders with product photos",
    hFin: "My finances", pFin: "Purchases, payments and debt, each currency separately",
    hMe: "Profile", pMe: "Contacts, password and messages to the manager",
    searchPh: "Name, SKU, code, category…", searchAria: "Search products", clear: "Clear search",
    loadErr: "Could not load the cabinet: ", retry: "Try again", zoom: "Enlarge photo",
    deleted: "Item removed from the catalogue", item: "Item",
    refund: "Return", paid: "Paid", partial: "Partly paid", unpaid: "Unpaid", issued: "Delivered",
    stPlaced: "Placed, not packed yet", stPacked: "Packed, awaiting shipment", stShipped: "Shipped",
    ordOrder: "Received — the manager is checking prices", ordPending: "Prices set — waiting for your confirmation",
    ordConfirmed: "Confirmed — preparing the invoice", ordCanceled: "Cancelled", ordGeneric: "Order",
    inStock: "In stock", outStock: "Out of stock", soon: "Coming soon",
    kTurn: "Total purchases", nInv: (n) => en(n, "invoice", "invoices"), nRef: (n) => en(n, "return", "returns"),
    kPaid: "Paid", lastPay: (d) => "Last payment " + d, noPay: "No payments yet",
    kDebt: "Debt", none: "None", debtMore: "Details in Finance", advance: (x) => "Advance: " + x, noDebt: "No debt",
    kOrders: "Orders", ordersSub: (d, w) => `${d} completed · ${w} in progress`,
    lastOrder: "Latest order", noOrders: "No orders yet.", findItem: "Find a product", more: "Details",
    repeatOrder: "Reorder", priceTbd: "price to be confirmed",
    andMore: (n) => `and ${en(n, "more item", "more items")}`, positions: (n) => en(n, "item", "items"),
    notLinked: "Your account is not linked to our warehouse yet. Once the manager links it, your purchases, payments and prices will appear here.",
    searchItems: "Search products",
    evShipped: (no) => `Order No. ${no} shipped`, inTransit: "On its way",
    evPacked: (no) => `Order No. ${no} packed`, evPackedSub: "Will be handed over for shipping soon",
    evPlaced: (no) => `Order No. ${no} placed`, evPlacedSub: "Getting ready for packing",
    evConfirm: (no) => `Prices for order No. ${no} are set`, evConfirmSub: "The order is waiting for your confirmation",
    evOrder: (no) => `Order No. ${no} received`, evOrderSub: "The manager will confirm prices",
    notices: "Notifications", twoWeeks: "last 2 weeks", noNotices: "Nothing new. You will see it here when an order is packed or shipped.",
    recentBought: "Recently bought", tapHistory: "tap for price history",
    oftenBuy: "Your most frequent purchases", times: (n) => en(n, "time", "times"), lastPrice: (p) => "last " + p,
    toOrder: "Order", oftenEmpty: "Items you buy regularly will appear here.",
    lastPayments: "Recent payments", all: "All", accepted: "Received", noPayments: "No payments recorded yet",
    fAll: "All products", fBought: "Bought before", fNever: "Never bought", fFav: "Favourites",
    filterAria: "Which products to show", loadingCatalog: "Loading the catalogue…", showMore: (n) => `Show more (${n})`,
    sku: "SKU", code: "Code",
    boughtBefore: (n) => `Bought before · ${en(n, "time", "times")}`, yourLast: (d, q) => `Your last purchase: ${d} · ${q}`,
    notBought: "Not bought yet", neverBig: "You haven't bought this item yet", neverMeta: "There is no price from a previous purchase",
    history: "Purchase history", askPrice: "Request price", order: "Order", favAdd: "Add to favourites", favDel: "Remove from favourites",
    catFail: "The catalogue did not load. Check your connection.",
    found: (n, b) => `Found: ${n}${b ? ` · you bought ${b} of them` : ""}`,
    listAll: (n) => `Whole catalogue: ${en(n, "item", "items")} · your purchases first`, listShown: (n) => `Shown: ${en(n, "item", "items")}`,
    favEmpty: "No favourites yet. Tap the star on a product to add it here.",
    allBought: "You have already bought every item in the catalogue.",
    nothing: "Nothing found. Try the SKU, part of the name or another spelling.", askManager: "Ask the manager",
    ordersInWork: "Orders in progress", notInvoicesYet: "not invoices yet",
    invQ: "Product, SKU or invoice No.", invQAria: "Search invoices",
    period: "Period", pAll: "All time", pM1: "This month", pM3: "Last 3 months", pY: "This year",
    statusAria: "Status", sAll: "All invoices", sDebt: "With debt", sPaid: "Paid", sWay: "Packing and on the way", sRef: "Returns",
    catAria: "Category", catAll: "All categories", dlHistory: "Download history",
    invoice: "Invoice", debtShort: (x) => "debt " + x, refundNote: "This return reduced your debt by this amount",
    paidX: (x) => "Paid " + x, leftX: (x) => x + " left", paidFull: "Paid in full",
    moreItems: (n) => `+ ${n} more`, repeat: "Reorder",
    invShown: (n, t, s) => `Showing ${n} of ${t} · total ${s}`,
    noInvFilter: "No invoices match this filter.",
    noInv: "No invoices yet. As soon as the manager processes your order, the invoice will appear here with product photos and prices.",
    advanceK: "Advance (overpayment)", advanceSub: "Will be applied to your next purchase", paymentsK: "Payments", lastX: (d) => "Latest " + d, notYet: "None yet",
    allIssued: "all delivered invoices", byPayments: "per recorded payments", curDebt: "Current debt",
    toPay: (n) => `${en(n, "invoice", "invoices")} to pay`,
    noDebtThanks: "✓ No debt. Thank you for paying on time!",
    oldDebt: "Debt from before the system was set up", oldDebtSub: "Your payments cover it first",
    unpaidInv: "Unpaid invoices", sumX: (x) => "total " + x, paidSmall: (x) => "paid " + x, allPaid: "All invoices are paid",
    allocNote: "Payments settle invoices in order, oldest first. Each currency is counted separately, just like in the reconciliation statement.",
    payHistory: "Payment history", date: "Date", amount: "Amount", note: "Note",
    contacts: "Contacts", edit: "Edit", cancel: "Cancel", namePh: "Name or company name", nameAria: "Name",
    phonePh: "Phone (+998…)", phoneAria: "Phone", save: "Save",
    codePh: "Telegram code (6 digits)", codeAria: "Confirmation code", codeResend: "Send the code again", codeNeed: "Enter the 6-digit code from Telegram",
    codeSent: "We sent a code to the new number’s Telegram. Enter it and tap “Save”.", codeNeedBot: "The new number isn’t confirmed in Telegram yet. From that number’s Telegram, open the bot, tap /start and “Share number”, then save again.", codeOpenBot: "Open the bot",
    changePass: "Change password", curPass: "Current password", newPass: "New password (at least 6 characters)", newPassAria: "New password", newPass2: "Repeat the new password",
    writeManager: "Message the manager", msgPh: "For example: I need BC-DB1 bobbins, 50 packs — are they in stock?", msgAria: "Message",
    msgNote: "The message goes to the manager on Telegram with your name and phone", send: "Send",
    profileSaved: "Details updated", fillAll: "Fill in all fields", passShort: "The new password must be at least 6 characters",
    passMismatch: "Passwords do not match", passChanged: "Password changed", writeMsg: "Write a message", msgSent: "Message sent to the manager", error: "Error",
    details: "Details", close: "Close", thProduct: "Item", thQtyPrice: "Qty × price", thSum: "Total",
    total: "Total", refundReduced: "The return reduced your debt", paidByInv: "Paid on this invoice", debtByInv: "Debt on this invoice",
    statusHistory: "Status history", issuedAt: "Invoice issued",
    orderNo: (no) => `Order No. ${no}`, invoiceNo: (no) => `Invoice No. ${no}`, refundNo: (no) => `Return No. ${no}`,
    canceledNote: "The order was cancelled and was not added to your debt.",
    orderNote: "Once the manager issues the invoice, packing and shipping will show here and the order will move to your invoices.",
    priceChange: "How your price changed", yourPrice: "Your price", in_som: "in sum", in_usd: "in USD", in_yuan: "in yuan",
    unitLabel: (u) => "unit: " + u,
    kLastPrice: "Last price", kLastTime: "Last time", invNoX: (no) => "invoice No. " + no, kTotalBought: "Total bought",
    kReturned: "Returned", inDebt: "counted in your debt", noReturns: "no returns",
    allPurchases: "All purchases of this item", thInvoice: "Invoice", refundMark: "return",
    histNote: "Only invoices issued to you are shown. Orders without a price and cancelled orders are not purchases; returns are marked.",
    repeatX: (q) => "Reorder: " + q, noStockAsk: "Out of stock right now — you can ask the manager.", ask: "Ask",
    orderProduct: "Order item", repeatOrderNo: (no) => `Reorder No. ${no}`,
    checkQty: "Check the quantities. The manager will confirm prices for the new order, as with any order on the site.",
    lastTime: (q) => "last time " + q, less: "Less", moreQ: "More", qty: "Quantity",
    sendOrder: "Send order", sending: "Sending…", noneInStock: "These items are out of stock right now.",
    enterQty: "Enter a quantity", orderSent: "Order sent. The manager will confirm the prices.", orderFail: "Could not send the order",
    pdfFail: "Could not download the PDF", xlsSaved: "Excel file saved", csvSaved: "File saved — opens in Excel",
    priceRequested: "Price request sent to the manager", sendFail: "Could not send",
    csvHead: ["Date", "Invoice", "Item", "SKU", "Quantity", "Unit", "Unit price", "Currency", "Total", "Type"],
    purchase: "Purchase", csvName: "purchase-history",
  },
};

// т("ключ", ...аргументы) — текст на текущем языке
export function т(k, ...a) {
  const v = (СЛ[L] && СЛ[L][k] !== undefined) ? СЛ[L][k] : СЛ.ru[k];
  if (v === undefined) return k;
  return typeof v === "function" ? v(...a) : v;
}
// для проверки: ключи, которых нет в узбекском или английском
export const недостающие = () => ["uz", "en"].flatMap(l => Object.keys(СЛ.ru).filter(k => !(k in СЛ[l])).map(k => l + ":" + k));
