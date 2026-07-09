const db = require('./init');

const models = {
  createUser(username, passwordHash) {
    const insertUser = db.prepare(
      'INSERT INTO users (username, password_hash) VALUES (?, ?)'
    );
    const insertAccount = db.prepare(
      'INSERT INTO accounts (user_id, balance) VALUES (?, 0)'
    );
    const tx = db.transaction((u, h) => {
      const info = insertUser.run(u, h);
      insertAccount.run(info.lastInsertRowid);
      return info.lastInsertRowid;
    });
    return tx(username, passwordHash);
  },

  findUserByUsername(username) {
    return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  },

  findUserById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },

  getBalance(userId) {
    const row = db.prepare('SELECT balance FROM accounts WHERE user_id = ?').get(userId);
    return row ? row.balance : 0;
  },

  listUsers() {
    return db
      .prepare(
        `SELECT u.id, u.username, u.role, u.frozen, u.created_at, a.balance
         FROM users u JOIN accounts a ON a.user_id = u.id
         ORDER BY u.id ASC`
      )
      .all();
  },

  listTransactionsForUser(userId, limit = 100) {
    return db
      .prepare(
        `SELECT t.*, fu.username AS from_username, tu.username AS to_username
         FROM transactions t
         LEFT JOIN users fu ON fu.id = t.from_user_id
         LEFT JOIN users tu ON tu.id = t.to_user_id
         WHERE t.from_user_id = ? OR t.to_user_id = ?
         ORDER BY t.id DESC LIMIT ?`
      )
      .all(userId, userId, limit);
  },

  // Atomically move `amount` from one account to another and record the transaction.
  // `fromUserId` or `toUserId` may be null for mint/burn/deposit/withdraw operations.
  transferFunds({ fromUserId, toUserId, amount, type, note }) {
    const tx = db.transaction(() => {
      if (fromUserId != null) {
        const fromAccount = db
          .prepare('SELECT balance FROM accounts WHERE user_id = ?')
          .get(fromUserId);
        if (!fromAccount || fromAccount.balance < amount) {
          throw new Error('INSUFFICIENT_FUNDS');
        }
        db.prepare('UPDATE accounts SET balance = balance - ? WHERE user_id = ?').run(
          amount,
          fromUserId
        );
      }
      if (toUserId != null) {
        db.prepare('UPDATE accounts SET balance = balance + ? WHERE user_id = ?').run(
          amount,
          toUserId
        );
      }
      const info = db
        .prepare(
          `INSERT INTO transactions (from_user_id, to_user_id, amount, type, note)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(fromUserId, toUserId, amount, type, note || null);
      return info.lastInsertRowid;
    });
    return tx();
  },

  setFrozen(userId, frozen) {
    db.prepare('UPDATE users SET frozen = ? WHERE id = ?').run(frozen ? 1 : 0, userId);
  },

  createLinkCode(userId, code, expiresAt) {
    db.prepare('DELETE FROM link_codes WHERE user_id = ?').run(userId);
    db.prepare(
      'INSERT INTO link_codes (code, user_id, expires_at) VALUES (?, ?, ?)'
    ).run(code, userId, expiresAt);
  },

  consumeLinkCode(code) {
    const row = db.prepare('SELECT * FROM link_codes WHERE code = ?').get(code);
    if (!row) return null;
    if (row.used) return null;
    if (new Date(row.expires_at) < new Date()) return null;
    db.prepare('UPDATE link_codes SET used = 1 WHERE code = ?').run(code);
    return row;
  },

  linkMcAccount(userId, mcUuid, mcUsername) {
    db.prepare(
      `INSERT INTO mc_links (user_id, mc_uuid, mc_username)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET mc_uuid = excluded.mc_uuid, mc_username = excluded.mc_username`
    ).run(userId, mcUuid, mcUsername);
  },

  findUserByMcUuid(mcUuid) {
    return db
      .prepare(
        `SELECT u.*, ml.mc_uuid, ml.mc_username FROM users u
         JOIN mc_links ml ON ml.user_id = u.id
         WHERE ml.mc_uuid = ?`
      )
      .get(mcUuid);
  },
};

module.exports = models;
