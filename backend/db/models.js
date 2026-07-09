const { admin, db } = require('./firestore');

const usersCol = () => db.collection('users');
const usernamesCol = () => db.collection('usernames');
const transactionsCol = () => db.collection('transactions');
const mcLinksCol = () => db.collection('mcLinks');
const mcUuidIndexCol = () => db.collection('mcUuidIndex');
const linkCodesCol = () => db.collection('linkCodes');

// Firestore Timestamp -> ISO string, for JSON responses. Passes through
// anything that isn't a Timestamp (e.g. null right after a write that hasn't
// been re-read yet).
function toIso(value) {
  return value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value;
}

// Shapes a Firestore user document into the flat row shape the rest of the
// backend (routes, middleware) expects to read.
function toUserRow(id, data) {
  return {
    id,
    username: data.username,
    password_hash: data.passwordHash,
    role: data.role,
    frozen: data.frozen,
    balance: data.balance,
    created_at: toIso(data.createdAt),
  };
}

function toTxRow(id, data) {
  return {
    id,
    from_user_id: data.fromUserId,
    to_user_id: data.toUserId,
    from_username: data.fromUsername,
    to_username: data.toUsername,
    amount: data.amount,
    type: data.type,
    note: data.note,
    created_at: toIso(data.createdAt),
  };
}

const models = {
  // Throws Error('USERNAME_TAKEN') if the username is already registered.
  async createUser(username, passwordHash) {
    return db.runTransaction(async (tx) => {
      const usernameRef = usernamesCol().doc(username);
      const usernameSnap = await tx.get(usernameRef);
      if (usernameSnap.exists) {
        throw new Error('USERNAME_TAKEN');
      }
      const userRef = usersCol().doc();
      tx.set(userRef, {
        username,
        passwordHash,
        role: 'user',
        frozen: false,
        balance: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(usernameRef, { userId: userRef.id });
      return userRef.id;
    });
  },

  async findUserByUsername(username) {
    const usernameSnap = await usernamesCol().doc(username).get();
    if (!usernameSnap.exists) return null;
    return models.findUserById(usernameSnap.data().userId);
  },

  async findUserById(userId) {
    if (!userId) return null;
    const snap = await usersCol().doc(userId).get();
    if (!snap.exists) return null;
    return toUserRow(snap.id, snap.data());
  },

  async getBalance(userId) {
    const snap = await usersCol().doc(userId).get();
    return snap.exists ? snap.data().balance : 0;
  },

  async listUsers() {
    const snap = await usersCol().orderBy('createdAt', 'asc').get();
    return snap.docs.map((d) => toUserRow(d.id, d.data()));
  },

  async listAllTransactions(limit = 200) {
    const snap = await transactionsCol().orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => toTxRow(d.id, d.data()));
  },

  async listTransactionsForUser(userId, limit = 100) {
    // No orderBy here on purpose: combining an equality filter with a sort on
    // a different field needs a Firestore composite index. Sorting happens
    // in memory below instead, on a generously capped fetch.
    const FETCH_CAP = 1000;
    const [outSnap, inSnap] = await Promise.all([
      transactionsCol().where('fromUserId', '==', userId).limit(FETCH_CAP).get(),
      transactionsCol().where('toUserId', '==', userId).limit(FETCH_CAP).get(),
    ]);
    const seen = new Map();
    for (const d of [...outSnap.docs, ...inSnap.docs]) {
      seen.set(d.id, toTxRow(d.id, d.data()));
    }
    return [...seen.values()]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, limit);
  },

  // Atomically moves `amount` from one account to another and records the
  // transaction. `fromUserId` or `toUserId` may be null for mint/burn/deposit/
  // withdraw operations. Throws Error('INSUFFICIENT_FUNDS') when the source
  // account can't cover the amount.
  async transferFunds({ fromUserId, toUserId, amount, type, note }) {
    return db.runTransaction(async (tx) => {
      let fromRef = null;
      let fromData = null;
      let toRef = null;
      let toData = null;

      if (fromUserId) {
        fromRef = usersCol().doc(fromUserId);
        const fromSnap = await tx.get(fromRef);
        if (!fromSnap.exists) throw new Error('INSUFFICIENT_FUNDS');
        fromData = fromSnap.data();
        if (fromData.balance < amount) throw new Error('INSUFFICIENT_FUNDS');
      }
      if (toUserId) {
        toRef = usersCol().doc(toUserId);
        const toSnap = await tx.get(toRef);
        toData = toSnap.exists ? toSnap.data() : null;
      }

      if (fromRef) {
        tx.update(fromRef, { balance: admin.firestore.FieldValue.increment(-amount) });
      }
      if (toRef) {
        tx.update(toRef, { balance: admin.firestore.FieldValue.increment(amount) });
      }

      const txRef = transactionsCol().doc();
      tx.set(txRef, {
        fromUserId: fromUserId || null,
        toUserId: toUserId || null,
        fromUsername: fromData ? fromData.username : null,
        toUsername: toData ? toData.username : null,
        amount,
        type,
        note: note || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return txRef.id;
    });
  },

  async setFrozen(userId, frozen) {
    await usersCol().doc(userId).update({ frozen: !!frozen });
  },

  async createLinkCode(userId, code, expiresAt) {
    await linkCodesCol().doc(code).set({ userId, expiresAt, used: false });
  },

  // Returns { code, user_id } on success, or null if the code is missing,
  // already used, or expired.
  async consumeLinkCode(code) {
    return db.runTransaction(async (tx) => {
      const ref = linkCodesCol().doc(code);
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const data = snap.data();
      if (data.used) return null;
      if (new Date(data.expiresAt) < new Date()) return null;
      tx.update(ref, { used: true });
      return { code, user_id: data.userId };
    });
  },

  // Throws Error('MC_ACCOUNT_ALREADY_LINKED') if the Minecraft account is
  // already linked to a different bank account.
  async linkMcAccount(userId, mcUuid, mcUsername) {
    await db.runTransaction(async (tx) => {
      const indexRef = mcUuidIndexCol().doc(mcUuid);
      const indexSnap = await tx.get(indexRef);
      if (indexSnap.exists && indexSnap.data().userId !== userId) {
        throw new Error('MC_ACCOUNT_ALREADY_LINKED');
      }

      const linkRef = mcLinksCol().doc(userId);
      const oldLinkSnap = await tx.get(linkRef);
      if (oldLinkSnap.exists && oldLinkSnap.data().mcUuid !== mcUuid) {
        tx.delete(mcUuidIndexCol().doc(oldLinkSnap.data().mcUuid));
      }

      tx.set(linkRef, {
        mcUuid,
        mcUsername,
        linkedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.set(indexRef, { userId });
    });
  },

  async findUserByMcUuid(mcUuid) {
    const indexSnap = await mcUuidIndexCol().doc(mcUuid).get();
    if (!indexSnap.exists) return null;
    const userId = indexSnap.data().userId;
    const [user, linkSnap] = await Promise.all([
      models.findUserById(userId),
      mcLinksCol().doc(userId).get(),
    ]);
    if (!user) return null;
    return {
      ...user,
      mc_uuid: linkSnap.exists ? linkSnap.data().mcUuid : mcUuid,
      mc_username: linkSnap.exists ? linkSnap.data().mcUsername : null,
    };
  },
};

module.exports = models;
