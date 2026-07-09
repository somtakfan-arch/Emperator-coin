// Promotes an existing user to admin. Usage: node scripts/make-admin.js <username>
require('dotenv').config();
const models = require('../db/models');

async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error('Использование: node scripts/make-admin.js <username>');
    process.exit(1);
  }

  const user = await models.findUserByUsername(username);
  if (!user) {
    console.error(`Пользователь "${username}" не найден`);
    process.exit(1);
  }

  const { db } = require('../db/firestore');
  await db.collection('users').doc(user.id).update({ role: 'admin' });
  console.log(`Пользователь "${username}" теперь администратор.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
