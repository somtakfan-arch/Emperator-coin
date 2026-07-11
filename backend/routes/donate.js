const express = require('express');
const crypto = require('crypto');
const models = require('../db/models');
const yookassa = require('../util/yookassa');
const donationAlerts = require('../util/donationAlerts');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../util/asyncHandler');

const router = express.Router();

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://bedbank.netlify.app';

// --- YooKassa (card/SBP, requires the account owner to be a registered
// business or self-employed - see the /create handler below) ---------------

// Re-fetches the payment's real status from YooKassa and credits the donor
// if (and only if) YooKassa itself reports it as paid. Shared by the webhook
// and the manual "check payment" fallback so both paths behave identically.
async function checkAndCreditYookassa(paymentId) {
  const payment = await yookassa.getPayment(paymentId);
  if (payment.status === 'succeeded' && payment.paid) {
    await models.markDonationSucceeded(paymentId);
  }
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
      return res.status(503).json({ error: 'Оплата картой/СБП сейчас недоступна' });
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

// Called by YooKassa itself when a payment's status changes. Never trust the
// webhook body's status field — anyone can POST here — so we re-fetch the
// payment from YooKassa's API ourselves before crediting anything.
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    const paymentId = req.body && req.body.object && req.body.object.id;
    if (paymentId) {
      try {
        await checkAndCreditYookassa(paymentId);
      } catch (err) {
        console.error('YooKassa webhook error:', err.message);
      }
    }
    res.status(200).end();
  })
);

// --- DonationAlerts (no business registration required — usable by minors
// who already have a DonationAlerts creator account) ------------------------
// The donor pays on DonationAlerts' own page, not ours, so there's no
// per-transaction webhook we control. Instead we hand out a short code the
// donor pastes into the donation message, then search the account's recent
// donations for a message containing that code when asked to check.

async function getValidDaAccessToken() {
  const tokens = await models.getDonationAlertsTokens();
  if (!tokens) throw new Error('DONATIONALERTS_NOT_LINKED');
  if (Date.now() < tokens.expiresAt - 60000) return tokens.accessToken;
  const refreshed = await donationAlerts.refreshAccessToken(tokens.refreshToken);
  const expiresAt = Date.now() + refreshed.expires_in * 1000;
  await models.saveDonationAlertsTokens({
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    expiresAt,
  });
  return refreshed.access_token;
}

// Admin-only: kicks off the one-time OAuth link to the DonationAlerts
// creator account that will receive donations.
router.get(
  '/da/authorize-url',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (!donationAlerts.isAppConfigured()) {
      return res.status(503).json({ error: 'DonationAlerts не настроен на сервере (нет CLIENT_ID/CLIENT_SECRET/REDIRECT_URI)' });
    }
    res.json({ url: donationAlerts.getAuthorizeUrl() });
  })
);

// DonationAlerts redirects here after the admin approves access. Public by
// necessity (DonationAlerts calls it, not a logged-in browser tab), but the
// `code` is single-use and only valid together with our own client_secret
// and registered redirect_uri, so it can't be replayed by a third party.
router.get(
  '/da/callback',
  asyncHandler(async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('Отсутствует параметр code');
    try {
      const tokenData = await donationAlerts.exchangeCode(code);
      await models.saveDonationAlertsTokens({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + tokenData.expires_in * 1000,
      });
      res.send('DonationAlerts успешно привязан. Можно закрыть эту вкладку и вернуться в админ-панель.');
    } catch (err) {
      res.status(500).send('Ошибка привязки DonationAlerts: ' + err.message);
    }
  })
);

router.post(
  '/da/create',
  requireAuth,
  asyncHandler(async (req, res) => {
    const config = await models.getBankConfig();
    if (!config.donationAlertsPageUrl) {
      return res.status(503).json({ error: 'Приём донатов через DonationAlerts ещё не настроен' });
    }
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    await models.createDonationClaim({ userId: req.user.id, username: req.user.username, code });
    res.json({
      code,
      donationAlertsUrl: config.donationAlertsPageUrl,
      empPerRub: config.empPerRub,
      minDonationRub: config.minDonationRub,
    });
  })
);

router.post(
  '/da/:code/check',
  requireAuth,
  asyncHandler(async (req, res) => {
    const code = req.params.code.toUpperCase();
    const donation = await models.findDonationById(code);
    if (!donation || donation.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Заявка не найдена' });
    }
    if (donation.status === 'succeeded') {
      return res.json(donation);
    }

    let accessToken;
    try {
      accessToken = await getValidDaAccessToken();
    } catch (err) {
      return res.status(503).json({ error: 'DonationAlerts ещё не привязан администратором' });
    }

    const config = await models.getBankConfig();
    try {
      const donations = await donationAlerts.listDonations(accessToken, 1);
      const match = donations.find(
        (d) => d.currency === 'RUB' && typeof d.message === 'string' && d.message.toUpperCase().includes(code)
      );
      if (match) {
        const amountRub = Number(match.amount);
        const empAmount = Math.round(amountRub * config.empPerRub);
        await models.matchDonationClaim({ code, providerDonationId: String(match.id), amountRub, empAmount });
      }
    } catch (err) {
      return res.status(502).json({ error: 'Не удалось проверить донаты: ' + err.message });
    }

    res.json(await models.findDonationById(code));
  })
);

// --- Shared -----------------------------------------------------------------

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
// Only applies to YooKassa donations — DonationAlerts claims use
// /da/:code/check instead, since checking them means a different API call.
router.post(
  '/:id/check',
  requireAuth,
  asyncHandler(async (req, res) => {
    const donation = await models.findDonationById(req.params.id);
    if (!donation || donation.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Донат не найден' });
    }
    if (donation.provider !== 'yookassa') {
      return res.status(400).json({ error: 'Для DonationAlerts используйте /da/:code/check' });
    }
    if (donation.status !== 'succeeded' && yookassa.isConfigured()) {
      try {
        await checkAndCreditYookassa(req.params.id);
      } catch (err) {
        return res.status(502).json({ error: 'Не удалось проверить платёж: ' + err.message });
      }
    }
    res.json(await models.findDonationById(req.params.id));
  })
);

module.exports = router;
