const crypto = require('crypto');

const YOOKASSA_API = 'https://api.yookassa.ru/v3';

function authHeader() {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) return null;
  return 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64');
}

function isConfigured() {
  return !!authHeader();
}

// Creates a YooKassa payment and returns the raw API response, which includes
// `id` (the payment ID) and `confirmation.confirmation_url` to redirect the
// payer to.
async function createPayment({ amountRub, description, metadata, returnUrl }) {
  const auth = authHeader();
  if (!auth) throw new Error('YOOKASSA_NOT_CONFIGURED');

  const res = await fetch(`${YOOKASSA_API}/payments`, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      'Idempotence-Key': crypto.randomUUID(),
    },
    body: JSON.stringify({
      amount: { value: amountRub.toFixed(2), currency: 'RUB' },
      capture: true,
      confirmation: { type: 'redirect', return_url: returnUrl },
      description,
      metadata,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.description || `Ошибка ЮKassa (код ${res.status})`);
  return data;
}

// Re-fetches a payment's real status directly from YooKassa's API. Used
// instead of trusting a webhook body's contents, since anyone can POST to
// our webhook URL — only what YooKassa itself reports here is trusted.
async function getPayment(paymentId) {
  const auth = authHeader();
  if (!auth) throw new Error('YOOKASSA_NOT_CONFIGURED');

  const res = await fetch(`${YOOKASSA_API}/payments/${paymentId}`, {
    headers: { Authorization: auth },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.description || `Ошибка ЮKassa (код ${res.status})`);
  return data;
}

module.exports = { isConfigured, createPayment, getPayment };
