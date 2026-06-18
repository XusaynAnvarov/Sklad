import { buildInvoicePDF } from "../api/lib/pdf.js";
import { writeFileSync } from "fs";
const products = [{ id: "a", name: "Товар в сумах" }, { id: "b", name: "Товар в долларах" }, { id: "c", name: "Товар в юанях" }];
const sale = {
  id: "test123", date: new Date().toISOString(), currency: "som", boxes: 3,
  items: [
    { product_id: "a", qty: 10, unit_price: 50000, currency: "som", paid: false },
    { product_id: "b", qty: 2, unit_price: 20, currency: "usd", paid: false },
    { product_id: "c", qty: 5, unit_price: 30, currency: "yuan", paid: false },
  ],
};
const bytes = await buildInvoicePDF({ sale, customer: { name: "Тест Клиент", contact: "+998..." }, products });
writeFileSync("C:/Users/ASUS/Desktop/VIBE KODING/_import/test-invoice.pdf", bytes);
console.log("OK mixed-currency PDF");
