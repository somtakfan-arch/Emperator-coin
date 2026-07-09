const express = require('express');
const models = require('../db/models');
const { requirePluginKey } = require('../middleware/auth');

const router = express.Router();
router.use(requirePluginKey);

// Player runs /bank link <code> in-game; the plugin calls this to finish linking
// their Minecraft UUID to the bank account that generated the code on the website.
router.post('/link', (req, res) => {
  const { code, mcUuid, mcUsername } = req.body || {};
  if (!code || !mcUuid || !mcUsername) {
    return res.status(400).json({ error: 'code, mcUuid и mcUsername обязательны' });
  }
  const linkRow = models.consumeLinkCode(String(code));
  if (!linkRow) {
    return res.status(400).json({ error: 'Код неверный или истёк' });
  }
  models.linkMcAccount(linkRow.user_id, mcUuid, mcUsername);
  const user = models.findUserById(linkRow.user_id);
  res.json({ ok: true, username: user.username, balance: models.getBalance(user.id) });
});

router.get('/balance/:mcUuid', (req, res) => {
  const user = models.findUserByMcUuid(req.params.mcUuid);
  if (!user) return res.status(404).json({ error: 'Аккаунт не привязан к банку' });
  res.json({ username: user.username, balance: models.getBalance(user.id) });
});

// Player deposits in-game economy money into their bank account.
// The plugin is responsible for first withdrawing the amount from the
// server's in-game economy (e.g. Vault) before calling this endpoint.
router.post('/deposit', (req, res) => {
  const { mcUuid, amount } = req.body || {};
  const amountInt = Number(amount);
  if (!mcUuid || !Number.isInteger(amountInt) || amountInt <= 0) {
    return res.status(400).json({ error: 'mcUuid и целая amount > 0 обязательны' });
  }
  const user = models.findUserByMcUuid(mcUuid);
  if (!user) return res.status(404).json({ error: 'Аккаунт не привязан к банку' });

  models.transferFunds({
    fromUserId: null,
    toUserId: user.id,
    amount: amountInt,
    type: 'mc_deposit',
    note: `Депозит с сервера Bedsmp (${user.mc_username})`,
  });
  res.json({ balance: models.getBalance(user.id) });
});

// Player withdraws from their bank account back into the in-game economy.
// The plugin should credit the in-game economy only after this call succeeds.
router.post('/withdraw', (req, res) => {
  const { mcUuid, amount } = req.body || {};
  const amountInt = Number(amount);
  if (!mcUuid || !Number.isInteger(amountInt) || amountInt <= 0) {
    return res.status(400).json({ error: 'mcUuid и целая amount > 0 обязательны' });
  }
  const user = models.findUserByMcUuid(mcUuid);
  if (!user) return res.status(404).json({ error: 'Аккаунт не привязан к банку' });

  try {
    models.transferFunds({
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
  res.json({ balance: models.getBalance(user.id) });
});

module.exports = router;
