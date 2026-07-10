const express = require('express');
const models = require('../db/models');
const { requirePluginKey } = require('../middleware/auth');
const asyncHandler = require('../util/asyncHandler');

const router = express.Router();
router.use(requirePluginKey);

// Player runs /bank link <code> in-game; the plugin calls this to finish linking
// their Minecraft UUID to the bank account that generated the code on the website.
// `currentBalance` (the player's real Vault balance at link time) is imported as
// the starting bank balance for brand-new accounts, since the bank balance IS
// the player's real money, not a separate currency.
router.post(
  '/link',
  asyncHandler(async (req, res) => {
    const { code, mcUuid, mcUsername, currentBalance } = req.body || {};
    if (!code || !mcUuid || !mcUsername) {
      return res.status(400).json({ error: 'code, mcUuid и mcUsername обязательны' });
    }
    const linkRow = await models.consumeLinkCode(String(code));
    if (!linkRow) {
      return res.status(400).json({ error: 'Код неверный или истёк' });
    }

    const balanceInt = Number.isInteger(Number(currentBalance)) ? Number(currentBalance) : undefined;
    try {
      await models.linkMcAccount(linkRow.user_id, mcUuid, mcUsername, balanceInt);
    } catch (err) {
      if (err.message === 'MC_ACCOUNT_ALREADY_LINKED') {
        return res.status(409).json({ error: 'Этот игровой аккаунт уже привязан к другому счёту' });
      }
      throw err;
    }

    const user = await models.findUserById(linkRow.user_id);
    res.json({ ok: true, username: user.username, balance: await models.getBalance(user.id) });
  })
);

router.get(
  '/balance/:mcUuid',
  asyncHandler(async (req, res) => {
    const user = await models.findUserByMcUuid(req.params.mcUuid);
    if (!user) return res.status(404).json({ error: 'Аккаунт не привязан к банку' });
    res.json({ username: user.username, balance: await models.getBalance(user.id) });
  })
);

// Direct in-game transfer between two linked players: /bank pay <nickname> <amount>.
router.post(
  '/pay',
  asyncHandler(async (req, res) => {
    const { mcUuid, toMcUuid, amount, note } = req.body || {};
    const amountInt = Number(amount);
    if (!mcUuid || !toMcUuid || !Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'mcUuid, toMcUuid и целая amount > 0 обязательны' });
    }
    if (mcUuid === toMcUuid) {
      return res.status(400).json({ error: 'Нельзя перевести самому себе' });
    }

    const [fromUser, toUser] = await Promise.all([
      models.findUserByMcUuid(mcUuid),
      models.findUserByMcUuid(toMcUuid),
    ]);
    if (!fromUser) return res.status(404).json({ error: 'Твой аккаунт не привязан к банку' });
    if (!toUser) return res.status(404).json({ error: 'Аккаунт получателя не привязан к банку' });
    if (toUser.frozen) return res.status(403).json({ error: 'Счёт получателя заморожен' });

    const config = await models.getBankConfig();
    if (amountInt < config.minTransfer) {
      return res.status(400).json({ error: `Минимальная сумма перевода: ${config.minTransfer} EMP` });
    }
    if (config.maxTransfer > 0 && amountInt > config.maxTransfer) {
      return res.status(400).json({ error: `Максимальная сумма перевода: ${config.maxTransfer} EMP` });
    }

    let result;
    try {
      result = await models.transferBetweenUsers({
        fromUserId: fromUser.id,
        toUserId: toUser.id,
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

    res.json({
      balance: await models.getBalance(fromUser.id),
      fee: result.fee,
      netAmount: result.netAmount,
      toUsername: toUser.username,
    });
  })
);

router.get(
  '/top',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    res.json(await models.getLeaderboard(limit));
  })
);

router.post(
  '/daily/:mcUuid',
  asyncHandler(async (req, res) => {
    const user = await models.findUserByMcUuid(req.params.mcUuid);
    if (!user) return res.status(404).json({ error: 'Аккаунт не привязан к банку' });
    try {
      const amount = await models.claimDailyBonus(user.id);
      res.json({ amount, balance: await models.getBalance(user.id) });
    } catch (err) {
      if (err.message === 'DAILY_BONUS_DISABLED') {
        return res.status(400).json({ error: 'Ежедневный бонус сейчас отключён' });
      }
      if (err.message === 'ALREADY_CLAIMED_TODAY') {
        return res.status(400).json({ error: 'Бонус уже получен сегодня' });
      }
      throw err;
    }
  })
);

// Polled by the plugin on a timer to announce incoming transfers in-game.
router.get(
  '/recent/:mcUuid',
  asyncHandler(async (req, res) => {
    const user = await models.findUserByMcUuid(req.params.mcUuid);
    if (!user) return res.status(404).json({ error: 'Аккаунт не привязан к банку' });
    const since = req.query.since || null;
    res.json(await models.listIncomingTransactionsSince(user.id, since));
  })
);

// --- Balance <-> real money sync -------------------------------------------
// Polled by the plugin for each online linked player (and once on join) to
// find the gap between the bank ledger and what's actually been applied to
// their real in-game balance, and close it.

router.get(
  '/sync-status/:mcUuid',
  asyncHandler(async (req, res) => {
    const status = await models.getSyncStatus(req.params.mcUuid);
    if (!status) return res.status(404).json({ error: 'Аккаунт не привязан к банку' });
    res.json(status);
  })
);

router.post(
  '/sync-status/:mcUuid/confirm',
  asyncHandler(async (req, res) => {
    const appliedDelta = Number(req.body?.appliedDelta);
    if (!Number.isInteger(appliedDelta) || appliedDelta === 0) {
      return res.status(400).json({ error: 'appliedDelta должен быть ненулевым целым числом' });
    }
    try {
      await models.confirmSync(req.params.mcUuid, appliedDelta);
      res.json({ ok: true });
    } catch (err) {
      if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Аккаунт не привязан к банку' });
      throw err;
    }
  })
);

module.exports = router;
