const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const models = require('../db/models');
const asyncHandler = require('../util/asyncHandler');

const router = express.Router();

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Укажите ник и пароль' });
    }
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({
        error: 'Ник должен быть 3-16 символов: латинские буквы, цифры, _',
      });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Пароль должен быть не короче 6 символов' });
    }

    const hash = await bcrypt.hash(password, 12);
    let userId;
    try {
      userId = await models.createUser(username, hash);
    } catch (err) {
      if (err.message === 'USERNAME_TAKEN') {
        return res.status(409).json({ error: 'Такой ник уже занят' });
      }
      throw err;
    }

    const user = await models.findUserById(userId);
    const token = issueToken(user);
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Укажите ник и пароль' });
    }

    const lockoutSeconds = await models.getLoginLockoutSeconds(username);
    if (lockoutSeconds > 0) {
      return res.status(429).json({
        error: `Слишком много неудачных попыток входа. Повторите через ${Math.ceil(lockoutSeconds / 60)} мин.`,
      });
    }

    const user = await models.findUserByUsername(username);
    if (!user) {
      await models.recordFailedLogin(username);
      return res.status(401).json({ error: 'Неверный ник или пароль' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      await models.recordFailedLogin(username);
      return res.status(401).json({ error: 'Неверный ник или пароль' });
    }
    if (user.frozen) return res.status(403).json({ error: 'Счёт заморожен администрацией' });

    await models.resetLoginAttempts(username);
    const token = issueToken(user);
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  })
);

module.exports = router;
