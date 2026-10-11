require("dotenv").config();
const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_KEY = process.env.ADMIN_KEY;
const DEVICE_TOKEN = process.env.DEVICE_TOKEN;

if (!ADMIN_KEY || !DEVICE_TOKEN) {
  console.error("Set ADMIN_KEY and DEVICE_TOKEN in your .env before starting.");
  process.exit(1);
}

app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

const db = new Database(path.join(__dirname, "vending.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price_paise INTEGER NOT NULL CHECK(price_paise >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_paise INTEGER NOT NULL,
  total_paise INTEGER NOT NULL,
  status TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'not_started',
  payment_ref TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(product_id) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  channel INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT NOT NULL,
  finished_at TEXT,
  detail TEXT,
  FOREIGN KEY(order_id) REFERENCES orders(id)
);
`);

if (db.prepare("SELECT COUNT(*) AS n FROM products").get().n === 0) {
  const insert = db.prepare("INSERT INTO products (name, price_paise, stock) VALUES (?, ?, ?)");
  insert.run("Sample product A", 5000, 10);
  insert.run("Sample product B", 2500, 10);
}

const now = () => new Date().toISOString();
const toPublicOrder = o => ({
  id: o.id, productId: o.product_id, productName: o.product_name, quantity: o.quantity,
  unitPricePaise: o.unit_price_paise, totalPaise: o.total_paise,
  status: o.status, paymentStatus: o.payment_status, createdAt: o.created_at
});
function requireAdmin(req, res, next) {
  if (req.get("x-admin-key") !== ADMIN_KEY) return res.status(401).json({ error: "Admin authentication required" });
  next();
}
function requireDevice(req, res, next) {
  if (req.get("x-device-token") !== DEVICE_TOKEN) return res.status(401).json({ error: "Device authentication required" });
  next();
}

app.get("/api/health", (_req, res) => res.json({
  ok: true, paymentMode: process.env.PINE_LABS_MODE || "disabled",
  note: "Real payments are unavailable until the approved Pine Labs integration is configured."
}));

app.get("/api/products", (_req, res) => {
  res.json(db.prepare("SELECT id, name, price_paise AS pricePaise, stock FROM products WHERE enabled=1 ORDER BY id").all());
});

app.post("/api/orders", (req, res) => {
  const productId = Number(req.body.productId);
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    return res.status(400).json({ error: "Valid productId and quantity (1-10) are required" });
  }
  const product = db.prepare("SELECT * FROM products WHERE id=? AND enabled=1").get(productId);
  if (!product) return res.status(404).json({ error: "Product not found" });
  if (product.stock < quantity) return res.status(409).json({ error: "Insufficient stock" });

  const id = crypto.randomUUID();
  const order = db.prepare(`
    INSERT INTO orders (id, product_id, product_name, quantity, unit_price_paise, total_paise, status, payment_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'awaiting_payment', 'not_started', ?)
  `).run(id, product.id, product.name, quantity, product.price_paise, product.price_paise * quantity, now());
  res.status(201).json(toPublicOrder(db.prepare("SELECT * FROM orders WHERE id=?").get(id)));
});

/*
 * Do not accept a browser claim as proof of payment. This endpoint is deliberately
 * disabled until Pine Labs supplies the appropriate integration documentation,
 * UAT credentials and final transaction-status verification procedure.
 */
app.post("/api/orders/:id/pay", (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.payment_status === "paid") return res.json(toPublicOrder(order));
  res.set("Retry-After", "0").status(503).json({
    error: "Pine Labs integration is not configured",
    nextStep: "Obtain the official Cloud Integration or supported A910 integration package and UAT credentials. No payment was initiated."
  });
});

app.get("/api/admin/orders", requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 200").all().map(toPublicOrder));
});
app.get("/api/admin/products", requireAdmin, (_req, res) => {
  res.json(db.prepare("SELECT id, name, price_paise AS pricePaise, stock, enabled FROM products ORDER BY id").all());
});
app.post("/api/admin/products", requireAdmin, (req, res) => {
  const name = String(req.body.name || "").trim();
  const pricePaise = Number(req.body.pricePaise);
  const stock = Number(req.body.stock);
  if (!name || name.length > 100 || !Number.isSafeInteger(pricePaise) || pricePaise < 0 ||
      !Number.isSafeInteger(stock) || stock < 0) {
    return res.status(400).json({ error: "Provide name, non-negative integer pricePaise and stock" });
  }
  const result = db.prepare("INSERT INTO products (name, price_paise, stock) VALUES (?, ?, ?)").run(name, pricePaise, stock);
  res.status(201).json({ id: Number(result.lastInsertRowid), name, pricePaise, stock, enabled: 1 });
});
app.patch("/api/admin/products/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare("SELECT * FROM products WHERE id=?").get(id);
  if (!current) return res.status(404).json({ error: "Product not found" });
  const name = req.body.name === undefined ? current.name : String(req.body.name).trim();
  const price = req.body.pricePaise === undefined ? current.price_paise : Number(req.body.pricePaise);
  const stock = req.body.stock === undefined ? current.stock : Number(req.body.stock);
  const enabled = req.body.enabled === undefined ? current.enabled : (req.body.enabled ? 1 : 0);
  if (!name || name.length > 100 || !Number.isSafeInteger(price) || price < 0 ||
      !Number.isSafeInteger(stock) || stock < 0) return res.status(400).json({ error: "Invalid product fields" });
  db.prepare("UPDATE products SET name=?, price_paise=?, stock=?, enabled=? WHERE id=?").run(name, price, stock, enabled, id);
  res.json({ id, name, pricePaise: price, stock, enabled });
});

// Only a trusted payment adapter should ever set payment_status='paid'.
// No public/admin route is provided for manually forcing a paid state.
app.post("/api/orders/:id/dispense", (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id=?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.payment_status !== "paid") return res.status(409).json({ error: "Verified payment required before dispensing" });
  if (order.status !== "awaiting_payment") return res.status(409).json({ error: "Order is not eligible for dispensing" });

  const commandId = crypto.randomUUID();
  try {
    const tx = db.transaction(() => {
      db.prepare("INSERT INTO commands (id, order_id, channel, status, created_at) VALUES (?, ?, 1, 'queued', ?)")
        .run(commandId, order.id, now());
      db.prepare("UPDATE orders SET status='dispensing' WHERE id=?").run(order.id);
    });
    tx();
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "A dispensing command already exists" });
    throw e;
  }
  res.status(202).json({ commandId, status: "queued" });
});

app.get("/api/device/next", requireDevice, (_req, res) => {
  const command = db.prepare("SELECT * FROM commands WHERE status='queued' ORDER BY created_at LIMIT 1").get();
  if (!command) return res.status(204).end();
  const updated = db.prepare("UPDATE commands SET status='sent' WHERE id=? AND status='queued'").run(command.id);
  if (!updated.changes) return res.status(204).end();
  res.json({ commandId: command.id, orderId: command.order_id, channel: command.channel });
});

app.post("/api/device/result", requireDevice, (req, res) => {
  const commandId = String(req.body.commandId || "");
  const success = req.body.success === true;
  const detail = String(req.body.detail || "").slice(0, 250);
  const command = db.prepare("SELECT * FROM commands WHERE id=?").get(commandId);
  if (!command) return res.status(404).json({ error: "Command not found" });
  if (["done", "failed"].includes(command.status)) return res.json({ ok: true, duplicate: true });

  const tx = db.transaction(() => {
    db.prepare("UPDATE commands SET status=?, finished_at=?, detail=? WHERE id=?")
      .run(success ? "done" : "failed", now(), detail, commandId);
    db.prepare("UPDATE orders SET status=? WHERE id=?")
      .run(success ? "dispensed" : "dispense_failed", command.order_id);
    if (success) {
      const order = db.prepare("SELECT product_id, quantity FROM orders WHERE id=?").get(command.order_id);
      db.prepare("UPDATE products SET stock=MAX(0, stock-?) WHERE id=?").run(order.quantity, order.product_id);
    }
  });
  tx();
  res.json({ ok: true });
});

app.listen(PORT, HOST, () => {
  console.log(`Vending backend listening at http://localhost:${PORT}`);
  console.log("Development prototype: trusted LAN only; do not port-forward.");
});
