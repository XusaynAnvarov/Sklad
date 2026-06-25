// Проверка, что запрос пришёл от администратора сайта (site JWT с админ-телефоном)
import { getClient } from "./clientauth.js";

// Основной админ-номер + старый (на время перехода, чтобы не потерять доступ). Сравниваем по 9 цифрам (normPhone).
export const ADMIN_PHONE = "974090119";
export const ADMIN_PHONES = ["974090119", "837138321"];
export function isAdminPhone(phone) { return ADMIN_PHONES.includes(String(phone || "")); }

export function getSiteAdmin(req) {
  const payload = getClient(req);
  if (!payload) return null;
  if (!isAdminPhone(payload.phone)) return null;
  return payload;
}
