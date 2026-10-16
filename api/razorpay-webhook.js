const crypto = require('crypto');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_APP_PASSWORD },
});

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const raw = await readRaw(req);
  const sig = String(req.headers['x-razorpay-signature'] || '');
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(raw).digest('hex');

  if (sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(400).send('bad signature');
  }

  const event = JSON.parse(raw.toString('utf8'));
  if (event.event === 'payment.captured') {
    const p = event.payload.payment.entity;
    const notes = p.notes && !Array.isArray(p.notes) ? p.notes : {};
    const k = Object.keys(notes).find((x) => /name/i.test(x));
    const name = (k && notes[k]) || 'Friend';
    const amt = p.amount / 100;

    if (p.email) {
      try {
        await transporter.sendMail({
          from: `"Saptrishi Learning Centre" <${process.env.MAIL_USER}>`,
          to: p.email,
          subject: 'धन्यवाद! Thank you for your support 🙏',
          text: `प्रिय ${name},\n\nआपके ₹${amt} के सहयोग के लिए हृदय से धन्यवाद। 🙏\n\nDear ${name},\nThank you for your contribution of ₹${amt}.\nPayment ID: ${p.id}\n\n- Saptrishi Learning Centre`,
        });
      } catch (e) { console.error('mail failed', e.message); }
    }
  }
  res.status(200).send('ok');
};