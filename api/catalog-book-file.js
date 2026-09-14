// ========================================================================
//  GET /api/catalog-book-file?t=… — скачать собранный печатный каталог.
//
//  Пропуск выдаёт /api/admin/catalog-book вошедшему владельцу, на один файл
//  и на полчаса. Докачка поддерживается: файл большой, мобильный интернет
//  рвётся.
// ========================================================================
import { existsSync } from "fs";
import { join } from "path";
import { отдать, проверитьПропуск } from "./lib/videocache.js";
import { ПАПКА_КНИГ, имяДопустимо } from "./lib/catalogbook-job.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).json({ error: "Method not allowed" });

  const что = проверитьПропуск(req.query && req.query.t);
  const имя = что && что.startsWith("catalog:") ? что.slice("catalog:".length) : "";
  // пропуск на ролик сюда не подходит, и наоборот
  if (!имяДопустимо(имя)) return res.status(403).json({ error: "Ссылка устарела — откройте «Каталог» в складе заново" });

  const файл = join(ПАПКА_КНИГ, имя);
  if (!existsSync(файл)) return res.status(404).json({ error: "Каталог ещё не собран" });

  res.setHeader("Content-Disposition", `attachment; filename="${имя}"`);
  return отдать(req, res, файл, "application/pdf");
}
