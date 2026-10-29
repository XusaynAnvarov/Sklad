# Graph Report - VIBE KODING  (2026-10-29)

## Corpus Check
- 251 files · ~216,243 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: .ttf 4, .css 4, (none) 2)

## Summary
- 2081 nodes · 4264 edges · 148 communities (111 shown, 37 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 87 edges (avg confidence: 0.86)
- Token cost: 5,470 input · 2,550 output

## Community Hubs (Navigation)
- Catalog PDF Book
- Telegram Bot API
- Site Frontend API
- Admin Catalog & QR
- Brand Intro Animation
- App Shell & Navigation
- Invoice PDF Generation
- Customer Order Flow
- Catalog PDF Export
- Public Catalog UI
- Client Invoice Screens
- Admin Client Management
- Client Cabinet & Profile
- Admin Sales Pages
- Authentication Flow
- Database Layer
- User Auth & Passwords
- Telegram Bot API
- Data Import
- Customer Management
- Module Group 20
- Admin & Telegram Bot
- Module Group 22
- Module Group 23
- Module Group 24
- UI Utilities
- Product Management
- Data Import
- Module Group 28
- Reports & Dashboard
- Module Group 30
- Catalog PDF Book
- Module Group 32
- Module Group 33
- Module Group 34
- Warehouse Screens
- Module Group 36
- Admin Catalog & QR
- Module Group 38
- Brand Intro Animation
- Module Group 40
- Catalog PDF Book
- Purchases & Arrivals
- UI Utilities
- Module Group 44
- Module Group 45
- Stock Operations
- Supplier Orders
- Telegram Integration
- Module Group 49
- Module Group 50
- Warehouse Screens
- Warehouse Screens
- Module Group 53
- Module Group 54
- Module Group 55
- Image Processing
- Admin Client Management
- Module Group 58
- Module Group 59
- Brand Assets
- Styles & Theme
- Module Group 62
- Module Group 63
- Module Group 64
- UI Utilities
- Module Group 66
- Module Group 67
- Warehouse Screens
- Admin Sales Pages
- Module Group 70
- Module Group 71
- Module Group 72
- Module Group 73
- Warehouse Screens
- Module Group 75
- UI Utilities
- Image Processing
- Admin Sales Pages
- Module Group 79
- Warehouse Screens
- Warehouse Screens
- Module Group 82
- Module Group 83
- Module Group 84
- Module Group 85
- Purchases & Arrivals
- Module Group 87
- Module Group 88
- Module Group 89
- Module Group 90
- Reports & Dashboard
- Module Group 92
- Module Group 93
- Warehouse Screens
- Module Group 95
- Module Group 96
- Purchases & Arrivals
- Module Group 98
- Brand Assets
- UI Utilities
- Module Group 101
- Customer Order Flow
- Stock Operations
- Warehouse Screens
- Module Group 105
- Image Processing
- Module Group 107
- UI Utilities
- Module Group 109
- Photo Management
- Module Group 111
- Module Group 112
- Product Videos
- Module Group 114
- Module Group 115
- Module Group 116
- Brand Assets
- Brand Assets
- Customer Order Flow
- Module Group 120
- Module Group 121
- Module Group 122
- Module Group 123
- Module Group 124
- Module Group 125
- Module Group 126
- Module Group 127
- Module Group 128
- Module Group 129
- Module Group 130
- Module Group 131
- Module Group 132
- Module Group 133
- Module Group 134
- Express Server
- Module Group 137
- Brand Assets
- Admin & Telegram Bot
- Brand Assets
- Brand Assets
- Brand Assets
- Brand Assets
- Brand Assets
- Brand Assets

## God Nodes (most connected - your core abstractions)
1. `sget()` - 115 edges
2. `handler()` - 44 edges
3. `getUser()` - 40 edges
4. `spatch()` - 29 edges
5. `tg()` - 28 edges
6. `getSiteAdmin()` - 23 edges
7. `$$` - 23 edges
8. `supsert()` - 21 edges
9. `okId()` - 18 edges
10. `mkEl()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `рисовать()` --indirect_call--> `все()`  [INFERRED]
  js/order/screens/invoices.js → _tools/diag-batches.mjs
- `api/bot.js Telegram Webhook Handler` --conceptually_related_to--> `Telegram Bot & Messaging (@generalmodernbot)`  [INFERRED]
  brand/BOTFATHER.md → SETUP.md
- `посчитать()` --calls--> `раздатьКоды()`  [EXTRACTED]
  api/admin/catalog-codes.js → js/catalogcode.js
- `посчитать()` --calls--> `таблицаПоТоварам()`  [EXTRACTED]
  api/admin/catalog-codes.js → js/catalogcode.js
- `Database Migration to Local PostgreSQL` --conceptually_related_to--> `Recovery & Disaster Guide (ВОССТАНОВЛЕНИЕ.md)`  [INFERRED]
  db/ПЕРЕХОД-НА-СВОЮ-БАЗУ.md → ВОССТАНОВЛЕНИЕ.md

## Import Cycles
- None detected.

## Communities (148 total, 37 thin omitted)

### Community 0 - "Catalog PDF Book"
Cohesion: 0.05
Nodes (75): H, qr(), W, вводная(), водянойЗнак(), заголовокСтраницы(), задняя(), заметки() (+67 more)

### Community 1 - "Telegram Bot API"
Cohesion: 0.08
Nodes (70): adminActAll(), adminActs(), adminClientCard(), adminClients(), adminDebts(), adminGuideMenu(), adminKb, adminMenu() (+62 more)

### Community 2 - "Site Frontend API"
Cohesion: 0.06
Nodes (54): ./api.js?v=20261029b, api, getToken(), isLoggedIn(), req(), ADMIN_PHONES, boot(), rebuild() (+46 more)

### Community 3 - "Admin Catalog & QR"
Cohesion: 0.08
Nodes (52): handler(), sbGet(), заголовки(), записать(), поток(), нетКолонки(), посчитать(), handler() (+44 more)

### Community 4 - "Brand Intro Animation"
Cohesion: 0.06
Nodes (55): cl(), DELAY, ease(), frameSVG(), fs, gif, { GIFEncoder, quantize, applyPalette }, out (+47 more)

### Community 5 - "App Shell & Navigation"
Cohesion: 0.05
Nodes (30): boot(), buildShell(), labelTableCells(), NAV, root, route(), неЖдатьДольше(), ensureAccess() (+22 more)

### Community 6 - "Invoice PDF Generation"
Cohesion: 0.09
Nodes (31): eid(), handler(), handler(), handler(), getClient(), allocatePayments(), invoiceCoverageStatus(), invoiceDebtSummary() (+23 more)

### Community 7 - "Customer Order Flow"
Cohesion: 0.12
Nodes (6): МЕТКА, СОСТОЯНИЕ, CURS, CURS, ЖДУТ, CURS

### Community 8 - "Catalog PDF Export"
Cohesion: 0.10
Nodes (38): ./catalog-pdf.js?v=20261029b, downloadCatalogPDF(), ellipsize(), imgToJpeg(), libs(), curLabel(), exportAllSales(), exportClientInvoiceExcel() (+30 more)

### Community 9 - "Public Catalog UI"
Cohesion: 0.09
Nodes (35): buildCard(), buildEmpty(), buildSkeleton(), catState, mkEl(), openGallery(), go(), show() (+27 more)

### Community 10 - "Client Invoice Screens"
Cohesion: 0.08
Nodes (31): render(), рисовать(), строка(), ВАЛЮТЫ, дата(), естьДолг(), МЕСЯЦ, СЛОВА (+23 more)

### Community 11 - "Admin Client Management"
Cohesion: 0.13
Nodes (20): handler(), handler(), ALLOWED, handler(), handler(), CURS, handler(), cleanPhone() (+12 more)

### Community 12 - "Client Cabinet & Profile"
Cohesion: 0.16
Nodes (31): byCurStr(), CUR_NAME, CURRENCIES, CURS, DEBT_LABEL, el(), emptyState(), escHtml() (+23 more)

### Community 13 - "Admin Sales Pages"
Cohesion: 0.10
Nodes (13): ЯЗЫК_КНИГИ, deleteSale(), readFresh(), render(), resend(), save(), verifyStock(), writeStock() (+5 more)

### Community 14 - "Authentication Flow"
Cohesion: 0.17
Nodes (29): buildAuthModal(), buildLogin(), buildRegister(), buildSide(), buildVerify(), showPassword(), render(), renderПлавно() (+21 more)

### Community 15 - "Database Layer"
Cohesion: 0.11
Nodes (24): adminGet(), adminGetMany(), adminHeaders(), adminPost(), adminToken(), compressToDataUrl(), db, DB_MODE (+16 more)

### Community 16 - "User Auth & Passwords"
Cohesion: 0.21
Nodes (21): handler(), handler(), handler(), handler(), handler(), handler(), handler(), b64url() (+13 more)

### Community 17 - "Telegram Bot API"
Cohesion: 0.13
Nodes (28): Admin Panel (admin.html), api/bot.js Telegram Webhook Handler, brand/bot-avatar.png Bot Avatar (512x512), Dark Navy UI Theme, brand/bot-intro.gif Bot Intro Animation, Telegram Bot Onboarding Flow, Bot Setup Guide (brand/BOTFATHER.md), Product Catalog Page (catalog.html) (+20 more)

### Community 18 - "Data Import"
Cohesion: 0.09
Nodes (23): APP_RATES, arrivedNI, backup, cById, curMap, customers, debt, fs (+15 more)

### Community 19 - "Customer Management"
Cohesion: 0.14
Nodes (19): buildItemsTable(), curStr(), isPaid(), linkTelegram(), openActSverki(), openForm(), renderPhones(), openPayment() (+11 more)

### Community 20 - "Module Group 20"
Cohesion: 0.08
Nodes (25): activation_command, activation_command_timeout, added_modes, agent_interface, default_modes, encoding, excluded_apis, excluded_tools (+17 more)

### Community 21 - "Admin & Telegram Bot"
Cohesion: 0.15
Nodes (14): handler(), handler(), handler(), handler(), getUser(), verifyOurJWT(), handler(), sleep() (+6 more)

### Community 22 - "Module Group 22"
Cohesion: 0.19
Nodes (20): handler(), handler(), eid(), владелецЗаказа(), ЖДЁТ_ОТВЕТА, ЖДЁТ_ЦЕНЫ, заказыКлиента(), найтиКлиента() (+12 more)

### Community 23 - "Module Group 23"
Cohesion: 0.21
Nodes (23): apToast(), esc(), fmtDate(), fmtDebt(), hasDebt(), mkEl(), renderAdminPanel(), confirmDelete() (+15 more)

### Community 24 - "Module Group 24"
Cohesion: 0.18
Nodes (18): handler(), ключ(), описание(), ПОТОЛОК, слить(), число(), sinsert(), safeEq() (+10 more)

### Community 25 - "UI Utilities"
Cohesion: 0.13
Nodes (11): buildAdvice(), LOW_STOCK, stockCostUSD(), stockOf(), render(), usd(), isQuick(), render() (+3 more)

### Community 26 - "Product Management"
Cohesion: 0.15
Nodes (17): batchesView(), costLine(), freshness(), loadProductHistory(), openForm(), renderThumbs(), placeholder(), render() (+9 more)

### Community 27 - "Data Import"
Cohesion: 0.10
Nodes (18): arrivedByProd, curMap, customers, fs, H, html, insertReturn(), lastCostCNY (+10 more)

### Community 28 - "Module Group 28"
Cohesion: 0.13
Nodes (16): добавить(), количество(), корзина, оставитьТолько(), очистить(), позиции(), поставить(), слушатели (+8 more)

### Community 29 - "Reports & Dashboard"
Cohesion: 0.17
Nodes (21): ackAllCost(), costAck(), costWarnModal(), CUR_IN, db_mode(), paymentsModal(), productListModal(), readPct() (+13 more)

### Community 30 - "Module Group 30"
Cohesion: 0.10
Nodes (20): runs-on, steps, SUPABASE_SERVICE_KEY, SUPABASE_URL, jobs, deploy, name, on (+12 more)

### Community 31 - "Catalog PDF Book"
Cohesion: 0.19
Nodes (16): всеТовары(), снимокДляПечати(), ориентацияJpeg(), handler(), SB_URL, адресаSupabase(), имяФайла(), КОРЕНЬ (+8 more)

### Community 32 - "Module Group 32"
Cohesion: 0.19
Nodes (16): handler(), SUPA_URL, имяФайла(), КОРЕНЬ, отдать(), ПАПКА, подпись(), положитьНаДиск() (+8 more)

### Community 33 - "Module Group 33"
Cohesion: 0.22
Nodes (16): barChart(), C_GRID, C_LOSS, C_PROFIT, C_REV, C_TEXT, donutChart(), esc() (+8 more)

### Community 34 - "Module Group 34"
Cohesion: 0.20
Nodes (16): boot(), deny(), draw(), go(), isGuest(), root(), SCREENS, shell() (+8 more)

### Community 35 - "Warehouse Screens"
Cohesion: 0.25
Nodes (15): render(), draw(), drawTabs(), открыть(), дата(), сумма(), штук(), applySale() (+7 more)

### Community 36 - "Module Group 36"
Cohesion: 0.12
Nodes (3): КОРЕНЬ, КОРЕНЬ, корень

### Community 37 - "Admin Catalog & QR"
Cohesion: 0.22
Nodes (12): handler(), состояние(), готовыеКниги(), запустить(), имяДопустимо(), имяКниги(), КОРЕНЬ, ПАПКА_КНИГ (+4 more)

### Community 38 - "Module Group 38"
Cohesion: 0.12
Nodes (9): CREDS_FILE, __dir, handler(), readCreds(), E, URL_БАЗЫ, беды, все() (+1 more)

### Community 39 - "Brand Intro Animation"
Cohesion: 0.12
Nodes (11): fs, path, { Resvg }, ROOT, svg, targets, fs, H (+3 more)

### Community 40 - "Module Group 40"
Cohesion: 0.21
Nodes (11): coverageMap(), CURS, debtByCur(), EPS, isIssued(), issuedOnly(), NOT_ISSUED, openingDebt() (+3 more)

### Community 41 - "Catalog PDF Book"
Cohesion: 0.13
Nodes (10): b64(), r1, r2, голова, з, книги, корень, папка (+2 more)

### Community 42 - "Purchases & Arrivals"
Cohesion: 0.25
Nodes (14): arrive(), notifyClientsNewProducts(), openEditor(), addToCart(), drawItems(), importFromExcel(), recalc(), refreshAdd() (+6 more)

### Community 43 - "UI Utilities"
Cohesion: 0.18
Nodes (12): buildPeriodOptions(), monthKey(), monthLabel(), MONTHS, MONTHS_SHORT, monthsWithData(), nextSeason(), periodLabel() (+4 more)

### Community 44 - "Module Group 44"
Cohesion: 0.23
Nodes (12): aggregate(), DEFAULT_RULES, itemCogsUSD(), itemProfitUSD(), itemRealProfitUSD(), itemRevenueUSD(), KIND_LABEL, loadRules() (+4 more)

### Community 45 - "Module Group 45"
Cohesion: 0.18
Nodes (11): КОРЗИНЫ, мб(), новая, перенести(), перечислить(), покорзине(), сбои, старая (+3 more)

### Community 46 - "Stock Operations"
Cohesion: 0.24
Nodes (12): взятьОбход(), взятьЧерновик(), знак(), пересчётПоExcel(), нарисоватьСводку(), нарисоватьСписок(), применить(), хвост() (+4 more)

### Community 47 - "Supplier Orders"
Cohesion: 0.24
Nodes (11): render(), addProduct(), addToCart(), defCost(), drawItems(), drawOOS(), importFromExcel(), recalc() (+3 more)

### Community 48 - "Telegram Integration"
Cohesion: 0.30
Nodes (13): call(), logoutClientFromBot(), notifyClient(), notifyOwner(), requestOrderConfirm(), requireChannel(), sendActToChannel(), sendActToClient() (+5 more)

### Community 49 - "Module Group 49"
Cohesion: 0.26
Nodes (12): вЕдинице(), единица(), ЕДИНИЦЫ, коротко(), множитель(), объяснение(), перевести(), ПО_ЗНАЧЕНИЮ (+4 more)

### Community 50 - "Module Group 50"
Cohesion: 0.29
Nodes (11): boot(), ctx, ВКЛАДКИ, загрузка(), идти(), каркас(), корень(), нарисовать() (+3 more)

### Community 51 - "Warehouse Screens"
Cohesion: 0.29
Nodes (13): field(), inp(), render(), askStock(), chunk(), draw(), openEdit(), drawФото() (+5 more)

### Community 52 - "Warehouse Screens"
Cohesion: 0.31
Nodes (13): render(), askStock(), drawCart(), drawCur(), drawMode(), drawWho(), openCard(), repriceCart() (+5 more)

### Community 53 - "Module Group 53"
Cohesion: 0.24
Nodes (11): E, URL_БАЗЫ, всеТовары(), главное(), дата(), ЗАГОЛОВКИ, КОРЕНЬ, пересобрать() (+3 more)

### Community 54 - "Module Group 54"
Cohesion: 0.19
Nodes (11): env, H, SB_KEY, SB_URL, бассейн, главное(), записать(), значение() (+3 more)

### Community 55 - "Module Group 55"
Cohesion: 0.17
Nodes (8): всеФайлы(), исходный, код, корень, общие, проблемы, толькоКод(), файлы

### Community 56 - "Image Processing"
Cohesion: 0.17
Nodes (3): app, __dirname, routes

### Community 57 - "Admin Client Management"
Cohesion: 0.39
Nodes (8): handler(), handler(), handler(), genVerifToken(), H, sdelete(), supsert(), устарело()

### Community 58 - "Module Group 58"
Cohesion: 0.21
Nodes (7): convert(), CUR, curStr(), fmt(), fromUSD(), rates, toUSD()

### Community 59 - "Module Group 59"
Cohesion: 0.26
Nodes (8): applySales(), markChecked(), openStockFix(), draw(), unappliedSales(), findProblems(), isUnapplied(), списанаПозиция()

### Community 60 - "Brand Assets"
Cohesion: 0.24
Nodes (11): Ring Draw Animation, GM Letters Fade-In Animation, Badge Pop-In Animation, Shimmer Sweep Animation, GM Animated Logo Badge, GeneralModern Brand Identity System, Navy Background Gradient, Gold Gradient (+3 more)

### Community 61 - "Styles & Theme"
Cohesion: 0.29
Nodes (8): applyTheme(), currentTheme(), initStarfield(), resize(), spawn(), initTheme(), makeThemeToggle(), toggleTheme()

### Community 62 - "Module Group 62"
Cohesion: 0.31
Nodes (8): consumeFIFO(), costAfter(), currentCost(), r2(), returnToStock(), sumQty(), погасить(), сверитьСОстатком()

### Community 63 - "Module Group 63"
Cohesion: 0.44
Nodes (11): render(), ответить(), отменить(), перечитать(), подробно(), правка(), рисовать(), списком() (+3 more)

### Community 64 - "Module Group 64"
Cohesion: 0.20
Nodes (6): BY_VALUE, isShop(), KIND_SHOP, KIND_SUPPLIER, KINDS, purchaseKind()

### Community 65 - "UI Utilities"
Cohesion: 0.42
Nodes (11): mkEl(), renderOrder(), buildCard(), reBadges(), orderCount(), render(), renderList(), refreshGrid() (+3 more)

### Community 66 - "Module Group 66"
Cohesion: 0.31
Nodes (7): canScan(), clean(), findByScan(), resolveScan(), scanSku(), TG(), tight()

### Community 67 - "Module Group 67"
Cohesion: 0.29
Nodes (7): r2(), ВОЗВРАТ, ВЫПЛАТА, выплаты(), подписьВозврата(), покупки(), составить()

### Community 68 - "Warehouse Screens"
Cohesion: 0.36
Nodes (10): render(), draw(), пересчитатьОстаток(), пересчитатьЦену(), приход(), провести(), раздел(), строка() (+2 more)

### Community 69 - "Admin Sales Pages"
Cohesion: 0.31
Nodes (9): render(), блокКниги(), нарисовать(), блокКодов(), нарисовать(), render(), card(), draw() (+1 more)

### Community 70 - "Module Group 70"
Cohesion: 0.33
Nodes (6): знак(), историяОстатков(), загрузить(), исправить(), нарисовать(), когда()

### Community 71 - "Module Group 71"
Cohesion: 0.25
Nodes (5): BY_VALUE, byMethod(), DEFAULT_METHOD, isKnownMethod(), PAY_METHODS

### Community 72 - "Module Group 72"
Cohesion: 0.31
Nodes (5): byDateDesc(), collect(), freshFirst(), lastAnyMap(), lastForCustomerMap()

### Community 73 - "Module Group 73"
Cohesion: 0.33
Nodes (5): buildItems(), issueInvoice(), splitCogs(), totalsByCur(), uid()

### Community 74 - "Warehouse Screens"
Cohesion: 0.50
Nodes (9): dt(), render(), draw(), drawTabs(), openPay(), openSale(), drawItems(), освежить() (+1 more)

### Community 75 - "Module Group 75"
Cohesion: 0.39
Nodes (8): Debt Payment Status (В ДОЛГ), General Modern (Company), Invoice EST123, Product in Dollars (Товар в долларах), Product in Sums (Товар в сумах), Product in Yuan (Товар в юанях), Multi-currency Total (500 000 сум + $40 + ¥150), Test Client (Тест Клиент)

### Community 76 - "UI Utilities"
Cohesion: 0.43
Nodes (7): buildSummary(), curLine(), dayRange(), formatMessage(), handler(), money(), SIGN

### Community 77 - "Image Processing"
Cohesion: 0.43
Nodes (7): full(), thumb(), thumbAttrs(), ближайшаяШирина(), поставитьСнимок(), путьХранилища(), ШИРИНЫ

### Community 78 - "Admin Sales Pages"
Cohesion: 0.50
Nodes (8): openEditor(), addToCart(), drawCart(), importFromExcel(), loadLastPrices(), recalc(), refreshAdd(), sendForConfirm()

### Community 79 - "Module Group 79"
Cohesion: 0.32
Nodes (6): render(), doSend(), drawRules(), dumpTable(), exportData(), sendGuide()

### Community 80 - "Warehouse Screens"
Cohesion: 0.39
Nodes (6): render(), кнопкаКопии(), кнопкаСсылки(), показатьИтог(), показатьСсылку(), РАЗДЕЛЫ

### Community 81 - "Warehouse Screens"
Cohesion: 0.46
Nodes (7): render(), draw(), открыть(), содержимое(), имя(), когда(), ТИП

### Community 83 - "Module Group 83"
Cohesion: 0.25
Nodes (6): HTML, idx, jsFiles(), ROOT, sw, VER

### Community 84 - "Module Group 84"
Cohesion: 0.38
Nodes (5): CREDS_FILE, __dir, handler(), readCreds(), signJWT()

### Community 85 - "Module Group 85"
Cohesion: 0.29
Nodes (5): dataRaw, db, fs, html, photosRaw

### Community 86 - "Purchases & Arrivals"
Cohesion: 0.48
Nodes (5): applyArrival(), arrivalRows(), r2(), записатьПачкой(), зачислить()

### Community 87 - "Module Group 87"
Cohesion: 0.43
Nodes (6): дваЗнака(), имяФайла(), пересчитать(), скачать(), собрать(), ТАБЛИЦЫ

### Community 88 - "Module Group 88"
Cohesion: 0.43
Nodes (6): applyI18n(), D, getLang(), makeLangSwitcher(), PH, setLang()

### Community 89 - "Module Group 89"
Cohesion: 0.52
Nodes (5): TG(), мои(), отправитьКорзину(), подпись(), послать()

### Community 90 - "Module Group 90"
Cohesion: 0.52
Nodes (7): openRefund(), нарисовать(), обновитьИтог(), собратьПозиции(), списокПокупок(), формаСуммой(), r2()

### Community 91 - "Reports & Dashboard"
Cohesion: 0.52
Nodes (7): render(), adviceModal(), chartBox(), draw(), repeatModal(), table(), usd()

### Community 92 - "Module Group 92"
Cohesion: 0.52
Nodes (7): apiFetch(), render(), load(), mkTab(), renderBlocked(), renderClients(), renderTab()

### Community 93 - "Module Group 93"
Cohesion: 0.48
Nodes (5): esc(), invoiceHtml(), money(), SIGN, totalsStr()

### Community 94 - "Warehouse Screens"
Cohesion: 0.67
Nodes (7): curStr(), render(), draw(), openCard(), openEditClient(), openPayment(), uid()

### Community 95 - "Module Group 95"
Cohesion: 0.57
Nodes (5): ключИмени(), ключКода(), сверитьЛист(), число(), чисто()

### Community 96 - "Module Group 96"
Cohesion: 0.43
Nodes (5): r2(), вДороге(), дорожеСейчас(), едетВместоНет(), картаДороги()

### Community 99 - "Brand Assets"
Cohesion: 0.53
Nodes (6): Rounded Rectangle Navy Background, GM Serif Monogram Text, Metallic Gold Gradient (#f7e9a6 to #a87b1f), GM Brand Logo, Dark Navy Blue Gradient (#22324f to #141f33), Decorative Dashed Orbital Ring Arcs

### Community 100 - "UI Utilities"
Cohesion: 0.40
Nodes (6): Uzbek User Guide (Animated GIF), GENERAL MODERN Brand Header, Kirish (Login) Button, User Login Flow (Uzbek Guide), Public Product Catalog Screen, Step 1: Open generalmodern.uz Website

### Community 101 - "Module Group 101"
Cohesion: 0.40
Nodes (3): ВАЛЮТЫ, костСтрока(), костЧисло()

### Community 102 - "Customer Order Flow"
Cohesion: 0.53
Nodes (5): render(), карточка(), отобранные(), рисовать(), категория()

### Community 104 - "Warehouse Screens"
Cohesion: 0.60
Nodes (6): render(), drawCart(), openCard(), scanLoop(), search(), uid()

### Community 108 - "UI Utilities"
Cohesion: 0.60
Nodes (5): GENERAL MODERN Brand Header, generalmodern.uz Website, User Login Flow (9 Steps), Step 1: Open Site and Click Login, Russian User Guide Animated GIF

### Community 109 - "Module Group 109"
Cohesion: 0.90
Nodes (4): isDesktop(), TG(), кнопкаРазвернуть(), умеетВесьЭкран()

### Community 111 - "Module Group 111"
Cohesion: 0.70
Nodes (4): наПодтверждение(), отправитьНакладную(), чатКлиента(), чистые()

### Community 112 - "Module Group 112"
Cohesion: 0.70
Nodes (4): ENTITY_RU, labelOf(), renderTrash(), viewItem()

### Community 113 - "Product Videos"
Cohesion: 0.60
Nodes (5): render(), выборТовара(), загрузить(), правка(), дата()

### Community 117 - "Brand Assets"
Cohesion: 0.50
Nodes (4): Brand Identity — General Modern (GM), Design Token — Gold Accent Color, Design Token — Deep Navy Background Color, GM PWA App Icon (512x512)

### Community 118 - "Brand Assets"
Cohesion: 0.67
Nodes (3): icon(), iconSvg(), P

### Community 119 - "Customer Order Flow"
Cohesion: 0.83
Nodes (4): render(), подтвердить(), рисовать(), дата()

### Community 120 - "Module Group 120"
Cohesion: 0.83
Nodes (3): версияНаСервере(), мояВерсия(), обновитьЕслиУстарело()

### Community 129 - "Module Group 129"
Cohesion: 1.00
Nodes (3): render(), renderList(), renderTabs()

## Knowledge Gaps
- **28 isolated node(s):** `Vercel Hosting`, `js/app.js Admin Application Module`, `js/catalog.js Catalog Module`, `js/site/app.js Public Site Module`, `js/order/app.js Order Module` (+23 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 617 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `рисовать()` connect `Client Invoice Screens` to `Module Group 38`?**
  _High betweenness centrality (0.141) - this node is a cross-community bridge._
- **What connects `Vercel Hosting`, `js/app.js Admin Application Module`, `js/catalog.js Catalog Module` to the rest of the system?**
  _28 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Catalog PDF Book` be split into smaller, more focused modules?**
  _Cohesion score 0.0515406162464986 - nodes in this community are weakly interconnected._
- **Why does `все()` connect `Module Group 38` to `Client Invoice Screens`?**
  _High betweenness centrality (0.141) - this node is a cross-community bridge._
- **Should `Telegram Bot API` be split into smaller, more focused modules?**
  _Cohesion score 0.0782472613458529 - nodes in this community are weakly interconnected._
- **Should `Site Frontend API` be split into smaller, more focused modules?**
  _Cohesion score 0.05641025641025641 - nodes in this community are weakly interconnected._
- **Should `Admin Catalog & QR` be split into smaller, more focused modules?**
  _Cohesion score 0.08461131676361713 - nodes in this community are weakly interconnected._