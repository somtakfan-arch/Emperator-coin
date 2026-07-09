const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const models = require('../db/models');

const router = express.Router();

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

router.post('/register', async (req, res) => {
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
  if (models.findUserByUsername(username)) {
    return res.status(409).json({ error: 'Такой ник уже занят' });
  }

  const hash = await bcrypt.hash(password, 12);
  const userId = models.createUser(username, hash);
  const user = models.findUserById(userId);
  const token = issueToken(user);
  res.status(201).json({
    token,
    user: { id: user.id, username: user.username, role: user.role },
  });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Укажите ник и пароль' });
  }
  const user = models.findUserByUsername(username);
  if (!user) return res.status(401).json({ error: 'Неверный ник или пароль' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Неверный ник или пароль' });
  if (user.frozen) return res.status(403).json({ error: 'Счёт заморожен администрацией' });

  const token = issueToken(user);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

module.exports = router;
