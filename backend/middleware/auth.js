const jwt = require('jsonwebtoken');
const models = require('../db/models');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Не авторизован' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = models.findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
    if (user.frozen) return res.status(403).json({ error: 'Счёт заморожен' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Требуются права администратора' });
  }
  next();
}

function requirePluginKey(req, res, next) {
  const header = req.headers.authorization || '';
  const key = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!key || key !== process.env.PLUGIN_API_KEY) {
    return res.status(401).json({ error: 'Неверный ключ плагина' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requirePluginKey };
