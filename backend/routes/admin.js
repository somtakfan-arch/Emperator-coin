const express = require('express');
const models = require('../db/models');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../util/asyncHandler');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    res.json(await models.listUsers());
  })
);

router.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    res.json(await models.listAllTransactions(limit));
  })
);

// Mint new coins into a user's account (issuance by the bank).
router.post(
  '/mint',
  asyncHandler(async (req, res) => {
    const { username, amount, note } = req.body || {};
    const amountInt = Number(amount);
    if (!username || !Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите ник и целую сумму больше 0' });
    }
    const target = await models.findUserByUsername(username);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

    await models.transferFunds({
      fromUserId: null,
      toUserId: target.id,
      amount: amountInt,
      type: 'mint',
      note: note ? String(note).slice(0, 200) : `Эмиссия администратором ${req.user.username}`,
    });
    res.json({ balance: await models.getBalance(target.id) });
  })
);

// Burn (remove) coins from a user's account.
router.post(
  '/burn',
  asyncHandler(async (req, res) => {
    const { username, amount, note } = req.body || {};
    const amountInt = Number(amount);
    if (!username || !Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите ник и целую сумму больше 0' });
    }
    const target = await models.findUserByUsername(username);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

    try {
      await models.transferFunds({
        fromUserId: target.id,
        toUserId: null,
        amount: amountInt,
        type: 'burn',
        note: note ? String(note).slice(0, 200) : `Списание администратором ${req.user.username}`,
      });
    } catch (err) {
      if (err.message === 'INSUFFICIENT_FUNDS') {
        return res.status(400).json({ error: 'У пользователя недостаточно средств' });
      }
      throw err;
    }
    res.json({ balance: await models.getBalance(target.id) });
  })
);

router.post(
  '/freeze/:userId',
  asyncHandler(async (req, res) => {
    const target = await models.findUserById(req.params.userId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    await models.setFrozen(target.id, true);
    res.json({ ok: true });
  })
);

router.post(
  '/unfreeze/:userId',
  asyncHandler(async (req, res) => {
    const target = await models.findUserById(req.params.userId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    await models.setFrozen(target.id, false);
    res.json({ ok: true });
  })
);

module.exports = router;
