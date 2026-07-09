require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const bankRoutes = require('./routes/bank');
const adminRoutes = require('./routes/admin');
const pluginRoutes = require('./routes/plugin');

function checkEnv() {
  if (!process.env.JWT_SECRET || !process.env.PLUGIN_API_KEY) {
    throw new Error(
      'JWT_SECRET и PLUGIN_API_KEY обязательны. Задайте их в backend/.env (локально) ' +
        'или в переменных окружения Netlify (Site settings -> Environment variables).'
    );
  }
}

// Builds the API app. Routes are mounted under /api because Netlify passes
// the original request path (e.g. /api/auth/register) through to the
// function unchanged — it does NOT strip the /.netlify/functions/api prefix,
// despite what a lot of older tutorials claim. Mounting under /api here
// keeps local dev (server.js) and the Netlify Function behaving identically.
function createApiApp() {
  checkEnv();
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/api/auth', authRoutes);
  app.use('/api/bank', bankRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/plugin', pluginRoutes);

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  return app;
}

module.exports = { createApiApp };
