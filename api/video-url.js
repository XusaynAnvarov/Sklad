// GET /api/video-url?id=… — временная ссылка на видео для ВОШЕДШЕГО клиента.
// Ссылка живёт 10 минут → переслать бесполезно. Бакет остаётся приватным.
//
// Ведёт она теперь на НАШ сервер (/api/video), а не в Supabase. Раньше
// каждый просмотр качал ролик прямо оттуда, и это главный расход трафика
// — из-за него организация вышла за бесплатную квоту. Сервер скачивает
// ролик один раз и дальше раздаёт с диска.
import { getValidClient } from "./lib/clientauth.js";
import { sget } from "./lib/supa.js";
import { выписатьПропуск } from "./lib/videocache.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const client = await getValidClient(req);
  if (!client) return res.status(401).json({ error: "Не авторизован" });
  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: "id required" });
  try {
    // проверяем, что такой ролик вообще есть — иначе выдадим пропуск в никуда
    const rows = await sget(`videos?id=eq.${encodeURIComponent(id)}&select=path`);
    if (!rows[0]?.path) return res.status(404).json({ error: "Видео не найдено" });

    // Пропуск только на этот ролик и только на 10 минут. Токен сессии в
    // адрес не кладём: он осел бы в логах сервера и в истории браузера.
    const пропуск = выписатьПропуск(id, 600);
    return res.status(200).json({ url: `/api/video?t=${encodeURIComponent(пропуск)}` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
