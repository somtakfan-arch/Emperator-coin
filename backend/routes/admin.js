const express = require('express');
const models = require('../db/models');
const { requireAuth, requireAdmin, requireModeratorOrAdmin } = require('../middleware/auth');
const asyncHandler = require('../util/asyncHandler');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/users',
  requireModeratorOrAdmin,
  asyncHandler(async (req, res) => {
    res.json(await models.listUsers());
  })
);

router.get(
  '/transactions',
  requireAdmin,
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
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { username, amount, note } = req.body || {};
    const amountInt = Number(amount);
    if (!username || !Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите ник и целую сумму больше 0' });
    }
    const target = await models.findUserByUsername(username);
    if (!target) return res.status(404).json({ error: 'Пользователь не найден' });

    try {
      await models.checkAndRecordAdminMint(req.user.id, amountInt);
    } catch (err) {
      if (err.message === 'DAILY_MINT_LIMIT_EXCEEDED') {
        return res.status(400).json({ error: 'Превышен ваш дневной лимит эмиссии' });
      }
      throw err;
    }

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
  requireAdmin,
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
  requireModeratorOrAdmin,
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
  requireModeratorOrAdmin,
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

// Freeze/unfreeze several accounts at once by username.
router.post(
  '/freeze-bulk',
  requireModeratorOrAdmin,
  asyncHandler(async (req, res) => {
    const { usernames, frozen } = req.body || {};
    if (!Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({ error: 'Укажите список ников' });
    }
    const result = await models.bulkFreeze(usernames, !!frozen);
    await models.recordAuditLog({
      adminUsername: req.user.username,
      action: frozen ? 'freeze' : 'unfreeze',
      note: `Массово: ${result.updated.join(', ') || 'никого'}${result.notFound.length ? `; не найдены: ${result.notFound.join(', ')}` : ''}`,
    });
    res.json(result);
  })
);

// --- Bank config ------------------------------------------------------------

const NUMERIC_CONFIG_KEYS = [
  'transferFeeBps',
  'minTransfer',
  'maxTransfer',
  'dailyTransferLimit',
  'largeTransferThreshold',
  'dailyBonusAmount',
  'savingsInterestRateBps',
  'savingsLockDays',
  'pinRequiredAbove',
  'earlyWithdrawalPenaltyBps',
  'referralBonusAmount',
  'dailyMintLimit',
  'auctionFeeBps',
  'empPerRub',
  'minDonationRub',
];
const STRUCTURED_CONFIG_KEYS = ['adminIpWhitelist', 'savingsTiers', 'tierThresholds', 'lotteryPrizes'];

router.get(
  '/config',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await models.getBankConfig());
  })
);

router.post(
  '/config',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const patch = {};
    for (const key of NUMERIC_CONFIG_KEYS) {
      if (req.body && req.body[key] != null) {
        const value = Number(req.body[key]);
        if (!Number.isFinite(value) || value < 0) {
          return res.status(400).json({ error: `Неверное значение для ${key}` });
        }
        patch[key] = value;
      }
    }
    for (const key of STRUCTURED_CONFIG_KEYS) {
      if (req.body && Array.isArray(req.body[key])) {
        patch[key] = req.body[key];
      }
    }
    const { config, changes } = await models.updateBankConfig(patch);
    await models.recordAuditLog({
      adminUsername: req.user.username,
      action: 'config_update',
      note: changes.map((c) => `${c.key}: ${JSON.stringify(c.before)} -> ${JSON.stringify(c.after)}`).join('; ') || 'без изменений',
    });
    res.json(config);
  })
);

// --- Treasury & economy stats -----------------------------------------------

router.get(
  '/treasury',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ balance: await models.getTreasuryBalance() });
  })
);

router.get(
  '/stats',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await models.getEconomyStats());
  })
);

// --- Audit log ---------------------------------------------------------------

router.get(
  '/audit-log',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    res.json(await models.listAuditLog(limit));
  })
);

// --- Bulk airdrop --------------------------------------------------------------

router.post(
  '/airdrop',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const amountInt = Number(req.body?.amount);
    if (!Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите целую сумму больше 0' });
    }
    const note = req.body?.note ? String(req.body.note).slice(0, 200) : `Раздача от администратора ${req.user.username}`;
    const users = await models.listUsers();

    try {
      await models.checkAndRecordAdminMint(req.user.id, amountInt * users.length);
    } catch (err) {
      if (err.message === 'DAILY_MINT_LIMIT_EXCEEDED') {
        return res.status(400).json({ error: 'Раздача превышает ваш дневной лимит эмиссии' });
      }
      throw err;
    }

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

// --- Full data export --------------------------------------------------------

router.get(
  '/export',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json(await models.exportAllData());
  })
);

module.exports = router;
