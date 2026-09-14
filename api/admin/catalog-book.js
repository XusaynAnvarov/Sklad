// ========================================================================
//  ПЕЧАТНЫЙ КАТАЛОГ: запуск сборки и её ход.
//
//  POST /api/admin/catalog-book  { язык: "ru"|"uz"|"en", образец: bool }
//  GET  /api/admin/catalog-book  → { задача, книги: [{ имя, язык, образец, байт, собрана, ссылка }] }
//
//  Ссылка на скачивание — с коротким пропуском (/api/catalog-book-file?t=…):
//  браузер скачивает файл обычной ссылкой и заголовок авторизации туда не
//  передаст, а класть в адрес токен сессии нельзя — он осядет в логах.
// ========================================================================
import { getUser } from "../lib/auth.js";
import { выписатьПропуск } from "../lib/videocache.js";
import { запустить, готовыеКниги, текущаяЗадача } from "../lib/catalogbook-job.js";

const ПРОПУСК_СЕКУНД = 30 * 60;

function состояние() {
  return {
    задача: текущаяЗадача(),
    книги: готовыеКниги().map((к) => ({
      ...к,
      ссылка: "/api/catalog-book-file?t=" + encodeURIComponent(выписатьПропуск("catalog:" + к.имя, ПРОПУСК_СЕКУНД)),
    })),
  };
}

export default async function handler(req, res) {
  const user = await getUser(req);
  if (!user) return res.status(401).json({ error: "Не авторизован" });

  if (req.method === "GET") return res.json(состояние());

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") try { body = JSON.parse(body); } catch { body = {}; }
    const r = запустить({ язык: body && body.язык, образец: !!(body && body.образец) });
    if (r.ошибка) return res.status(400).json({ error: r.ошибка });
    if (r.занято) return res.status(409).json({ error: "Каталог уже собирается — дождитесь конца", ...состояние() });
    return res.json(состояние());
  }

  return res.status(405).json({ error: "Method not allowed" });
}
