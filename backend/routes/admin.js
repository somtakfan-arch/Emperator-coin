const express = require('express');
const db = require('../db/init');
const models = require('../db/models');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/users', (req, res) => {
  res.json(models.listUsers());
});

router.get('/transactions', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const rows = db
    .prepare(
      `SELECT t.*, fu.username AS from_username, tu.username AS to_username
       FROM transactions t
       LEFT JOIN users fu ON fu.id = t.from_user_id
       LEFT JOIN users tu ON tu.id = t.to_user_id
       ORDER BY t.id DESC LIMIT ?`
    )
    .all(limit);
  res.json(rows);
});

// Mint new coins into a user's account (issuance by the bank).
router.post('/mint', (req, res) => {
  const { username, amount, note } = req.body || {};
  const amountInt = Number(amount);
  if (!username || !Number.isInteger(amountInt) || amountInt <= 0) {
    return res.status(400).json({ error: 'Укажите ник и целую сумму больше 0' });
  }
  const target = models.findUserByUsername(username);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

  models.transferFunds({
    fromUserId: null,
    toUserId: target.id,
    amount: amountInt,
    type: 'mint',
    note: note ? String(note).slice(0, 200) : `Эмиссия администратором ${req.user.username}`,
  });
  res.json({ balance: models.getBalance(target.id) });
});

// Burn (remove) coins from a user's account.
router.post('/burn', (req, res) => {
  const { username, amount, note } = req.body || {};
  const amountInt = Number(amount);
  if (!username || !Number.isInteger(amountInt) || amountInt <= 0) {
    return res.status(400).json({ error: 'Укажите ник и целую сумму больше 0' });
  }
  const target = models.findUserByUsername(username);
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

  try {
    models.transferFunds({
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
  res.json({ balance: models.getBalance(target.id) });
});

router.post('/freeze/:userId', (req, res) => {
  const target = models.findUserById(Number(req.params.userId));
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  models.setFrozen(target.id, true);
  res.json({ ok: true });
});

router.post('/unfreeze/:userId', (req, res) => {
  const target = models.findUserById(Number(req.params.userId));
  if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
  models.setFrozen(target.id, false);
  res.json({ ok: true });
});

module.exports = router;
