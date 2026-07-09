// Promotes an existing user to admin. Usage: node scripts/make-admin.js <username>
const db = require('../db/init');

const username = process.argv[2];
if (!username) {
  console.error('Использование: node scripts/make-admin.js <username>');
  process.exit(1);
}

const info = db.prepare("UPDATE users SET role = 'admin' WHERE username = ?").run(username);
if (info.changes === 0) {
  console.error(`Пользователь "${username}" не найден`);
  process.exit(1);
}
console.log(`Пользователь "${username}" теперь администратор.`);
