// server/index.js — unified: session + confirm + booking

  const express = require("express");
  const cors = require("cors");
  const path = require("path");
  const axios = require("axios");
  const admin = require("firebase-admin");
  const nodemailer = require("nodemailer");

  /* ── CONFIG (temp constants; move to .env later) ────────────── */
  const PORT = 3000;

  // Paymob (use your real test keys)
  const PAYMOB_API_KEY =
    "ZXlKaGJHY2lPaUpJVXpVeE1pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SmpiR0Z6Y3lJNklrMWxjbU5vWVc1MElpd2ljSEp2Wm1sc1pWOXdheUk2TVRBM05qRTJOaXdpYm1GdFpTSTZJbWx1YVhScFlXd2lmUS5yMzVuZGl6c0pKTmxuS3czaFNNZWJKMFJGazkwdFgxX0p4bjZ1T2phaW82V1J6cy1hMGdTelVpLXY5bE4xVktzdF9Id2IxbGZ3Qlh1UjA4RnAxWlZrdw==";
  const PAYMOB_INTEGRATION_ID = 5274250; // your “Online Card” integration id

  // Where Paymob should send the user after 3DS
  const REDIRECT_URL = "http://localhost:3000/success.html";

  // Email (optional). If you haven’t set up Mailjet yet, leave ENABLE_EMAIL=false.
  const ENABLE_EMAIL = false;
  const EMAIL_FROM = '"The Studio" <bookings@your-domain.com>';
  const EMAIL_TRANSPORT = ENABLE_EMAIL
    ? nodemailer.createTransport({
        host: "in-v3.mailjet.com",
        port: 587,
        secure: false,
        auth: {
          user: "YOUR_MAILJET_API_KEY",
          pass: "YOUR_MAILJET_SECRET_KEY",
        },
      })
    : null;

  /* ── Firebase Admin ─────────────────────────────────────────── */
  const serviceAccount = require("./serviceAccountKey.json");
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  /* ── Express boot ───────────────────────────────────────────── */
  const app = express();
  app.use(cors({ origin: ["http://localhost:3000", "http://127.0.0.1:3000"], credentials: true }));
  app.use(express.json());

  // Serve frontend
  app.use(express.static(path.join(__dirname, "../client")));
  app.use("/assets", express.static(path.join(__dirname, "../assets")));

  /* ── Email helper (safe if disabled) ────────────────────────── */
  async function sendConfirmationEmail(bookingId, booking) {
    if (!EMAIL_TRANSPORT) return;
    const when = new Date(booking.dateISO).toLocaleString(undefined, {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });
    await EMAIL_TRANSPORT.sendMail({
      from: EMAIL_FROM,
      to: booking.customer.email,
      subject: `Your booking is confirmed — ${booking.typeName}`,
      html: `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
          <h2 style="margin:0 0 8px">Booking Confirmed 🎉</h2>
          <p style="margin:0 0 12px">Thanks, ${booking.customer.firstName}.</p>
          <table style="border-collapse:collapse">
            <tr><td style="padding:2px 8px">Session</td><td><b>${booking.typeName}</b></td></tr>
            <tr><td style="padding:2px 8px">When</td><td>${when} (${booking.timeZone})</td></tr>
            <tr><td style="padding:2px 8px">Deposit</td><td><b>EGP ${booking.depositAmount.toLocaleString("en-EG")}</b> paid</td></tr>
            <tr><td style="padding:2px 8px">Remaining</td><td>EGP ${booking.remainingAmount.toLocaleString("en-EG")} due after session</td></tr>
            <tr><td style="padding:2px 8px">Reference</td><td>${bookingId}</td></tr>
          </table>
        </div>
      `,
    });
  }

  /* ── Paymob: create session (auth → order → payment_key) ───── */
  app.post("/api/paymob/session", async (req, res) => {
    try {
      const apiKey = (PAYMOB_API_KEY || "").trim();
      if (!apiKey) return res.status(500).json({ error: "Missing PAYMOB_API_KEY" });

      const { amount_cents, billing, meta } = req.body || {};
      const amount = Number(amount_cents);
      if (!amount || amount < 100) return res.status(400).json({ error: "Invalid amount_cents" });

      // 1) Auth
      const { data: a } = await axios.post("https://accept.paymob.com/api/auth/tokens", { api_key: apiKey });
      const authToken = a?.token;
      if (!authToken) throw new Error("Auth token not returned");

      // 2) Order
      const merchantOrderId = `dep_${Date.now()}`;
      const { data: o } = await axios.post("https://accept.paymob.com/api/ecommerce/orders", {
        auth_token: authToken,
        delivery_needed: false,
        amount_cents: amount,
        currency: "EGP",
        items: [],
        merchant_order_id: merchantOrderId,
      });
      const orderId = o?.id;
      if (!orderId) throw new Error("Order id not returned");

      // 3) Payment key (card iframe)
      const billing_data = {
        first_name: billing?.first_name || "N/A",
        last_name: billing?.last_name || "N/A",
        email: billing?.email || "noone@example.com",
        phone_number: billing?.phone_number || "+201000000000",
        apartment: "NA", floor: "NA", street: "NA", building: "NA",
        shipping_method: "NA", city: "NA", country: "EGYPT", state: "NA",
      };

      const { data: k } = await axios.post("https://accept.paymob.com/api/acceptance/payment_keys", {
        auth_token: authToken,
        amount_cents: amount,
        expiration: 3600,
        order_id: orderId,
        billing_data,
        currency: "EGP",
        integration_id: Number(PAYMOB_INTEGRATION_ID),
        lock_order_when_paid: true,
        redirection_url: REDIRECT_URL,
      });
      const payment_token = k?.token;
      if (!payment_token) throw new Error("Payment token not returned");

      // Save your booking metadata keyed by merchantOrderId
      if (meta) {
        await db.collection("paymob_meta").doc(String(merchantOrderId)).set({
          merchantOrderId,
          orderId,
          meta,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return res.json({ payment_token, order_id: orderId, merchant_order_id: merchantOrderId });
    } catch (err) {
      console.error("Paymob /session error →", err?.response?.status, err?.response?.data || err.message);
      return res.status(500).json({ error: "Paymob auth failed" });
    }
  });

  /* ── Finalize booking from saved meta ───────────────────────── */
  async function finalizeFromMerchantOrderId(merchantOrderId) {
    const doc = await db.collection("paymob_meta").doc(String(merchantOrderId)).get();
    if (!doc.exists) throw new Error("Meta not found for this merchant_order_id");
    const meta = doc.data().meta;

    const price = Number(meta?.selectedType?.price || 0);
    const depositPercent = Number(meta?.depositPercent || 50);
    const depositAmount = Math.round(price * depositPercent / 100);
    const remainingAmount = price - depositAmount;

    const booking = {
      typeId: meta.selectedType.id,
      typeName: meta.selectedType.name,
      hours: meta.selectedType.hours,
      price,
      depositPercent,
      depositAmount,
      remainingAmount,
      dateISO: meta.selectedDate,
      timeLabel: meta.selectedTime,
      timeZone: meta.timeZone,
      customer: meta.customer,
      payment: { status: "paid_deposit", gateway: "paymob", merchantOrderId },
      status: "confirmed",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("bookings").add(booking);
    await sendConfirmationEmail(docRef.id, booking);
    return { bookingId: docRef.id, booking };
  }

  /* ── POST /api/paymob/confirm (success.html calls this) ─────── */
  // POST /api/paymob/confirm  (STRICT)
  app.post("/api/paymob/confirm", async (req, res) => {
    try {
      const { merchant_order_id, success, txn_response_code, pending } = req.body || {};
      if (!merchant_order_id) return res.status(400).json({ ok:false, error:"Missing merchant_order_id" });

      const isTrue = v => String(v).toLowerCase() === "true";
      const isApprovedCode = c => ["APPROVED","SUCCESS"].includes(String(c || "").toUpperCase());

      // Must be explicitly successful, not pending, and approved
      if (!isTrue(success) || isTrue(pending) || !isApprovedCode(txn_response_code)) {
        return res.status(400).json({ ok:false, error:"Payment not approved" });
      }

      // idempotency: if we've already finalized this merchant_order_id, bail out
      const existing = await db.collection("bookings")
        .where("payment.merchantOrderId","==", String(merchant_order_id))
        .limit(1).get();
      if (!existing.empty) {
        const doc = existing.docs[0];
        return res.json({ ok:true, bookingId: doc.id, booking: doc.data() });
      }

      const result = await finalizeFromMerchantOrderId(merchant_order_id);
      return res.json({ ok:true, ...result });
    } catch (e) {
      console.error("POST /api/paymob/confirm error:", e);
      return res.status(500).json({ ok:false, error:"Internal error" });
    }
  });


  /* ── GET /api/paymob/confirm (if Paymob sends you here) ─────── */
  app.get("/api/paymob/confirm", async (req, res) => {
    try {
      const p = req.query;
  
      const isTrue = v => String(v).toLowerCase() === "true";
      const approved = new Set(["APPROVED", "SUCCESS"]);
  
      const success   = isTrue(p.success);
      const pending   = isTrue(p.pending);
      const errFlag   = isTrue(p.error_occured || p.error_occurred);
      const respCode  = String(p["data.txn_response_code"] || p["txn_response_code"] || "").toUpperCase();
      const msg       = String(p["data.message"] || p["message"] || "Payment not approved");
      const merchantOrderId = String(p.merchant_order_id || p.merchant_order || "");
  
      // STRICT: must be explicitly successful, not pending/errored, and approved code
      const isApproved = success && !pending && !errFlag && approved.has(respCode);
  
      if (!isApproved) {
        const q = new URLSearchParams({
          reason: msg,
          code: respCode || "",
          order: String(p.order || ""),
          merchant_order_id: merchantOrderId
        }).toString();
        return res.redirect(`/failure.html?${q}`);
      }
  
      if (!merchantOrderId) return res.status(400).send("Missing merchant_order_id");
  
      // Idempotency guard: if already finalized, finalizeFromMerchantOrderId will short-circuit
      const { bookingId } = await finalizeFromMerchantOrderId(merchantOrderId);
      return res.redirect(`/success.html?bookingId=${encodeURIComponent(bookingId)}`);
    } catch (err) {
      console.error("GET /api/paymob/confirm error:", err?.response?.data || err);
      return res.status(500).send("Internal error.");
    }
  });

  /* ── (Optional) webhook for live deployments ─────────────────── */
  app.post("/api/paymob/webhook", (req, res) => {
    // When deployed publicly, verify HMAC and finalize here too.
    res.sendStatus(200);
  });

  /* ── Start ───────────────────────────────────────────────────── */
  app.listen(PORT, () => {
    console.log(`Server running: http://localhost:${PORT}`);
  });
