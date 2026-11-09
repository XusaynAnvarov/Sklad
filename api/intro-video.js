// ========================================================================
//  GET /api/intro-video?d=desktop|mobile&l=ru|uz|en — вступительный ролик.
//
//  Ролик публичный (его видит каждый новый посетитель), но лежит в
//  приватном бакете Supabase. Сервер скачивает его один раз на диск и
//  раздаёт сам с поддержкой перемотки — как и видео товаров
//  (api/lib/videocache.js), чтобы не тратить трафик Supabase.
// ========================================================================
import { настройки, ЯЗЫКИ, УСТРОЙСТВА } from "./lib/introstore.js";
import { положитьНаДиск, отдать } from "./lib/videocache.js";

const ТИПЫ = { mp4: "video/mp4", webm: "video/webm", m4v: "video/x-m4v", mov: "video/quicktime", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", wav: "audio/wav" };

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).json({ error: "Method not allowed" });
  const устройство = УСТРОЙСТВА.includes(req.query?.d) ? req.query.d : "desktop";
  const язык = ЯЗЫКИ.includes(req.query?.l) ? req.query.l : "ru";
  // d=audio — музыка или озвучка экскурсии
  const v = req.query?.d === "audio" ? (настройки().audio || {}) : (настройки().video?.[устройство] || {});
  const путь = v[язык] || v.all;
  if (!путь) return res.status(404).json({ error: "Ролик не загружен" });
  try {
    const { файл } = await положитьНаДиск(путь);
    const ext = путь.split(".").pop().toLowerCase();
    // адрес меняется с каждой публикацией (&r=), поэтому кэш может быть долгим
    res.setHeader("Cache-Control", "public, max-age=86400");
    return отдать(req, res, файл, ТИПЫ[ext] || "video/mp4");
  } catch (e) {
    console.error("[intro-video]", e.message);
    return res.status(502).json({ error: "Ролик недоступен" });
  }
}
