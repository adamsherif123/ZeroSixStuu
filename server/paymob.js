// server/index.js  — localhost-only version (no ngrok, no .env)

const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
const admin = require("firebase-admin");

/* ── TEMP: hard-coded config (put back into .env later) ───────── */
const PAYMOB_API_KEY =
  "ZXlKaGJHY2lPaUpJVXpVeE1pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SmpiR0Z6Y3lJNklrMWxjbU5vWVc1MElpd2ljSEp2Wm1sc1pWOXdheUk2TVRBM05qRTJOaXdpYm1GdFpTSTZJbWx1YVhScFlXd2lmUS5yMzVuZGl6c0pKTmxuS3czaFNNZWJKMFJGazkwdFgxX0p4bjZ1T2phaW82V1J6cy1hMGdTelVpLXY5bE4xVktzdF9Id2IxbGZ3Qlh1UjA4RnAxWlZrdw=="; // copy the long base64-ish key from Paymob (NOT the public key)
const PAYMOB_INTEGRATION_ID = 5274250;  // your Card integration id
const PAYMOB_HMAC = "D85EE15B5DB5FFB59A5BA55FAA50F9B6"; // for webhooks later
const PORT = 3000;

/* ── Firebase Admin init ────────────────────────────────────────
   Put serviceAccountKey.json in /server and keep it gitignored.
*/
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

/* ── Express boot ─────────────────────────────────────────────── */
const app = express();
app.use(cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  credentials: true
}));
app.use(express.json());

// Serve frontend + assets from the monorepo
app.use(express.static(path.join(__dirname, "../client")));
app.use("/assets", express.static(path.join(__dirname, "../assets")));

/* ── Paymob: create session (auth → order → payment_key) ────────
   POST /api/paymob/session
   body: { amount_cents, billing: {...}, meta: {...optional} }
   returns: { payment_token, order_id, merchant_order_id }
*/
app.post("/api/paymob/session", async (req, res) => {
  try {
    const apiKey = (PAYMOB_API_KEY || "").trim();
    if (!apiKey) return res.status(500).json({ error: "Missing PAYMOB_API_KEY" });

    const { amount_cents, billing, meta } = req.body || {};
    const amount = Number(amount_cents);
    if (!amount || amount < 100) return res.status(400).json({ error: "Invalid amount_cents" });

    // 1) Auth
    const auth = await axios.post("https://accept.paymob.com/api/auth/tokens", {
      api_key: apiKey
    });
    const authToken = auth.data?.token;
    if (!authToken) throw new Error("Auth token not returned");

    // 2) Order
    const merchantOrderId = `dep_${Date.now()}`;
    const order = await axios.post("https://accept.paymob.com/api/ecommerce/orders", {
      auth_token: authToken,
      delivery_needed: false,
      amount_cents: amount,
      currency: "EGP",
      items: [],
      merchant_order_id: merchantOrderId
    });
    const orderId = order.data?.id;
    if (!orderId) throw new Error("Order id not returned");

    // 3) Payment key (card iframe)
    const billing_data = {
      first_name: billing?.first_name || "N/A",
      last_name:  billing?.last_name  || "N/A",
      email:      billing?.email      || "noone@example.com",
      phone_number: billing?.phone_number || "+201000000000",
      apartment: "NA", floor: "NA", street: "NA", building: "NA",
      shipping_method: "NA", city: "NA", country: "EGYPT", state: "NA"
    };

    const payKey = await axios.post("https://accept.paymob.com/api/acceptance/payment_keys", {
      auth_token: authToken,
      amount_cents: amount,
      expiration: 3600,
      order_id: orderId,
      billing_data,
      currency: "EGP",
      integration_id: Number(PAYMOB_INTEGRATION_ID),
      lock_order_when_paid: true
    });

    const payment_token = payKey.data?.token;
    if (!payment_token) throw new Error("Payment token not returned");

    // (optional) Save any metadata on your side
    if (meta) {
      await db.collection("paymob_meta").doc(String(merchantOrderId)).set({
        meta,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.json({ payment_token, order_id: orderId, merchant_order_id: merchantOrderId });
  } catch (err) {
    console.error("Paymob /session error →",
      err.response?.status, err.response?.data || err.message);
    res.status(500).json({ error: "Paymob auth failed" });
  }
});

/* ── Bookings (still here; for LIVE you’ll create on webhook) ─── */
app.post("/api/bookings", async (req, res) => {
  try {
    const { selectedType, selectedDate, selectedTime, timeZone, customer, payment } = req.body || {};
    if (!selectedType || !selectedDate || !selectedTime || !customer) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const price = Number(selectedType.price);
    const depositPercent = 50;
    const depositAmount = Math.round(price * depositPercent / 100);
    const remainingAmount = price - depositAmount;

    const docRef = await db.collection("bookings").add({
      typeId: selectedType.id,
      typeName: selectedType.name,
      hours: selectedType.hours,
      price,
      depositPercent,
      depositAmount,
      remainingAmount,
      dateISO: selectedDate,
      timeLabel: selectedTime,
      timeZone,
      customer,
      payment: payment || { status: "unknown" },
      status: "pending_deposit",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ id: docRef.id, price, depositAmount, remainingAmount });
  } catch (err) {
    console.error("Create booking error:", err);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

/* ── Webhook placeholder (won’t work on localhost externally) ───
   Leave this here; don’t configure it in Paymob until deployed.
*/
app.post("/api/paymob/webhook", (req, res) => {
  console.log("Webhook hit (local placeholder):", req.body);
  res.sendStatus(200);
});

/* ── Start ───────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});
