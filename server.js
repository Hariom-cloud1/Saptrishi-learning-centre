/**
 * Saptrishi Learning Centre — Backend Server
 * -------------------------------------------------
 * Node.js server using the built-in `node:sqlite` module (Node 22.5+)
 * for storage and the built-in `http` module for the server itself.
 * Only extra package: nodemailer  ->  npm i nodemailer
 *
 * Run:   node server.js
 * Then open: http://localhost:3000
 * Admin page: http://localhost:3000/admin.html  (key: see ADMIN_KEY below)
 */

const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'saptrishi2026'; // change this in production!
const PUBLIC_DIR = path.join(__dirname, 'public');
const DB_PATH = path.join(__dirname, 'data', 'saptrishi.db');

// ---------- PAYMENT GATEWAY CONFIG ----------
// Razorpay: Key ID is PUBLIC (safe to send to the browser). Get it from
// Razorpay Dashboard → Settings → API Keys.
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_TlrIVj0yJSRv8b';

// Razorpay Webhook secret (Dashboard → Account & Settings → Webhooks).
// SECRET: sirf environment variable me rakhein, code me nahi.
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

// ---------- THANK-YOU EMAIL CONFIG ----------
// Gmail me 2-Step Verification on karke "App Password" banayein.
//   MAIL_USER=yourmail@gmail.com MAIL_APP_PASSWORD=xxxxxxxxxxxxxxxx node server.js
const MAIL_USER = process.env.MAIL_USER || '';
const MAIL_APP_PASSWORD = process.env.MAIL_APP_PASSWORD || '';
const MAIL_FROM_NAME = 'Saptrishi Learning Centre';

const mailer = (MAIL_USER && MAIL_APP_PASSWORD)
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: MAIL_USER, pass: MAIL_APP_PASSWORD },
    })
  : null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Payment hone ke baad donor ko thank-you mail bhejta hai.
// Fail hone par sirf log karta hai, payment par koi asar nahi padta.
async function sendThankYouMail({ to, name, amount, ref }) {
  if (!mailer) {
    console.warn('[mail] MAIL_USER / MAIL_APP_PASSWORD set nahi hai, mail skip.');
    return;
  }
  if (!isValidEmail(to)) return;

  const donor = (name && String(name).trim()) || 'Friend';
  const amt = amount ? `₹${Number(amount).toLocaleString('en-IN')}` : '';
  const amtHi = amt ? `${amt} के ` : '';
  const amtEn = amt ? ` of ${amt}` : '';
  const refLine = ref ? `\nPayment ID: ${ref}` : '';

  const text =
`प्रिय ${donor},

आपके ${amtHi}सहयोग के लिए हृदय से धन्यवाद। 🙏
आपकी मदद से हम बच्चों तक शिक्षा पहुँचा पाते हैं।

Dear ${donor},

Thank you for your contribution${amtEn}. Your support helps us keep education within reach for children who need it most.${refLine}

With gratitude,
${MAIL_FROM_NAME}`;

  const html =
`<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;line-height:1.6;color:#222">
  <h2 style="color:#e67e22;margin-bottom:4px">धन्यवाद! / Thank you 🙏</h2>
  <p>प्रिय ${escapeHtml(donor)},</p>
  <p>आपके ${escapeHtml(amtHi)}सहयोग के लिए हृदय से धन्यवाद। आपकी मदद से हम बच्चों तक शिक्षा पहुँचा पाते हैं।</p>
  <p>Dear ${escapeHtml(donor)},</p>
  <p>Thank you for your contribution${escapeHtml(amtEn)}. Your support helps us keep education within reach for children who need it most.</p>
  ${ref ? `<p style="font-size:13px;color:#666">Payment ID: ${escapeHtml(ref)}</p>` : ''}
  <p>With gratitude,<br><b>${MAIL_FROM_NAME}</b></p>
</div>`;

  try {
    await mailer.sendMail({
      from: `"${MAIL_FROM_NAME}" <${MAIL_USER}>`,
      to,
      subject: 'धन्यवाद! Thank you for your support 🙏',
      text,
      html,
    });
    console.log(`[mail] thank-you bheja -> ${to}`);
  } catch (e) {
    console.error('[mail] bhejne me error:', e.message);
  }
}

