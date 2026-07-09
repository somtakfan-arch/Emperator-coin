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
    if (req.query.type || req.query.username) {
      return res.json(
        await models.searchTransactions({ type: req.query.type, username: req.query.username, limit })
      );
    }
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
    await models.recordAuditLog({
      adminUsername: req.user.username,
      action: 'mint',
      targetUsername: target.username,
      amount: amountInt,
      note,
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
    await models.recordAuditLog({
      adminUsername: req.user.username,
      action: 'burn',
      targetUsername: target.username,
      amount: amountInt,
      note,
    });
    res.json({ balance: await models.getBalance(target.id) });
  })
);

router.post(
  '/freeze/:userId',
  asyncHandler(async (req, res) => {
    const target = await models.findUserById(req.params.userId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    await models.setFrozen(target.id, true);
    await models.recordAuditLog({
      adminUsername: req.user.username,
      action: 'freeze',
      targetUsername: target.username,
    });
    res.json({ ok: true });
  })
);

router.post(
  '/unfreeze/:userId',
  asyncHandler(async (req, res) => {
    const target = await models.findUserById(req.params.userId);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });
    await models.setFrozen(target.id, false);
    await models.recordAuditLog({
      adminUsername: req.user.username,
      action: 'unfreeze',
      targetUsername: target.username,
    });
    res.json({ ok: true });
  })
);

// --- Bank config ------------------------------------------------------------

router.get(
  '/config',
  asyncHandler(async (req, res) => {
    res.json(await models.getBankConfig());
  })
);

router.post(
  '/config',
  asyncHandler(async (req, res) => {
    const allowedKeys = [
      'transferFeeBps',
      'minTransfer',
      'maxTransfer',
      'dailyTransferLimit',
      'largeTransferThreshold',
      'dailyBonusAmount',
      'savingsInterestRateBps',
      'savingsLockDays',
    ];
    const patch = {};
    for (const key of allowedKeys) {
      if (req.body && req.body[key] != null) {
        const value = Number(req.body[key]);
        if (!Number.isFinite(value) || value < 0) {
          return res.status(400).json({ error: `Неверное значение для ${key}` });
        }
        patch[key] = value;
      }
    }
    const config = await models.updateBankConfig(patch);
    await models.recordAuditLog({
      adminUsername: req.user.username,
      action: 'config_update',
      note: JSON.stringify(patch),
    });
    res.json(config);
  })
);

// --- Treasury & economy stats -----------------------------------------------

router.get(
  '/treasury',
  asyncHandler(async (req, res) => {
    res.json({ balance: await models.getTreasuryBalance() });
  })
);

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    res.json(await models.getEconomyStats());
  })
);

// --- Audit log ---------------------------------------------------------------

router.get(
  '/audit-log',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    res.json(await models.listAuditLog(limit));
  })
);

// --- Bulk airdrop --------------------------------------------------------------

router.post(
  '/airdrop',
  asyncHandler(async (req, res) => {
    const amountInt = Number(req.body?.amount);
    if (!Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите целую сумму больше 0' });
    }
    const note = req.body?.note ? String(req.body.note).slice(0, 200) : `Раздача от администратора ${req.user.username}`;
    const users = await models.listUsers();
    for (const user of users) {
      await models.transferFunds({
        fromUserId: null,
        toUserId: user.id,
        amount: amountInt,
        type: 'mint',
        note,
      });
    }
    await models.recordAuditLog({
      adminUsername: req.user.username,
      action: 'airdrop',
      amount: amountInt,
      note: `${note} (получателей: ${users.length})`,
    });
    res.json({ recipients: users.length, amountEach: amountInt });
  })
);

module.exports = router;
