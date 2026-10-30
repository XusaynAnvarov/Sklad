#!/usr/bin/env node
// Одноразовый скрипт: меняет аватар Telegram-канала на новый логотип GM.
// Запуск на VPS: node _tools/set-channel-photo.js
// Требует: CLIENT_BOT_TOKEN и TELEGRAM_CHANNEL_ID в окружении.

const fs   = require("fs");
const path = require("path");
const https = require("https");

const TOKEN   = process.env.CLIENT_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL = process.env.TELEGRAM_CHANNEL_ID;
const PHOTO   = path.join(__dirname, "..", "brand", "bot-avatar.png");

if (!TOKEN)   { console.error("❌  Нет CLIENT_BOT_TOKEN / TELEGRAM_BOT_TOKEN в окружении"); process.exit(1); }
if (!CHANNEL) { console.error("❌  Нет TELEGRAM_CHANNEL_ID в окружении"); process.exit(1); }
if (!fs.existsSync(PHOTO)) { console.error("❌  Файл не найден:", PHOTO); process.exit(1); }

const photoData = fs.readFileSync(PHOTO);
const boundary  = "----GMBoundary" + Date.now();

const formHead = Buffer.from(
  `--${boundary}\r\n` +
  `Content-Disposition: form-data; name="chat_id"\r\n\r\n${CHANNEL}\r\n` +
  `--${boundary}\r\n` +
  `Content-Disposition: form-data; name="photo"; filename="bot-avatar.png"\r\n` +
  `Content-Type: image/png\r\n\r\n`
);
const formTail = Buffer.from(`\r\n--${boundary}--\r\n`);
const body = Buffer.concat([formHead, photoData, formTail]);

const options = {
  hostname: "api.telegram.org",
  path: `/bot${TOKEN}/setChatPhoto`,
  method: "POST",
  headers: {
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
    "Content-Length": body.length,
  },
};

console.log(`📤  Отправка аватара для канала ${CHANNEL}…`);
const req = https.request(options, (res) => {
  let data = "";
  res.on("data", (c) => (data += c));
  res.on("end", () => {
    const json = JSON.parse(data);
    if (json.ok) {
      console.log("✅  Аватар канала обновлён!");
    } else {
      console.error("❌  Ошибка:", json.description);
    }
  });
});
req.on("error", (e) => console.error("❌  Сетевая ошибка:", e.message));
req.write(body);
req.end();
