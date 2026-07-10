const express = require('express');
const models = require('../db/models');
const yookassa = require('../util/yookassa');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../util/asyncHandler');

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://bedbank.netlify.app';

// Re-fetches the payment's real status from YooKassa and credits the donor
// if (and only if) YooKassa itself reports it as paid. Shared by the webhook
// and the manual "check payment" fallback so both paths behave identically.
async function checkAndCredit(paymentId) {
  const payment = await yookassa.getPayment(paymentId);
  if (payment.status === 'succeeded' && payment.paid) {
    await models.markDonationSucceeded(paymentId);
  }
  return payment.status;
}

router.post(
  '/create',
  requireAuth,
  asyncHandler(async (req, res) => {
    const amountRub = Number(req.body?.amountRub);
    if (!Number.isFinite(amountRub) || amountRub <= 0) {
      return res.status(400).json({ error: 'Некорректная сумма' });
    }
    const config = await models.getBankConfig();
    if (amountRub < config.minDonationRub) {
      return res.status(400).json({ error: `Минимальная сумма доната: ${config.minDonationRub} ₽` });
    }
    if (!yookassa.isConfigured()) {
      return res.status(503).json({ error: 'Приём донатов сейчас недоступен' });
    }
    const empAmount = Math.round(amountRub * config.empPerRub);

    let payment;
    try {
      payment = await yookassa.createPayment({
        amountRub,
        description: `Пополнение EMP для ${req.user.username}`,
        metadata: { userId: req.user.id, username: req.user.username },
        returnUrl: `${FRONTEND_URL}/donate.html?status=return`,
      });
    } catch (err) {
      return res.status(502).json({ error: 'Не удалось создать платёж: ' + err.message });
    }

    await models.createPendingDonation({
      userId: req.user.id,
      username: req.user.username,
      providerPaymentId: payment.id,
      amountRub,
      empAmount,
    });

    res.json({
      donationId: payment.id,
      empAmount,
      confirmationUrl: payment.confirmation && payment.confirmation.confirmation_url,
    });
  })
);

router.get(
  '/history',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await models.listDonationsForUser(req.user.id));
  })
);

router.get(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const donation = await models.findDonationById(req.params.id);
    if (!donation || donation.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Донат не найден' });
    }
    res.json(donation);
  })
);

// Fallback for when the YooKassa webhook hasn't fired yet (or isn't
// configured in the ЮKassa dashboard): lets the client force a fresh check.
router.post(
  '/:id/check',
  requireAuth,
  asyncHandler(async (req, res) => {
    const donation = await models.findDonationById(req.params.id);
    if (!donation || donation.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Донат не найден' });
    }
    if (donation.status !== 'succeeded' && yookassa.isConfigured()) {
      try {
        await checkAndCredit(req.params.id);
      } catch (err) {
        return res.status(502).json({ error: 'Не удалось проверить платёж: ' + err.message });
      }
    }
    res.json(await models.findDonationById(req.params.id));
  })
);

// Called by YooKassa itself when a payment's status changes. Never trust the
// webhook body's status field — anyone can POST here — so we re-fetch the
// payment from YooKassa's API ourselves before crediting anything.
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const paymentId = req.body && req.body.object && req.body.object.id;
    if (paymentId) {
      try {
        await checkAndCredit(paymentId);
      } catch (err) {
        console.error('YooKassa webhook error:', err.message);
      }
    }
    res.status(200).end();
  })
);

module.exports = router;