// ---------- MONTHLY SUPPORT PLANS (Support Us page, Option 4) ----------
// Har plan ka Razorpay Subscription Link / Payment Page link environment variable me daalein, e.g.
//   PLAN_LINK_500=https://rzp.io/l/xxxx PLAN_LINK_1000=https://rzp.io/l/yyyy node server.js
// Link khali ho to us plan par "Subscribe Now" dabane se "being set up" message dikhega.
// (Plan ka naam/rakam badalna ho to support-us.html ki PLANS list me bhi wahi rakam rakhein.)
const MONTHLY_PLANS = [
  { label: 'Supporter',                                      amount: 500,   link: process.env.PLAN_LINK_500   || '' },
  { label: 'Backer',                                         amount: 1000,  link: process.env.PLAN_LINK_1000  || '' },
  { label: 'Patron - Helps run a learning centre',           amount: 2500,  link: process.env.PLAN_LINK_2500  || '' },
  { label: 'Core Patron - Sponsors meals and school kits',   amount: 5000,  link: process.env.PLAN_LINK_5000  || '' },
  { label: 'Principal Patron - Powers long-term programmes', amount: 10000, link: process.env.PLAN_LINK_10000 || '' },
];

// Paytm: MID and Merchant Key are SECRET — never expose these to the browser.
// Set them as environment variables when you run the server, e.g.:
//   PAYTM_MID=yourMID PAYTM_MERCHANT_KEY=yourKey node server.js
// PAYTM_ENV: 'staging' for testing, 'production' for real payments.
const PAYTM_MID = process.env.PAYTM_MID || '';
const PAYTM_MERCHANT_KEY = process.env.PAYTM_MERCHANT_KEY || '';
const PAYTM_ENV = process.env.PAYTM_ENV || 'staging';
const PAYTM_HOST = PAYTM_ENV === 'production' ? 'securegw.paytm.in' : 'securegw-stage.paytm.in';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

