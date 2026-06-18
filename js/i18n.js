// ========================================================================
//  МНОГОЯЗЫЧНОСТЬ (RU / UZ / EN)
//  Переводим интерфейс автоматически: после рендера проходим по тексту
//  и заменяем известные фразы. Данные (товары/имена) не трогаем.
// ========================================================================

const LANG_KEY = "sklad_lang";
export function getLang() { return localStorage.getItem(LANG_KEY) || "ru"; }
export function setLang(l) { localStorage.setItem(LANG_KEY, l); }

// словарь: русская фраза -> { uz, en }
const D = {
  // --- навигация / каркас ---
  "Дашборд": { uz: "Boshqaruv", en: "Dashboard" },
  "Товары": { uz: "Mahsulotlar", en: "Products" },
  "Продажи": { uz: "Sotuvlar", en: "Sales" },
  "Приход": { uz: "Kirim", en: "Incoming" },
  "Приход товара": { uz: "Mahsulot kirimi", en: "Incoming goods" },
  "Клиенты": { uz: "Mijozlar", en: "Customers" },
  "Каталог": { uz: "Katalog", en: "Catalog" },
  "Настройки": { uz: "Sozlamalar", en: "Settings" },
  "Мой Склад": { uz: "Mening Omborim", en: "My Warehouse" },
  "Онлайн (Supabase)": { uz: "Onlayn (Supabase)", en: "Online (Supabase)" },
  "Локальный режим": { uz: "Lokal rejim", en: "Local mode" },
  "Тёмная": { uz: "Tungi", en: "Dark" },
  "Светлая": { uz: "Yorug‘", en: "Light" },
  "Выход": { uz: "Chiqish", en: "Log out" },

  // --- вход ---
  "Склад": { uz: "Ombor", en: "Warehouse" },
  "Вход для владельца": { uz: "Egasi uchun kirish", en: "Owner sign-in" },
  "Войти": { uz: "Kirish", en: "Sign in" },
  "Доступ закрыт": { uz: "Kirish yopiq", en: "Access denied" },
  "Эта страница доступна только по личной секретной ссылке.": { uz: "Bu sahifa faqat shaxsiy maxfiy havola orqali ochiladi.", en: "This page is available only via your personal secret link." },
  "Пароль": { uz: "Parol", en: "Password" },
  "Загрузка…": { uz: "Yuklanmoqda…", en: "Loading…" },

  // --- общие кнопки ---
  "Сохранить": { uz: "Saqlash", en: "Save" },
  "Отмена": { uz: "Bekor qilish", en: "Cancel" },
  "Удалить": { uz: "O‘chirish", en: "Delete" },
  "Открыть": { uz: "Ochish", en: "Open" },
  "Копировать": { uz: "Nusxalash", en: "Copy" },
  "Отправить": { uz: "Yuborish", en: "Send" },
  "Подтверждение": { uz: "Tasdiqlash", en: "Confirm" },
  "Да": { uz: "Ha", en: "Yes" },
  "Добавить": { uz: "Qo‘shish", en: "Add" },
  "Добавить товар": { uz: "Mahsulot qo‘shish", en: "Add product" },
  "Добавить клиента": { uz: "Mijoz qo‘shish", en: "Add customer" },
  "Новая накладная": { uz: "Yangi nakladnoy", en: "New invoice" },
  "Новый приход": { uz: "Yangi kirim", en: "New incoming" },
  "Накладная": { uz: "Nakladnoy", en: "Invoice" },
  "Оплата": { uz: "To‘lov", en: "Payment" },

  // --- дашборд ---
  "Сегодня": { uz: "Bugun", en: "Today" },
  "Месяц": { uz: "Oy", en: "Month" },
  "Всё время": { uz: "Barchasi", en: "All time" },
  "Оборот продаж": { uz: "Sotuv aylanmasi", en: "Sales turnover" },
  "Себестоимость проданного": { uz: "Sotilgan tannarxi", en: "Cost of goods sold" },
  "Прибыль": { uz: "Foyda", en: "Profit" },
  "Приход (закупка)": { uz: "Kirim (xarid)", en: "Incoming (purchase)" },
  "Оборот продаж по валютам": { uz: "Sotuv aylanmasi valyutalarda", en: "Sales turnover by currency" },
  "Себестоимость проданного по валютам": { uz: "Sotilgan tannarxi valyutalarda", en: "Cost of sold by currency" },
  "Приход по валютам": { uz: "Kirim valyutalarda", en: "Incoming by currency" },
  "Остаток на складе (себестоимость)": { uz: "Ombordagi qoldiq (tannarx)", en: "Stock value (cost)" },
  "Общий долг клиентов": { uz: "Mijozlar umumiy qarzi", en: "Total customer debt" },
  "Все категории": { uz: "Barcha kategoriyalar", en: "All categories" },
  "В долларах": { uz: "Dollarda", en: "In USD" },
  "В сумах": { uz: "So‘mda", en: "In UZS" },
  "В юанях": { uz: "Yuanda", en: "In CNY" },
  "Сум": { uz: "So‘m", en: "UZS" },
  "Доллар": { uz: "Dollar", en: "USD" },
  "Юань": { uz: "Yuan", en: "CNY" },
  "Единиц на складе": { uz: "Ombordagi dona", en: "Units in stock" },
  "Есть в наличии": { uz: "Mavjud", en: "In stock" },
  "Под заказ": { uz: "Buyurtmaga", en: "On order" },
  "в долларах": { uz: "dollarda", en: "in USD" },

  // --- товары ---
  "Новый товар": { uz: "Yangi mahsulot", en: "New product" },
  "Редактировать товар": { uz: "Mahsulotni tahrirlash", en: "Edit product" },
  "Название": { uz: "Nomi", en: "Name" },
  "Категория": { uz: "Kategoriya", en: "Category" },
  "Остаток и себестоимость": { uz: "Qoldiq va tannarx", en: "Stock & cost" },
  "Остаток": { uz: "Qoldiq", en: "Stock" },
  "Цены продажи": { uz: "Sotuv narxlari", en: "Sale prices" },
  "Статус в каталоге": { uz: "Katalogdagi holat", en: "Catalog status" },
  "Авто (по остатку)": { uz: "Avto (qoldiq bo‘yicha)", en: "Auto (by stock)" },
  "Есть": { uz: "Mavjud", en: "In stock" },
  "Товаров нет": { uz: "Mahsulotlar yo‘q", en: "No products" },

  // --- статусы / бэйджи ---
  "✓ Есть": { uz: "✓ Mavjud", en: "✓ In stock" },
  "⏳ Под заказ": { uz: "⏳ Buyurtmaga", en: "⏳ On order" },
  "🚚 В дороге": { uz: "🚚 Yo‘lda", en: "🚚 In transit" },
  "✓ Пришёл": { uz: "✓ Keldi", en: "✓ Arrived" },
  "✓ Уже пришёл": { uz: "✓ Allaqachon keldi", en: "✓ Already arrived" },
  "Проведена": { uz: "Yakunlangan", en: "Finalized" },
  "Черновик": { uz: "Qoralama", en: "Draft" },
  "✈ Отправлена": { uz: "✈ Yuborilgan", en: "✈ Sent" },
  "Оприходовать": { uz: "Kirim qilish", en: "Receive" },

  // --- продажи / накладные ---
  "Новая накладная": { uz: "Yangi nakladnoy", en: "New invoice" },
  "Накладная": { uz: "Nakladnoy", en: "Invoice" },
  "Клиент": { uz: "Mijoz", en: "Customer" },
  "Валюта накладной": { uz: "Nakladnoy valyutasi", en: "Invoice currency" },
  "— выбрать товар —": { uz: "— mahsulot tanlang —", en: "— select product —" },
  "Кол-во": { uz: "Soni", en: "Qty" },
  "Цена": { uz: "Narx", en: "Price" },
  "Добавьте товары в накладную": { uz: "Nakladnoyga mahsulot qo‘shing", en: "Add products to the invoice" },
  "новый для клиента": { uz: "mijoz uchun yangi", en: "new for customer" },
  "Накладных пока нет": { uz: "Hozircha nakladnoylar yo‘q", en: "No invoices yet" },
  "Сохранить черновик": { uz: "Qoralamani saqlash", en: "Save draft" },
  "Дата": { uz: "Sana", en: "Date" },
  "Валюта": { uz: "Valyuta", en: "Currency" },
  "Позиции": { uz: "Pozitsiyalar", en: "Items" },
  "Сумма": { uz: "Summa", en: "Total" },
  "Статус": { uz: "Holat", en: "Status" },

  // --- приход ---
  "Новый приход": { uz: "Yangi kirim", en: "New incoming" },
  "Поставщик": { uz: "Yetkazib beruvchi", en: "Supplier" },
  "Поступлений пока нет": { uz: "Hozircha kirimlar yo‘q", en: "No incomings yet" },
  "При статусе «Уже пришёл» товары автоматически добавятся на склад.": { uz: "«Allaqachon keldi» holatida mahsulotlar omborga avtomatik qo‘shiladi.", en: "With status “Arrived”, goods are added to stock automatically." },

  // --- клиенты / карточка ---
  "Имя": { uz: "Ism", en: "Name" },
  "Контакт": { uz: "Aloqa", en: "Contact" },
  "Заметка": { uz: "Izoh", en: "Note" },
  "Новый клиент": { uz: "Yangi mijoz", en: "New customer" },
  "Клиентов пока нет": { uz: "Hozircha mijozlar yo‘q", en: "No customers yet" },
  "← К списку": { uz: "← Ro‘yxatga", en: "← Back to list" },
  "✎ Изменить": { uz: "✎ Tahrirlash", en: "✎ Edit" },
  "Оборот": { uz: "Aylanma", en: "Turnover" },
  "Оплачено": { uz: "To‘langan", en: "Paid" },
  "Долг": { uz: "Qarz", en: "Debt" },
  "Последняя оплата": { uz: "Oxirgi to‘lov", en: "Last payment" },
  "клиент должен": { uz: "mijoz qarzdor", en: "customer owes" },
  "нет долга": { uz: "qarz yo‘q", en: "no debt" },
  "переплата (аванс)": { uz: "ortiqcha (avans)", en: "overpaid (advance)" },
  "Накладные клиента": { uz: "Mijoz nakladnoylari", en: "Customer invoices" },
  "История оплат": { uz: "To‘lovlar tarixi", en: "Payment history" },
  "Заказанные товары": { uz: "Buyurtma qilingan mahsulotlar", en: "Ordered products" },
  "Оплат пока нет": { uz: "Hozircha to‘lovlar yo‘q", en: "No payments yet" },
  "Новая оплата": { uz: "Yangi to‘lov", en: "New payment" },
  "Комментарий": { uz: "Izoh", en: "Comment" },
  "нет оплат": { uz: "to‘lovlar yo‘q", en: "no payments" },
  "Накладные": { uz: "Nakladnoylar", en: "Invoices" },
  "Оплата": { uz: "To‘lov", en: "Payment" },
  "✅ Оплачено": { uz: "✅ To‘langan", en: "✅ Paid" },
  "🔴 В долг": { uz: "🔴 Qarzga", en: "🔴 On credit" },
  "Нажмите на накладную, чтобы посмотреть, что заказано в этот день.": { uz: "Bu kuni nima buyurtma qilinganini ko‘rish uchun nakladnoyni bosing.", en: "Click an invoice to see what was ordered that day." },
  "Товар": { uz: "Mahsulot", en: "Product" },

  // --- настройки ---
  "Канал для накладных": { uz: "Nakladnoylar uchun kanal", en: "Channel for invoices" },
  "Сохранить канал": { uz: "Kanalni saqlash", en: "Save channel" },
  "Сохранить курсы": { uz: "Kurslarni saqlash", en: "Save rates" },
  "🌐 Обновить из интернета": { uz: "🌐 Internetdan yangilash", en: "🌐 Update from internet" },
  "🌐 Открыть каталог": { uz: "🌐 Katalogni ochish", en: "🌐 Open catalog" },
  "Публичный каталог (для клиентов)": { uz: "Ommaviy katalog (mijozlar uchun)", en: "Public catalog (for clients)" },
  "Секретная ссылка на админку": { uz: "Admin uchun maxfiy havola", en: "Secret admin link" },
  "Сбросить демо-данные": { uz: "Demo ma’lumotlarni tozalash", en: "Reset demo data" },

  // --- каталог (публичный) ---
  "Каталог товаров": { uz: "Mahsulotlar katalogi", en: "Product catalog" },
  "товаров": { uz: "mahsulotlar", en: "products" },
  "Актуальный ассортимент": { uz: "Dolzarb assortiment", en: "Current assortment" },
  "Выбирайте товары — статус наличия обновляется автоматически. По вопросам заказа свяжитесь с нами.": { uz: "Mahsulotlarni tanlang — mavjudlik holati avtomatik yangilanadi. Buyurtma uchun biz bilan bog‘laning.", en: "Browse products — availability updates automatically. Contact us to order." },
  "Все": { uz: "Hammasi", en: "All" },
  "Все категории": { uz: "Barcha kategoriyalar", en: "All categories" },
  "Есть в наличии": { uz: "Mavjud", en: "In stock" },
  "Под заказ": { uz: "Buyurtmaga", en: "On order" },
  "Ничего не найдено": { uz: "Hech narsa topilmadi", en: "Nothing found" },
  "Загрузка каталога…": { uz: "Katalog yuklanmoqda…", en: "Loading catalog…" },
};

