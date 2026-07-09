const express = require('express');
const models = require('../db/models');
const { requirePluginKey } = require('../middleware/auth');
const asyncHandler = require('../util/asyncHandler');

const router = express.Router();
router.use(requirePluginKey);

// Player runs /bank link <code> in-game; the plugin calls this to finish linking
// their Minecraft UUID to the bank account that generated the code on the website.
router.post(
  '/link',
  asyncHandler(async (req, res) => {
    const { code, mcUuid, mcUsername } = req.body || {};
    if (!code || !mcUuid || !mcUsername) {
      return res.status(400).json({ error: 'code, mcUuid и mcUsername обязательны' });
    }
    const linkRow = await models.consumeLinkCode(String(code));
    if (!linkRow) {
      return res.status(400).json({ error: 'Код неверный или истёк' });
    }

    try {
      await models.linkMcAccount(linkRow.user_id, mcUuid, mcUsername);
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

// Player deposits in-game economy money into their bank account.
// The plugin is responsible for first withdrawing the amount from the
// server's in-game economy (e.g. Vault) before calling this endpoint.
router.post(
  '/deposit',
  asyncHandler(async (req, res) => {
    const { mcUuid, amount } = req.body || {};
    const amountInt = Number(amount);
    if (!mcUuid || !Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'mcUuid и целая amount > 0 обязательны' });
    }
    const user = await models.findUserByMcUuid(mcUuid);
    if (!user) return res.status(404).json({ error: 'Аккаунт не привязан к банку' });

    await models.transferFunds({
      fromUserId: null,
      toUserId: user.id,
      amount: amountInt,
      type: 'mc_deposit',
      note: `Депозит с сервера Bedsmp (${user.mc_username})`,
    });
    res.json({ balance: await models.getBalance(user.id) });
  })
);

// Player withdraws from their bank account back into the in-game economy.
// The plugin should credit the in-game economy only after this call succeeds.
router.post(
  '/withdraw',
  asyncHandler(async (req, res) => {
    const { mcUuid, amount } = req.body || {};
    const amountInt = Number(amount);
    if (!mcUuid || !Number.isInteger(amountInt) || amountInt <= 0) {
      return res.status(400).json({ error: 'mcUuid и целая amount > 0 обязательны' });
    }
    const user = await models.findUserByMcUuid(mcUuid);
    if (!user) return res.status(404).json({ error: 'Аккаунт не привязан к банку' });

    try {
      await models.transferFunds({
        fromUserId: user.id,
        toUserId: null,
        amount: amountInt,
        type: 'mc_withdraw',
        note: `Вывод на сервер Bedsmp (${user.mc_username})`,
      });
    } catch (err) {
      if (err.message === 'INSUFFICIENT_FUNDS') {
        return res.status(400).json({ error: 'Недостаточно средств на банковском счёте' });
      }
      throw err;
    }
    res.json({ balance: await models.getBalance(user.id) });
  })
);

module.exports = router;
