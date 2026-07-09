require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

if (!process.env.JWT_SECRET || !process.env.PLUGIN_API_KEY) {
  console.error(
    'JWT_SECRET и PLUGIN_API_KEY обязательны. Скопируйте .env.example в .env и заполните их.'
  );
  process.exit(1);
}

const authRoutes = require('./routes/auth');
const bankRoutes = require('./routes/bank');
const adminRoutes = require('./routes/admin');
const pluginRoutes = require('./routes/plugin');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/bank', bankRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/plugin', pluginRoutes);

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Emperator Bank API запущен на порту ${PORT}`);
});