// заменяемые плейсхолдеры
const PH = {
  "Поиск товара…": { uz: "Mahsulot qidirish…", en: "Search product…" },
  "Поиск по каталогу…": { uz: "Katalogdan qidirish…", en: "Search catalog…" },
  "Название": { uz: "Nomi", en: "Name" },
  "Категория": { uz: "Kategoriya", en: "Category" },
  "Имя / магазин": { uz: "Ism / do‘kon", en: "Name / shop" },
  "Телефон / @username": { uz: "Telefon / @username", en: "Phone / @username" },
  "Комментарий (необязательно)": { uz: "Izoh (ixtiyoriy)", en: "Comment (optional)" },
  "Сумма": { uz: "Summa", en: "Amount" },
};

export function applyI18n(root = document.body) {
  const lang = getLang();
  // текстовые узлы
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(n => {
    if (n.__o === undefined) { const t = n.nodeValue.trim(); if (!D[t]) return; n.__o = n.nodeValue; }
    const key = n.__o.trim();
    if (D[key]) n.nodeValue = n.__o.replace(key, lang === "ru" ? key : (D[key][lang] || key));
  });
  // плейсхолдеры
  root.querySelectorAll("[placeholder]").forEach(el => {
    if (el.__po === undefined) { const t = (el.getAttribute("placeholder") || "").trim(); if (!PH[t]) return; el.__po = el.getAttribute("placeholder"); }
    const key = (el.__po || "").trim();
    if (PH[key]) el.setAttribute("placeholder", lang === "ru" ? key : (PH[key][lang] || key));
  });
}

// переключатель языков
export function makeLangSwitcher(onChange) {
  const wrap = document.createElement("div");
  wrap.className = "lang-switch";
  ["ru", "uz", "en"].forEach(l => {
    const b = document.createElement("button");
    b.textContent = l.toUpperCase();
    if (getLang() === l) b.classList.add("active");
    b.onclick = () => { setLang(l); [...wrap.children].forEach(c => c.classList.remove("active")); b.classList.add("active"); onChange?.(); };
    wrap.append(b);
  });
  return wrap;
}
