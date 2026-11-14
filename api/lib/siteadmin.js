// Проверка, что запрос пришёл от администратора сайта (site JWT с админ-телефоном)
import { getValidClient } from "./clientauth.js";

// Основной админ-номер + старый (на время перехода, чтобы не потерять доступ). Сравниваем по 9 цифрам (normPhone).
export const ADMIN_PHONE = "974090119";
export const ADMIN_PHONES = ["974090119", "837138321"];
export function isAdminPhone(phone) { return ADMIN_PHONES.includes(String(phone || "")); }

// Асинхронная: токен проверяется по базе (аккаунт жив, пароль не менялся),
// а админ-номер берётся из базы — сменил пароль, и старые входы в панель закрыты.
export async function getSiteAdmin(req) {
  const payload = await getValidClient(req);
  if (!payload) return null;
  if (!isAdminPhone(payload.phone_db || payload.phone)) return null;
  return payload;
}