// ---------- DATABASE ----------
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    amount REAL,
    message TEXT,
    payment_method TEXT DEFAULT 'unpaid',
    payment_status TEXT DEFAULT 'pending',
    payment_ref TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS volunteers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    skills TEXT,
    message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const insertDonation = db.prepare(
  `INSERT INTO donations (name, email, phone, amount, message, payment_method, payment_status, payment_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const updateDonationPayment = db.prepare(
  `UPDATE donations SET payment_status = ?, payment_ref = ? WHERE id = ?`
);
const getDonationById = db.prepare(`SELECT * FROM donations WHERE id = ?`);
const getDonationByRef = db.prepare(`SELECT * FROM donations WHERE payment_ref = ?`);
const insertVolunteer = db.prepare(
  `INSERT INTO volunteers (name, email, phone, skills, message) VALUES (?, ?, ?, ?, ?)`
);
const insertContact = db.prepare(
  `INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)`
);

// ---------- HELPERS ----------
function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1e6) { // 1MB limit
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks += chunk;
    });
    req.on('end', () => {
      if (!chunks) return resolve({});
      try {
        resolve(JSON.parse(chunks));
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Raw body (Buffer) — Razorpay webhook signature ke liye zaruri.
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1e6) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      parts.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------- PAYTM CHECKSUM UTILITY ----------
// Implements Paytm's official checksum algorithm (AES-128-CBC) using only
// Node's built-in crypto module — no external package needed.
const PAYTM_IV = '@@@@&&&&####$$$$';

function paytmUniqueId(length) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

function paytmEncrypt(input, key) {
  const cipher = crypto.createCipheriv('aes-128-cbc', key, PAYTM_IV);
  let encrypted = cipher.update(input, 'binary', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}

function paytmDecrypt(encrypted, key) {
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, PAYTM_IV);
  let decrypted = decipher.update(encrypted, 'base64', 'binary');
  decrypted += decipher.final('binary');
  return decrypted;
}

function generatePaytmChecksum(params, key) {
  const salt = paytmUniqueId(4);
  const str = Object.keys(params).sort().map(k => params[k]).join('|') + '|' + salt;
  const hash = crypto.createHash('sha256').update(str).digest('hex') + salt;
  return paytmEncrypt(hash, key);
}

function verifyPaytmChecksum(params, key, checksum) {
  const paytmHash = paytmDecrypt(checksum, key);
  const salt = paytmHash.substring(paytmHash.length - 4);
  const str = Object.keys(params).sort().map(k => params[k]).join('|') + '|' + salt;
  const hash = crypto.createHash('sha256').update(str).digest('hex') + salt;
  return hash === paytmHash;
}

function readFormBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', (chunk) => { chunks += chunk; });
    req.on('end', () => {
      const params = {};
      new URLSearchParams(chunks).forEach((v, k) => { params[k] = v; });
      resolve(params);
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function serveStatic(req, res, urlPath) {
  let filePath = urlPath === '/' ? '/index.html' : urlPath;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, ''); // prevent path traversal
  if (!path.extname(filePath)) filePath += '.html'; // clean URLs: /support-us -> /support-us.html
  const fullPath = path.join(PUBLIC_DIR, filePath);

  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

function checkAdmin(req) {
  const key = req.headers['x-admin-key'] || new URL(req.url, 'http://x').searchParams.get('key');
  return key === ADMIN_KEY;
}

// ---------- ROUTES ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    return res.end();
  }

  try {
    // ---- POST /api/razorpay-webhook ----
    // Razorpay Payment Page / Link se payment hote hi yahan event aata hai.
    // Dashboard → Webhooks me URL: https://<aapka-domain>/api/razorpay-webhook
    // Event: payment.captured
    if (pathname === '/api/razorpay-webhook' && req.method === 'POST') {
      const raw = await readRawBody(req);

      if (!RAZORPAY_WEBHOOK_SECRET) {
        console.error('[webhook] RAZORPAY_WEBHOOK_SECRET set nahi hai.');
        return sendJSON(res, 500, { ok: false, error: 'Webhook not configured.' });
      }

      const signature = String(req.headers['x-razorpay-signature'] || '');
      const expected = crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
      const sigOk =
        signature.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
      if (!sigOk) {
        return sendJSON(res, 400, { ok: false, error: 'Invalid signature.' });
      }

      let event;
      try { event = JSON.parse(raw.toString('utf8')); }
      catch (e) { return sendJSON(res, 400, { ok: false, error: 'Invalid JSON.' }); }

      if (event.event === 'payment.captured') {
        const p = (event.payload && event.payload.payment && event.payload.payment.entity) || {};
        const amount = p.amount ? p.amount / 100 : null;
        const email = p.email || '';
        const notes = (p.notes && !Array.isArray(p.notes)) ? p.notes : {};
        const nameKey = Object.keys(notes).find((k) => /name/i.test(k));
        const name = (nameKey && notes[nameKey]) || 'Friend';

        // Razorpay retry kare to dobara mail/record na bane.
        if (p.id && !getDonationByRef.get(p.id)) {
          insertDonation.run(
            String(name), String(email), String(p.contact || ''),
            amount, '', 'razorpay', 'paid', String(p.id)
          );
          await sendThankYouMail({ to: email, name, amount, ref: p.id });
        }
      }
      // Hamesha 200 do, warna Razorpay baar-baar retry karega.
      return sendJSON(res, 200, { ok: true });
    }

    // ---- POST /api/donate ----
    if (pathname === '/api/donate' && req.method === 'POST') {
      const body = await readBody(req);
      const { name, email, phone = '', amount = null, message = '', paymentMethod = 'unpaid', paymentStatus = 'pending', paymentRef = '' } = body;
      if (!name || !isValidEmail(email)) {
        return sendJSON(res, 400, { ok: false, error: 'Name and a valid email are required.' });
      }
      const result = insertDonation.run(
        String(name).trim(), String(email).trim(), String(phone),
        amount ? Number(amount) : null, String(message),
        String(paymentMethod), String(paymentStatus), String(paymentRef)
      );
      if (paymentStatus === 'paid') {
        sendThankYouMail({ to: String(email).trim(), name: String(name).trim(), amount: amount ? Number(amount) : null, ref: String(paymentRef) });
      }
      return sendJSON(res, 201, {
        ok: true,
        donationId: result.lastInsertRowid,
        message: paymentStatus === 'paid'
          ? 'Thank you! Your payment was received.'
          : 'Thank you! We will reach out with UPI/payment details shortly.',
      });
    }

    // ---- GET /api/payment-config (public key only, safe to expose) ----
    if (pathname === '/api/payment-config' && req.method === 'GET') {
      return sendJSON(res, 200, {
        ok: true,
        razorpayKeyId: RAZORPAY_KEY_ID,
        paytmEnabled: Boolean(PAYTM_MID && PAYTM_MERCHANT_KEY),
        monthlyPlans: MONTHLY_PLANS,
      });
    }

    // ---- POST /api/paytm/initiate ----
    if (pathname === '/api/paytm/initiate' && req.method === 'POST') {
      if (!PAYTM_MID || !PAYTM_MERCHANT_KEY) {
        return sendJSON(res, 400, { ok: false, error: 'Paytm is not configured on this server yet.' });
      }
      const body = await readBody(req);
      const { name, email, phone = '', amount } = body;
      if (!name || !isValidEmail(email) || !amount || Number(amount) <= 0) {
        return sendJSON(res, 400, { ok: false, error: 'Name, valid email and amount are required.' });
      }

      const result = insertDonation.run(
        String(name).trim(), String(email).trim(), String(phone),
        Number(amount), '', 'paytm', 'initiated', ''
      );
      const donationId = result.lastInsertRowid;
      const orderId = `SAPTRISHI_${donationId}_${Date.now()}`;

      const paytmParams = {
        body: {
          requestType: 'Payment',
          mid: PAYTM_MID,
          websiteName: PAYTM_ENV === 'production' ? 'DEFAULT' : 'WEBSTAGING',
          orderId,
          callbackUrl: `${PUBLIC_BASE_URL}/api/paytm/callback`,
          txnAmount: { value: Number(amount).toFixed(2), currency: 'INR' },
          userInfo: { custId: `CUST_${donationId}` },
        },
      };
      paytmParams.head = {
        signature: generatePaytmChecksum(paytmParams.body, PAYTM_MERCHANT_KEY),
      };

      const postData = JSON.stringify(paytmParams);
      const options = {
        hostname: PAYTM_HOST,
        path: `/theia/api/v1/initiateTransaction?mid=${PAYTM_MID}&orderId=${orderId}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
      };

      const paytmResponse = await new Promise((resolve, reject) => {
        const preq = https.request(options, (pres) => {
          let data = '';
          pres.on('data', (c) => { data += c; });
          pres.on('end', () => {
            try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid response from Paytm')); }
          });
        });
        preq.on('error', reject);
        preq.write(postData);
        preq.end();
      });

      const txnToken = paytmResponse && paytmResponse.body && paytmResponse.body.txnToken;
      if (!txnToken) {
        return sendJSON(res, 500, { ok: false, error: 'Could not start Paytm payment. Please try again.' });
      }

      return sendJSON(res, 200, {
        ok: true,
        mid: PAYTM_MID,
        orderId,
        txnToken,
        txnUrl: `https://${PAYTM_HOST}/theia/api/v1/showPaymentPage?mid=${PAYTM_MID}&orderId=${orderId}`,
      });
    }

    // ---- POST /api/paytm/callback (Paytm redirects the browser here after payment) ----
    if (pathname === '/api/paytm/callback' && req.method === 'POST') {
      const params = await readFormBody(req);
      const { CHECKSUMHASH, ORDERID, STATUS } = params;
      delete params.CHECKSUMHASH;

      const isValid = PAYTM_MERCHANT_KEY && CHECKSUMHASH && verifyPaytmChecksum(params, PAYTM_MERCHANT_KEY, CHECKSUMHASH);
      const donationId = ORDERID ? Number(String(ORDERID).split('_')[1]) : null;

      if (isValid && donationId) {
        const finalStatus = STATUS === 'TXN_SUCCESS' ? 'paid' : 'failed';
        updateDonationPayment.run(finalStatus, params.TXNID || '', donationId);

        if (finalStatus === 'paid') {
          const d = getDonationById.get(donationId);
          if (d) {
            sendThankYouMail({ to: d.email, name: d.name, amount: d.amount, ref: params.TXNID || '' });
          }
        }
      }

      res.writeHead(302, { Location: `/?payment=${isValid && STATUS === 'TXN_SUCCESS' ? 'success' : 'failed'}` });
      return res.end();
    }

    // ---- GET /api/payment-status (client checks Razorpay/Paytm result was logged) ----
    if (pathname === '/api/payment-status' && req.method === 'GET') {
      const id = Number(url.searchParams.get('id'));
      if (!id) return sendJSON(res, 400, { ok: false, error: 'Mis