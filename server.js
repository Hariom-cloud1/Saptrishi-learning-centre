/**
 * Saptrishi Learning Centre — Backend Server
 * -------------------------------------------------
 * Pure Node.js (no npm install needed) using the built-in
 * `node:sqlite` module (Node 22.5+) for persistent storage,
 * and the built-in `http` module for the server itself.
 *
 * Run:   node server.js
 * Then open: http://localhost:3000
 * Admin page: http://localhost:3000/admin.html  (key: see ADMIN_KEY below)
 */

const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
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
      }

      res.writeHead(302, { Location: `/?payment=${isValid && STATUS === 'TXN_SUCCESS' ? 'success' : 'failed'}` });
      return res.end();
    }

    // ---- GET /api/payment-status (client checks Razorpay/Paytm result was logged) ----
    if (pathname === '/api/payment-status' && req.method === 'GET') {
      const id = Number(url.searchParams.get('id'));
      if (!id) return sendJSON(res, 400, { ok: false, error: 'Missing id' });
      const donation = getDonationById.get(id);
      if (!donation) return sendJSON(res, 404, { ok: false, error: 'Not found' });
      return sendJSON(res, 200, { ok: true, status: donation.payment_status });
    }

    // ---- POST /api/volunteer ----
    if (pathname === '/api/volunteer' && req.method === 'POST') {
      const body = await readBody(req);
      const { name, email, phone = '', skills = '', message = '' } = body;
      if (!name || !isValidEmail(email)) {
        return sendJSON(res, 400, { ok: false, error: 'Name and a valid email are required.' });
      }
      insertVolunteer.run(String(name).trim(), String(email).trim(), String(phone), String(skills), String(message));
      return sendJSON(res, 201, { ok: true, message: 'Thanks for volunteering! Our team will contact you soon.' });
    }

    // ---- POST /api/contact ----
    if (pathname === '/api/contact' && req.method === 'POST') {
      const body = await readBody(req);
      const { name, email, message } = body;
      if (!name || !isValidEmail(email) || !message) {
        return sendJSON(res, 400, { ok: false, error: 'Name, valid email and message are required.' });
      }
      insertContact.run(String(name).trim(), String(email).trim(), String(message).trim());
      return sendJSON(res, 201, { ok: true, message: 'Message received. We will get back to you soon.' });
    }

    // ---- GET /api/stats (public, aggregate only) ----
    if (pathname === '/api/stats' && req.method === 'GET') {
      const d = db.prepare('SELECT COUNT(*) AS c FROM donations').get();
      const v = db.prepare('SELECT COUNT(*) AS c FROM volunteers').get();
      const c = db.prepare('SELECT COUNT(*) AS c FROM contacts').get();
      return sendJSON(res, 200, { ok: true, donations: d.c, volunteers: v.c, contacts: c.c });
    }

    // ---- GET /api/admin/data (protected) ----
    if (pathname === '/api/admin/data' && req.method === 'GET') {
      if (!checkAdmin(req)) {
        return sendJSON(res, 401, { ok: false, error: 'Invalid or missing admin key.' });
      }
      const donations = db.prepare('SELECT * FROM donations ORDER BY id DESC').all();
      const volunteers = db.prepare('SELECT * FROM volunteers ORDER BY id DESC').all();
      const contacts = db.prepare('SELECT * FROM contacts ORDER BY id DESC').all();
      return sendJSON(res, 200, { ok: true, donations, volunteers, contacts });
    }

    // ---- Static files (the website itself) ----
    if (req.method === 'GET') {
      return serveStatic(req, res, pathname);
    }

    sendJSON(res, 404, { ok: false, error: 'Not found' });
  } catch (err) {
    sendJSON(res, 500, { ok: false, error: err.message || 'Server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Saptrishi server running → http://localhost:${PORT}`);
  console.log(`Admin panel           → http://localhost:${PORT}/admin.html`);
  console.log(`Database file         → ${DB_PATH}`);
});