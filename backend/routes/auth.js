const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const models = require('../db/models');
const asyncHandler = require('../util/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
}

function issuePending2FAToken(user) {
  return jwt.sign({ sub: user.id, pending2fa: true }, process.env.JWT_SECRET, {
    expiresIn: '5m',
  });
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.ip || 'unknown';
}

async function finishLogin(req, res, user) {
  const isNewDevice = await models.recordLoginHistory(user.id, getClientIp(req), req.headers['user-agent'] || '');
  const token = issueToken(user);
  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role },
    newDevice: isNewDevice,
  });
}

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { username, password, ref } = req.body || {};
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
      userId = await models.createUser(username, hash, ref || null);
    } catch (err) {
      if (err.message === 'USERNAME_TAKEN') {
        return res.status(409).json({ error: 'Такой ник уже занят' });
      }
      throw err;
    }

    if (ref) {
      await models.applyReferralBonus(userId, ref);
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

    if (user.two_factor_enabled) {
      return res.json({ twoFactorRequired: true, tempToken: issuePending2FAToken(user) });
    }

    await finishLogin(req, res, user);
  })
);

router.post(
  '/2fa/login',
  asyncHandler(async (req, res) => {
    const { tempToken, code } = req.body || {};
    if (!tempToken || !code) return res.status(400).json({ error: 'tempToken и code обязательны' });

    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Сессия входа истекла, войдите заново' });
    }
    if (!payload.pending2fa) return res.status(400).json({ error: 'Неверный токен' });

    const user = await models.findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });

    try {
      await models.verifyTwoFactorCode(user.id, code);
    } catch (err) {
      return res.status(401).json({ error: 'Неверный код 2FA' });
    }

    await finishLogin(req, res, user);
  })
);

router.get(
  '/login-history',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await models.listLoginHistory(req.user.id));
  })
);

router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Укажите текущий и новый пароль' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Новый пароль должен быть не короче 6 символов' });
    }
    const ok = await bcrypt.compare(currentPassword, req.user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Текущий пароль неверен' });

    const hash = await bcrypt.hash(newPassword, 12);
    await models.updatePasswordHash(req.user.id, hash);
    res.json({ ok: true });
  })
);

router.post(
  '/pin',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { password, pin } = req.body || {};
    if (!password || !/^\d{4,6}$/.test(pin || '')) {
      return res.status(400).json({ error: 'Пароль и PIN из 4-6 цифр обязательны' });
    }
    const ok = await bcrypt.compare(password, req.user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Пароль неверен' });

    const hash = await bcrypt.hash(pin, 10);
    await models.setPinHash(req.user.id, hash);
    res.json({ ok: true });
  })
);

router.post(
  '/2fa/setup',
  requireAuth,
  asyncHandler(async (req, res) => {
    const secret = await models.setup2FA(req.user.id);
    res.json({
      secret,
      otpauthUrl: `otpauth://totp/EmperatorBank:${encodeURIComponent(req.user.username)}?secret=${secret}&issuer=EmperatorBank`,
    });
  })
);

router.post(
  '/2fa/confirm',
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      await models.confirm2FA(req.user.id, req.body?.code);
      res.json({ ok: true });
    } catch (err) {
      if (err.message === 'INVALID_CODE') return res.status(400).json({ error: 'Неверный код' });
      throw err;
    }
  })
);

router.post(
  '/2fa/disable',
  requireAuth,
  asyncHandler(async (req, res) => {
    const ok = await bcrypt.compare(req.body?.password || '', req.user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Пароль неверен' });
    await models.disable2FA(req.user.id);
    res.json({ ok: true });
  })
);

module.exports = router;
