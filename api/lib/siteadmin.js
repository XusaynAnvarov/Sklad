// Проверка, что запрос пришёл от администратора сайта (site JWT с phone=837138321)
import { getClient } from "./clientauth.js";

export const ADMIN_PHONE = "837138321";

export function getSiteAdmin(req) {
  const payload = getClient(req);
  if (!payload) return null;
  if (payload.phone !== ADMIN_PHONE) return null;
  return payload;
}
