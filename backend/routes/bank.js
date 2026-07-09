const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const models = require('../db/models');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../util/asyncHandler');

const router = express.Router();
router.use(requireAuth);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    await Promise.all([
      models.executeDueScheduledTransfers(req.user.id),
      models.executeDueRecurringTransfers(req.user.id, (await models.getBankConfig()).transferFeeBps),
      models.checkLoanDefaults(req.user.id),
    ]);
    res.json({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      balance: await models.getBalance(req.user.id),
      twoFactorEnabled: req.user.two_factor_enabled,
      hasPin: !!req.user.pin_hash,
      creditScore: req.user.credit_score,
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

router.get(
  '/tier',
  asyncHandler(async (req, res) => {
    res.json(await models.getUserTier(req.user.id));
  })
);

router.post(
  '/transfer',
  asyncHandler(async (req, res) => {
    const { toUsername, amount, note, confirm, pin, delaySeconds } = req.body || {};
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

    const needsConfirm = config.largeTransferThreshold > 0 && amountInt >= config.largeTransferThreshold;
    if (needsConfirm) {
      if (req.user.pin_hash) {
        const pinOk = pin && (await bcrypt.compare(String(pin), req.user.pin_hash));
        if (!pinOk) {
          const fee = Math.floor((amountInt * config.transferFeeBps) / 10000);
          return res.json({
            confirmRequired: true,
            pinRequired: true,
            fee,
            netAmount: amountInt - fee,
            message: `Крупный перевод от ${amountInt} EMP требует PIN-кода. Комиссия: ${fee} EMP.`,
          });
        }
      } else if (!confirm) {
        const fee = Math.floor((amountInt * config.transferFeeBps) / 10000);
        return res.json({
          confirmRequired: true,
          fee,
          netAmount: amountInt - fee,
          message: `Крупный перевод от ${amountInt} EMP требует подтверждения. Комиссия: ${fee} EMP.`,
        });
      }
    }

    const recipient = await models.findUserByUsername(toUsername);
    if (!recipient) return res.status(404).json({ error: 'Получатель не найден' });
    if (recipient.frozen) return res.status(403).json({ error: 'Счёт получателя заморожен' });

    // Optional "cancel window": hold the transfer for a short delay instead
    // of executing it immediately, so the sender can cancel by mistake-proofing.
    if (delaySeconds && Number(delaySeconds) > 0) {
      const delay = Math.min(Number(delaySeconds), 24 * 60 * 60);
      const executeAt = new Date(Date.now() + delay * 1000).toISOString();
      let scheduledId;
      try {
        scheduledId = await models.createScheduledTransfer({
          fromUserId: req.user.id,
          toUserId: recipient.id,
          amount: amountInt,
          note: note ? String(note).slice(0, 200) : null,
          executeAt,
          kind: delay <= 60 ? 'cancel_window' : 'scheduled',
        });
      } catch (err) {
        if (err.message === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'Недостаточно средств' });
        throw err;
      }
      return res.json({ pending: true, scheduledId, executeAt, balance: await models.getBalance(req.user.id) });
    }

    let result;
    try {
      result = await models.transferBetweenUsers({
        fromUserId: req.user.id,
        toUserId: recipient.id,
        amount: amountInt,
        note: note ? String(note).slice(0, 200) : null,
        feeBps: config.transferFeeBps,
        dailyLimit: config.dailyTransferLimit,
        tierThresholds: config.tierThresholds,
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

    await models.awardAchievement(req.user.id, 'FIRST_TRANSFER');
    if (amountInt >= 10000) await models.awardAchievement(req.user.id, 'BIG_SPENDER');
    await models.incrementWeeklyProgress(req.user.id, 'WEEKLY_TRANSFERS');
    const newBalance = await models.getBalance(req.user.id);
    if (newBalance >= 100000) await models.awardAchievement(req.user.id, 'RICH');

    res.json({ balance: newBalance, fee: result.fee, groupTax: result.groupTax, netAmount: result.netAmount });
  })
);

// Split a total sum evenly across several recipients.
router.post(
  '/split-transfer',
  asyncHandler(async (req, res) => {
    const { usernames, amount, note } = req.body || {};
    const amountInt = Number(amount);
    if (!Array.isArray(usernames) || usernames.length < 2 || usernames.length > 20) {
      return res.status(400).json({ error: 'Укажите от 2 до 20 получателей' });
    }
    if (!Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите целую сумму больше 0' });
    }
    const recipients = [];
    for (const username of usernames) {
      if (username === req.user.username) return res.status(400).json({ error: 'Нельзя перевести самому себе' });
      const user = await models.findUserByUsername(username);
      if (!user) return res.status(404).json({ error: `Пользователь "${username}" не найден` });
      recipients.push(user);
    }
    const config = await models.getBankConfig();
    let results;
    try {
      results = await models.splitTransfer({
        fromUserId: req.user.id,
        recipients,
        totalAmount: amountInt,
        note: note ? String(note).slice(0, 200) : null,
        feeBps: config.transferFeeBps,
        dailyLimit: config.dailyTransferLimit,
        tierThresholds: config.tierThresholds,
      });
    } catch (err) {
      if (err.message === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'Недостаточно средств' });
      if (err.message === 'DAILY_LIMIT_EXCEEDED') return res.status(400).json({ error: 'Превышен дневной лимит переводов' });
      throw err;
    }
    await models.awardAchievement(req.user.id, 'FIRST_TRANSFER');
    await models.incrementWeeklyProgress(req.user.id, 'WEEKLY_TRANSFERS');
    res.json({ results, balance: await models.getBalance(req.user.id) });
  })
);

// --- Scheduled transfers (and the 30s "cancel window") ----------------------

router.get(
  '/scheduled',
  asyncHandler(async (req, res) => {
    res.json(await models.listScheduledForUser(req.user.id));
  })
);

router.post(
  '/scheduled/:id/cancel',
  asyncHandler(async (req, res) => {
    try {
      await models.cancelScheduledTransfer(req.params.id, req.user.id);
      res.json({ balance: await models.getBalance(req.user.id) });
    } catch (err) {
      if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Не найдено' });
      if (err.message === 'ALREADY_RESOLVED') return res.status(400).json({ error: 'Уже выполнен или отменён' });
      throw err;
    }
  })
);

// --- Recurring transfers ------------------------------------------------------

router.get(
  '/recurring',
  asyncHandler(async (req, res) => {
    res.json(await models.listRecurringForUser(req.user.id));
  })
);

router.post(
  '/recurring',
  asyncHandler(async (req, res) => {
    const { toUsername, amount, note, intervalDays } = req.body || {};
    const amountInt = Number(amount);
    const intervalInt = Number(intervalDays);
    if (!toUsername || !Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите получателя и целую сумму больше 0' });
    }
    if (!Number.isInteger(intervalInt) || intervalInt < 1) {
      return res.status(400).json({ error: 'Интервал должен быть не меньше 1 дня' });
    }
    const recipient = await models.findUserByUsername(toUsername);
    if (!recipient) return res.status(404).json({ error: 'Получатель не найден' });
    const id = await models.createRecurringTransfer({
      fromUserId: req.user.id,
      toUserId: recipient.id,
      amount: amountInt,
      note: note ? String(note).slice(0, 200) : null,
      intervalDays: intervalInt,
    });
    res.status(201).json({ id });
  })
);

router.post(
  '/recurring/:id/cancel',
  asyncHandler(async (req, res) => {
    try {
      await models.cancelRecurringTransfer(req.params.id, req.user.id);
      res.json({ ok: true });
    } catch (err) {
      if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Не найдено' });
      throw err;
    }
  })
);

// --- Favorites -----------------------------------------------------------

router.get(
  '/favorites',
  asyncHandler(async (req, res) => {
    res.json(await models.getFavorites(req.user.id));
  })
);

router.post(
  '/favorites',
  asyncHandler(async (req, res) => {
    if (!req.body?.username) return res.status(400).json({ error: 'Укажите ник' });
    await models.addFavorite(req.user.id, req.body.username);
    res.json(await models.getFavorites(req.user.id));
  })
);

router.delete(
  '/favorites/:username',
  asyncHandler(async (req, res) => {
    await models.removeFavorite(req.user.id, req.params.username);
    res.json(await models.getFavorites(req.user.id));
  })
);

// --- Pay links ("pay me X EMP") -------------------------------------------

router.get(
  '/pay-links',
  asyncHandler(async (req, res) => {
    res.json(await models.listPayLinksForUser(req.user.id));
  })
);

router.post(
  '/pay-links',
  asyncHandler(async (req, res) => {
    const amountInt = Number(req.body?.amount);
    if (!Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите целую сумму больше 0' });
    }
    const code = await models.createPayLink({
      creatorId: req.user.id,
      creatorUsername: req.user.username,
      amount: amountInt,
      note: req.body?.note ? String(req.body.note).slice(0, 200) : null,
    });
    res.status(201).json({ code });
  })
);

router.post(
  '/pay-links/:code/redeem',
  asyncHandler(async (req, res) => {
    const config = await models.getBankConfig();
    try {
      const result = await models.redeemPayLink(req.params.code, req.user.id, config.transferFeeBps);
      res.json({ ...result, balance: await models.getBalance(req.user.id) });
    } catch (err) {
      if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Ссылка не найдена' });
      if (err.message === 'ALREADY_USED') return res.status(400).json({ error: 'Ссылка уже использована' });
      if (err.message === 'CANNOT_PAY_SELF') return res.status(400).json({ error: 'Нельзя оплатить свою же ссылку' });
      if (err.message === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'Недостаточно средств' });
      throw err;
    }
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

router.post(
  '/lottery/spin',
  asyncHandler(async (req, res) => {
    try {
      const amount = await models.spinLottery(req.user.id);
      res.json({ amount, balance: await models.getBalance(req.user.id) });
    } catch (err) {
      if (err.message === 'ALREADY_SPUN_TODAY') {
        return res.status(400).json({ error: 'Сегодня уже крутили лотерею' });
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
    const tierIndex = Number(req.body?.tierIndex) || 0;
    const autoRenew = !!req.body?.autoRenew;
    if (!Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите целую сумму больше 0' });
    }
    try {
      const id = await models.createSavingsDeposit(req.user.id, amountInt, tierIndex, autoRenew);
      await models.awardAchievement(req.user.id, 'SAVER');
      await models.incrementWeeklyProgress(req.user.id, 'WEEKLY_SAVINGS');
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

router.post(
  '/savings/:id/withdraw-early',
  asyncHandler(async (req, res) => {
    try {
      const result = await models.earlyWithdrawSavings(req.params.id, req.user.id);
      res.json({ ...result, balance: await models.getBalance(req.user.id) });
    } catch (err) {
      if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Вклад не найден' });
      if (err.message === 'ALREADY_CLAIMED') return res.status(400).json({ error: 'Вклад уже забран' });
      if (err.message === 'ALREADY_MATURED') return res.status(400).json({ error: 'Вклад уже созрел, используйте обычное снятие' });
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

// --- Groups (joint accounts / clan treasuries) ------------------------------

router.get(
  '/groups/me',
  asyncHandler(async (req, res) => {
    res.json(await models.getMyGroup(req.user.id));
  })
);

router.post(
  '/groups',
  asyncHandler(async (req, res) => {
    if (!req.body?.name) return res.status(400).json({ error: 'Укажите название' });
    try {
      const id = await models.createGroup(req.user.id, req.user.username, String(req.body.name).slice(0, 50));
      res.status(201).json({ id });
    } catch (err) {
      if (err.message === 'ALREADY_IN_GROUP') return res.status(400).json({ error: 'Вы уже состоите в группе' });
      throw err;
    }
  })
);

router.post(
  '/groups/:id/invite',
  asyncHandler(async (req, res) => {
    if (!req.body?.username) return res.status(400).json({ error: 'Укажите ник' });
    try {
      await models.inviteToGroup(req.params.id, req.user.id, req.body.username);
      res.json({ ok: true });
    } catch (err) {
      if (err.message === 'NOT_LEADER') return res.status(403).json({ error: 'Только лидер может приглашать' });
      if (err.message === 'USER_NOT_FOUND') return res.status(404).json({ error: 'Пользователь не найден' });
      if (err.message === 'ALREADY_IN_GROUP') return res.status(400).json({ error: 'Пользователь уже состоит в группе' });
      throw err;
    }
  })
);

router.post(
  '/groups/leave',
  asyncHandler(async (req, res) => {
    try {
      await models.leaveGroup(req.user.id);
      res.json({ ok: true, balance: await models.getBalance(req.user.id) });
    } catch (err) {
      if (err.message === 'NOT_IN_GROUP') return res.status(400).json({ error: 'Вы не состоите в группе' });
      throw err;
    }
  })
);

router.post(
  '/groups/:id/deposit',
  asyncHandler(async (req, res) => {
    const amountInt = Number(req.body?.amount);
    if (!Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите целую сумму больше 0' });
    }
    try {
      await models.depositToGroup(req.user.id, amountInt);
      res.json({ balance: await models.getBalance(req.user.id) });
    } catch (err) {
      if (err.message === 'NOT_IN_GROUP') return res.status(400).json({ error: 'Вы не состоите в группе' });
      if (err.message === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'Недостаточно средств' });
      throw err;
    }
  })
);

router.post(
  '/groups/:id/withdraw',
  asyncHandler(async (req, res) => {
    const amountInt = Number(req.body?.amount);
    if (!Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите целую сумму больше 0' });
    }
    try {
      await models.withdrawFromGroup(req.user.id, amountInt);
      res.json({ balance: await models.getBalance(req.user.id) });
    } catch (err) {
      if (err.message === 'NOT_IN_GROUP') return res.status(400).json({ error: 'Вы не состоите в группе' });
      if (err.message === 'NOT_AUTHORIZED') return res.status(403).json({ error: 'Нужна роль лидера или казначея' });
      if (err.message === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'Недостаточно средств в казне' });
      throw err;
    }
  })
);

router.post(
  '/groups/:id/tax',
  asyncHandler(async (req, res) => {
    const taxBps = Number(req.body?.taxBps);
    if (!Number.isFinite(taxBps) || taxBps < 0) return res.status(400).json({ error: 'Некорректная ставка налога' });
    try {
      await models.setGroupTax(req.params.id, req.user.id, taxBps);
      res.json({ ok: true });
    } catch (err) {
      if (err.message === 'NOT_LEADER') return res.status(403).json({ error: 'Только лидер может менять налог' });
      throw err;
    }
  })
);

// --- Loans -----------------------------------------------------------------

router.get(
  '/loans',
  asyncHandler(async (req, res) => {
    res.json(await models.listLoansForUser(req.user.id));
  })
);

router.post(
  '/loans',
  asyncHandler(async (req, res) => {
    const { toUsername, principal, interestRateBps, termDays, collateralAmount } = req.body || {};
    const principalInt = Number(principal);
    const termInt = Number(termDays);
    if (!toUsername || !Number.isInteger(principalInt) || principalInt <= 0) {
      return res.status(400).json({ error: 'Укажите заёмщика и сумму больше 0' });
    }
    if (!Number.isInteger(termInt) || termInt < 1) {
      return res.status(400).json({ error: 'Срок должен быть не меньше 1 дня' });
    }
    try {
      const id = await models.createLoanOffer({
        lenderId: req.user.id,
        lenderUsername: req.user.username,
        borrowerUsername: toUsername,
        principal: principalInt,
        interestRateBps: Math.max(0, Number(interestRateBps) || 0),
        termDays: termInt,
        collateralAmount: Math.max(0, Number(collateralAmount) || 0),
      });
      res.status(201).json({ id });
    } catch (err) {
      if (err.message === 'USER_NOT_FOUND') return res.status(404).json({ error: 'Заёмщик не найден' });
      throw err;
    }
  })
);

router.post(
  '/loans/:id/accept',
  asyncHandler(async (req, res) => {
    try {
      await models.acceptLoan(req.params.id, req.user.id);
      res.json({ balance: await models.getBalance(req.user.id) });
    } catch (err) {
      if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Кредит не найден' });
      if (err.message === 'NOT_YOUR_OFFER') return res.status(403).json({ error: 'Это предложение не вам' });
      if (err.message === 'ALREADY_RESOLVED') return res.status(400).json({ error: 'Уже обработано' });
      if (err.message === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'Недостаточно средств (у кредитора или на залог)' });
      throw err;
    }
  })
);

router.post(
  '/loans/:id/repay',
  asyncHandler(async (req, res) => {
    const amountInt = Number(req.body?.amount);
    if (!Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите целую сумму больше 0' });
    }
    try {
      const result = await models.repayLoan(req.params.id, req.user.id, amountInt);
      if (result.paidOff) await models.awardAchievement(req.user.id, 'LOAN_REPAID');
      res.json({ ...result, balance: await models.getBalance(req.user.id) });
    } catch (err) {
      if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Кредит не найден' });
      if (err.message === 'NOT_YOUR_LOAN') return res.status(403).json({ error: 'Это не ваш кредит' });
      if (err.message === 'NOT_ACTIVE') return res.status(400).json({ error: 'Кредит не активен' });
      if (err.message === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'Недостаточно средств' });
      throw err;
    }
  })
);

// --- Auctions ----------------------------------------------------------------

router.get(
  '/auctions',
  asyncHandler(async (req, res) => {
    res.json(await models.listAuctions());
  })
);

router.post(
  '/auctions',
  asyncHandler(async (req, res) => {
    const { itemName, description, startingBid, durationHours } = req.body || {};
    const startBid = Number(startingBid);
    const duration = Number(durationHours);
    if (!itemName || !Number.isInteger(startBid) || startBid <= 0) {
      return res.status(400).json({ error: 'Укажите название лота и стартовую ставку больше 0' });
    }
    if (!Number.isFinite(duration) || duration <= 0 || duration > 24 * 14) {
      return res.status(400).json({ error: 'Длительность от 1 до 336 часов' });
    }
    const id = await models.createAuction({
      sellerId: req.user.id,
      sellerUsername: req.user.username,
      itemName: String(itemName).slice(0, 100),
      description: description ? String(description).slice(0, 300) : null,
      startingBid: startBid,
      durationHours: duration,
    });
    res.status(201).json({ id });
  })
);

router.post(
  '/auctions/:id/bid',
  asyncHandler(async (req, res) => {
    const amountInt = Number(req.body?.amount);
    if (!Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'Укажите целую сумму больше 0' });
    }
    try {
      await models.bidOnAuction(req.params.id, req.user.id, req.user.username, amountInt);
      res.json({ balance: await models.getBalance(req.user.id) });
    } catch (err) {
      if (err.message === 'NOT_FOUND') return res.status(404).json({ error: 'Лот не найден' });
      if (err.message === 'AUCTION_ENDED') return res.status(400).json({ error: 'Торги завершены' });
      if (err.message === 'CANNOT_BID_OWN_AUCTION') return res.status(400).json({ error: 'Нельзя делать ставку на свой лот' });
      if (err.message === 'BID_TOO_LOW') return res.status(400).json({ error: 'Ставка должна быть выше текущей' });
      if (err.message === 'INSUFFICIENT_FUNDS') return res.status(400).json({ error: 'Недостаточно средств' });
      throw err;
    }
  })
);

// --- Gamification ------------------------------------------------------------

router.get(
  '/achievements',
  asyncHandler(async (req, res) => {
    res.json(await models.listAchievements(req.user.id));
  })
);

router.get(
  '/quests',
  asyncHandler(async (req, res) => {
    res.json(await models.getWeeklyProgress(req.user.id));
  })
);

router.post(
  '/quests/:code/claim',
  asyncHandler(async (req, res) => {
    try {
      const reward = await models.claimWeeklyQuest(req.user.id, req.params.code);
      res.json({ reward, balance: await models.getBalance(req.user.id) });
    } catch (err) {
      if (err.message === 'QUEST_NOT_FOUND') return res.status(404).json({ error: 'Задание не найдено' });
      if (err.message === 'NOT_COMPLETE') return res.status(400).json({ error: 'Задание ещё не выполнено' });
      if (err.message === 'ALREADY_CLAIMED') return res.status(400).json({ error: 'Награда уже получена' });
      throw err;
    }
  })
);

module.exports = router;
