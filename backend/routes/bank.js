const express = require('express');
const crypto = require('crypto');
const models = require('../db/models');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../util/asyncHandler');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    res.json({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      balance: await models.getBalance(req.user.id),
    });
  })
);

// Public-facing bank settings (fee/limits/rates) so the site can show users
// what to expect before they submit a transfer.
router.get(
  '/config',
  asyncHandler(async (req, res) => {
    res.json(await models.getBankConfig());
  })
);

router.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    let rows = await models.listTransactionsForUser(req.user.id, limit);
    if (req.query.type) {
      rows = rows.filter((r) => r.type === req.query.type);
    }
    res.json(rows);
  })
);

router.get(
  '/leaderboard',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    res.json(await models.getLeaderboard(limit));
  })
);

router.post(
  '/transfer',
  asyncHandler(async (req, res) => {
    const { toUsername, amount, note, confirm } = req.body || {};
    const amountInt = Number(amount);

    if (!toUsername || !Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите получателя и целую сумму больше 0' });
    }
    if (toUsername === req.user.username) {
      return res.status(400).json({ error: 'Нельзя перевести самому себе' });
    }

    const config = await models.getBankConfig();
    if (amountInt < config.minTransfer) {
      return res.status(400).json({ error: `Минимальная сумма перевода: ${config.minTransfer} EMP` });
    }
    if (config.maxTransfer > 0 && amountInt > config.maxTransfer) {
      return res.status(400).json({ error: `Максимальная сумма перевода: ${config.maxTransfer} EMP` });
    }
    if (config.largeTransferThreshold > 0 && amountInt >= config.largeTransferThreshold && !confirm) {
      const fee = Math.floor((amountInt * config.transferFeeBps) / 10000);
      return res.json({
        confirmRequired: true,
        fee,
        netAmount: amountInt - fee,
        message: `Крупный перевод от ${amountInt} EMP требует подтверждения. Комиссия: ${fee} EMP.`,
      });
    }

    const recipient = await models.findUserByUsername(toUsername);
    if (!recipient) return res.status(404).json({ error: 'Получатель не найден' });
    if (recipient.frozen) return res.status(403).json({ error: 'Счёт получателя заморожен' });

    let result;
    try {
      result = await models.transferBetweenUsers({
        fromUserId: req.user.id,
        toUserId: recipient.id,
        amount: amountInt,
        note: note ? String(note).slice(0, 200) : null,
        feeBps: config.transferFeeBps,
        dailyLimit: config.dailyTransferLimit,
      });
    } catch (err) {
      if (err.message === 'INSUFFICIENT_FUNDS') {
        return res.status(400).json({ error: 'Недостаточно средств' });
      }
      if (err.message === 'DAILY_LIMIT_EXCEEDED') {
        return res.status(400).json({ error: `Превышен дневной лимит переводов (${config.dailyTransferLimit} EMP)` });
      }
      throw err;
    }

    res.json({ balance: await models.getBalance(req.user.id), fee: result.fee, netAmount: result.netAmount });
  })
);

// Generates a short-lived code the player types in-game (/bank link <code>)
// to connect their Bedsmp Minecraft account to this bank account.
router.post(
  '/link-code',
  asyncHandler(async (req, res) => {
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await models.createLinkCode(req.user.id, code, expiresAt);
    res.json({ code, expiresAt });
  })
);

// --- Daily login bonus -----------------------------------------------------

router.post(
  '/daily',
  asyncHandler(async (req, res) => {
    try {
      const amount = await models.claimDailyBonus(req.user.id);
      res.json({ amount, balance: await models.getBalance(req.user.id) });
    } catch (err) {
      if (err.message === 'DAILY_BONUS_DISABLED') {
        return res.status(400).json({ error: 'Ежедневный бонус сейчас отключён' });
      }
      if (err.message === 'ALREADY_CLAIMED_TODAY') {
        return res.status(400).json({ error: 'Бонус уже получен сегодня, попробуйте позже' });
      }
      throw err;
    }
  })
);

// --- Savings deposits --------------------------------------------------------

router.get(
  '/savings',
  asyncHandler(async (req, res) => {
    res.json(await models.listSavingsForUser(req.user.id));
  })
);

router.post(
  '/savings',
  asyncHandler(async (req, res) => {
    const amountInt = Number(req.body?.amount);
    if (!Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите целую сумму больше 0' });
    }
    try {
      const id = await models.createSavingsDeposit(req.user.id, amountInt);
      res.status(201).json({ id, balance: await models.getBalance(req.user.id) });
    } catch (err) {
      if (err.message === 'INSUFFICIENT_FUNDS') {
        return res.status(400).json({ error: 'Недостаточно средств' });
      }
      throw err;
    }
  })
);

router.post(
  '/savings/:id/claim',
  asyncHandler(async (req, res) => {
    try {
      const result = await models.claimSavingsDeposit(req.params.id, req.user.id);
      res.json({ ...result, balance: await models.getBalance(req.user.id) });
    } catch (err) {
      if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Вклад не найден' });
      if (err.message === 'ALREADY_CLAIMED') return res.status(400).json({ error: 'Вклад уже забран' });
      if (err.message === 'NOT_MATURED') return res.status(400).json({ error: 'Срок вклада ещё не истёк' });
      throw err;
    }
  })
);

// --- Payment requests --------------------------------------------------------

router.get(
  '/requests',
  asyncHandler(async (req, res) => {
    res.json(await models.listPaymentRequestsForUser(req.user.id));
  })
);

router.post(
  '/requests',
  asyncHandler(async (req, res) => {
    const { fromUsername, amount, note } = req.body || {};
    const amountInt = Number(amount);
    if (!fromUsername || !Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите плательщика и целую сумму больше 0' });
    }
    if (fromUsername === req.user.username) {
      return res.status(400).json({ error: 'Нельзя запросить перевод у самого себя' });
    }
    const payer = await models.findUserByUsername(fromUsername);
    if (!payer) return res.status(404).json({ error: 'Пользователь не найден' });

    const id = await models.createPaymentRequest({
      requesterId: req.user.id,
      requesterUsername: req.user.username,
      payerId: payer.id,
      payerUsername: payer.username,
      amount: amountInt,
      note: note ? String(note).slice(0, 200) : null,
    });
    res.status(201).json({ id });
  })
);

router.post(
  '/requests/:id/approve',
  asyncHandler(async (req, res) => {
    const config = await models.getBankConfig();
    try {
      const result = await models.resolvePaymentRequest(req.params.id, req.user.id, true, config.transferFeeBps);
      res.json({ ...result, balance: await models.getBalance(req.user.id) });
    } catch (err) {
      if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Запрос не найден' });
      if (err.message === 'NOT_YOUR_REQUEST') return res.status(403).json({ error: 'Это не ваш запрос' });
      if (err.message === 'ALREADY_RESOLVED') return res.status(400).json({ error: 'Запрос уже обработан' });
      if (err.message === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'Недостаточно средств' });
      throw err;
    }
  })
);

router.post(
  '/requests/:id/decline',
  asyncHandler(async (req, res) => {
    try {
      const result = await models.resolvePaymentRequest(req.params.id, req.user.id, false);
      res.json(result);
    } catch (err) {
      if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Запрос не найден' });
      if (err.message === 'NOT_YOUR_REQUEST') return res.status(403).json({ error: 'Это не ваш запрос' });
      if (err.message === 'ALREADY_RESOLVED') return res.status(400).json({ error: 'Запрос уже обработан' });
      throw err;
    }
  })
);

module.exports = router;
