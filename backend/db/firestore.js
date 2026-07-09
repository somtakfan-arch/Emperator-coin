const admin = require('firebase-admin');

if (!admin.apps.length) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    // Local/dev mode against the Firestore emulator — no real credentials needed.
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'emperator-bank-dev',
    });
  } else {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON не задан. Скопируйте .env.example в .env и вставьте ' +
          'туда JSON сервисного аккаунта Firebase (одной строкой), либо запустите Firestore ' +
          'эмулятор и задайте FIRESTORE_EMULATOR_HOST.'
      );
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
}

const db = admin.firestore();

module.exports = { admin, db };
