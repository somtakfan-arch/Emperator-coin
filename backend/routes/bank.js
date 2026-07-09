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

router.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    res.json(await models.listTransactionsForUser(req.user.id, limit));
  })
);

router.post(
  '/transfer',
  asyncHandler(async (req, res) => {
    const { toUsername, amount, note } = req.body || {};
    const amountInt = Number(amount);

    if (!toUsername || !Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите получателя и целую сумму больше 0' });
    }
    if (toUsername === req.user.username) {
      return res.status(400).json({ error: 'Нельзя перевести самому себе' });
    }

    const recipient = await models.findUserByUsername(toUsername);
    if (!recipient) return res.status(404).json({ error: 'Получатель не найден' });
    if (recipient.frozen) return res.status(403).json({ error: 'Счёт получателя заморожен' });

    try {
      await models.transferFunds({
        fromUserId: req.user.id,
        toUserId: recipient.id,
        amount: amountInt,
        type: 'transfer',
        note: note ? String(note).slice(0, 200) : null,
      });
    } catch (err) {
      if (err.message === 'INSUFFICIENT_FUNDS') {
        return res.status(400).json({ error: 'Недостаточно средств' });
      }
      throw err;
    }

    res.json({ balance: await models.getBalance(req.user.id) });
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

module.exports = router;
