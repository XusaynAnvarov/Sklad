// Fetch-хелперы для публичного сайта (JWT клиента)
const BASE = "/api";

function getToken() { return localStorage.getItem("gm_client_token"); }
export function saveToken(t) { localStorage.setItem("gm_client_token", t); }
export function clearToken() { localStorage.removeItem("gm_client_token"); }
export function isLoggedIn() { return !!getToken(); }

export async function req(method, path, body) {
  const token = getToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const r = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return null;
  const json = await r.json().catch(() => null);
  if (!r.ok) throw new Error((json && json.error) || r.statusText);
  return json;
}

export const api = {
  // каталог
  catalog: () => req("GET", "/catalog"),

  // верификация и регистрация
  verifyStart: (phone) => req("POST", "/client/verify-start", { phone }),
  verifyStatus: (token) => req("GET", `/client/verify-status?token=${encodeURIComponent(token)}`),
  register: (verif_token, password) => req("POST", "/client/register", { verif_token, password }),
  // вход: шаг 1 — код в Telegram, шаг 2 — код + пароль
  loginStart: (phone) => req("POST", "/client/login-start", { phone }),
  login: (phone, code, password) => req("POST", "/client/login", { phone, code, password }),

  // кабинет
  me: () => req("GET", "/client/me"),
  orders: () => req("GET", "/client/orders"),
  invoices: () => req("GET", "/client/invoices"),
  payments: () => req("GET", "/client/payments"),
  invoicePdfUrl: (id) => BASE + `/client/invoice-pdf?id=${encodeURIComponent(id)}`,

  // профиль
  updateProfile: (data) => req("POST", "/client/update-profile", data),
  changePassword: (current, newPass) => req("POST", "/client/change-password", { current, new: newPass }),

  // заказ
  placeOrder: (items) => req("POST", "/site-order", { items }),

  // Excel в браузере (client-side)
  exportInvoiceExcel: null, // реализован в cabinet.js
};
