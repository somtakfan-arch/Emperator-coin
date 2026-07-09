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

// Builds the API app. Routes are mounted at the root (no /api prefix) so the
// same app can be reused both locally (server.js adds the /api prefix itself)
// and as a Netlify Function (Netlify strips the function path prefix, so the
// function already only sees what comes after /api/).
function createApiApp() {
  checkEnv();
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.use('/auth', authRoutes);
  app.use('/bank', bankRoutes);
  app.use('/admin', adminRoutes);
  app.use('/plugin', pluginRoutes);

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  return app;
}

module.exports = { createApiApp };
