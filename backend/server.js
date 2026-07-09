const path = require('path');
const express = require('express');
const { createApiApp } = require('./app');

const app = express();
app.use('/api', createApiApp());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Emperator Bank запущен: http://localhost:${PORT}`);
});
