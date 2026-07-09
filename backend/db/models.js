const { admin, db } = require('./firestore');

const usersCol = () => db.collection('users');
const usernamesCol = () => db.collection('usernames');
const transactionsCol = () => db.collection('transactions');
const mcLinksCol = () => db.collection('mcLinks');
const mcUuidIndexCol = () => db.collection('mcUuidIndex');
const linkCodesCol = () => db.collection('linkCodes');
const configCol = () => db.collection('config');
const metaCol = () => db.collection('meta');
const paymentRequestsCol = () => db.collection('paymentRequests');
const savingsCol = () => db.collection('savings');
const auditLogCol = () => db.collection('auditLog');
const loginAttemptsCol = () => db.collection('loginAttempts');

const treasuryRef = () => metaCol().doc('treasury');
const configRef = () => configCol().doc('bank');

const DEFAULT_CONFIG = {
  transferFeeBps: 0, // basis points (1/100 of a percent), e.g. 250 = 2.5%
  minTransfer: 1,
  maxTransfer: 0, // 0 = no limit
  dailyTransferLimit: 0, // 0 = no limit
  largeTransferThreshold: 0, // 0 = confirmation step disabled
  dailyBonusAmount: 0, // 0 = disabled
  savingsInterestRateBps: 500, // 5%
  savingsLockDays: 7,
};

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MINUTES = 15;

// Firestore Timestamp -> ISO string, for JSON responses. Passes through
// anything that isn't a Timestamp (e.g. null right after a write that hasn't
// been re-read yet).
function toIso(value) {
  return value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
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
    fee: data.fee || 0,
    type: data.type,
    note: data.note,
    created_at: toIso(data.createdAt),
  };
}

function toRequestRow(id, data) {
  return {
    id,
    requester_id: data.requesterId,
    requester_username: data.requesterUsername,
    payer_id: data.payerId,
    payer_username: data.payerUsername,
    amount: data.amount,
    note: data.note,
    status: data.status,
    created_at: toIso(data.createdAt),
    resolved_at: toIso(data.resolvedAt),
  };
}

function toSavingsRow(id, data) {
  return {
    id,
    username: data.username,
    amount: data.amount,
    interest_rate_bps: data.interestRateBps,
    matures_at: data.maturesAt,
    claimed: data.claimed,
    claimed_at: toIso(data.claimedAt),
    created_at: toIso(data.createdAt),
  };
}

function toAuditRow(id, data) {
  return {
    id,
    admin_username: data.adminUsername,
    action: data.action,
    target_username: data.targetUsername,
    amount: data.amount,
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

  // In-memory filter on top of listAllTransactions - avoids adding Firestore
  // composite indexes for admin ad-hoc searches.
  async searchTransactions({ type, username, limit = 200 } = {}) {
    const snap = await transactionsCol().orderBy('createdAt', 'desc').limit(2000).get();
    let rows = snap.docs.map((d) => toTxRow(d.id, d.data()));
    if (type) rows = rows.filter((r) => r.type === type);
    if (username) {
      const needle = username.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.from_username || '').toLowerCase().includes(needle) ||
          (r.to_username || '').toLowerCase().includes(needle)
      );
    }
    return rows.slice(0, limit);
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

  // Transactions since a given ISO timestamp where the user was the recipient.
  // Used by the plugin's in-game "you received a transfer" notifications.
  async listIncomingTransactionsSince(userId, sinceIso) {
    const snap = await transactionsCol().where('toUserId', '==', userId).limit(200).get();
    const since = sinceIso ? new Date(sinceIso).getTime() : 0;
    return snap.docs
      .map((d) => toTxRow(d.id, d.data()))
      .filter((r) => new Date(r.created_at || 0).getTime() > since)
      .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  },

  async getLeaderboard(limit = 10) {
    const snap = await usersCol().orderBy('balance', 'desc').limit(limit).get();
    return snap.docs.map((d) => ({ username: d.data().username, balance: d.data().balance }));
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

  // Peer-to-peer transfer with bank fee + rolling daily-limit enforcement,
  // both applied atomically in the same transaction as the balance change.
  // Throws Error('INSUFFICIENT_FUNDS') or Error('DAILY_LIMIT_EXCEEDED').
  async transferBetweenUsers({ fromUserId, toUserId, amount, note, feeBps, dailyLimit }) {
    return db.runTransaction(async (tx) => {
      const fromRef = usersCol().doc(fromUserId);
      const toRef = usersCol().doc(toUserId);
      const fromSnap = await tx.get(fromRef);
      const toSnap = await tx.get(toRef);

      if (!fromSnap.exists || fromSnap.data().balance < amount) {
        throw new Error('INSUFFICIENT_FUNDS');
      }
      const fromData = fromSnap.data();
      const toData = toSnap.exists ? toSnap.data() : null;

      const today = todayUtc();
      const currentDailySent = fromData.dailySentDate === today ? fromData.dailySentAmount || 0 : 0;
      if (dailyLimit > 0 && currentDailySent + amount > dailyLimit) {
        throw new Error('DAILY_LIMIT_EXCEEDED');
      }

      const fee = Math.floor((amount * (feeBps || 0)) / 10000);
      const netAmount = amount - fee;

      tx.update(fromRef, {
        balance: admin.firestore.FieldValue.increment(-amount),
        dailySentAmount: currentDailySent + amount,
        dailySentDate: today,
      });
      tx.update(toRef, { balance: admin.firestore.FieldValue.increment(netAmount) });
      if (fee > 0) {
        tx.set(treasuryRef(), { balance: admin.firestore.FieldValue.increment(fee) }, { merge: true });
      }

      const txRef = transactionsCol().doc();
      tx.set(txRef, {
        fromUserId,
        toUserId,
        fromUsername: fromData.username,
        toUsername: toData ? toData.username : null,
        amount: netAmount,
        fee,
        type: 'transfer',
        note: note || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { txId: txRef.id, fee, netAmount };
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

  // --- Bank config -------------------------------------------------------

  async getBankConfig() {
    const snap = await configRef().get();
    return { ...DEFAULT_CONFIG, ...(snap.exists ? snap.data() : {}) };
  },

  async updateBankConfig(patch) {
    await configRef().set(patch, { merge: true });
    return models.getBankConfig();
  },

  // --- Treasury ------------------------------------------------------------

  async getTreasuryBalance() {
    const snap = await treasuryRef().get();
    return snap.exists ? snap.data().balance || 0 : 0;
  },

  // --- Economy stats ---------------------------------------------------

  async getEconomyStats() {
    const [users, treasuryBalance] = await Promise.all([models.listUsers(), models.getTreasuryBalance()]);
    const totalSupply = users.reduce((sum, u) => sum + u.balance, 0);
    const topHolders = [...users]
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 10)
      .map((u) => ({ username: u.username, balance: u.balance }));
    return {
      accountCount: users.length,
      totalSupply,
      averageBalance: users.length ? Math.round(totalSupply / users.length) : 0,
      treasuryBalance,
      topHolders,
    };
  },

  // --- Daily login bonus ------------------------------------------------

  // Throws Error('DAILY_BONUS_DISABLED') or Error('ALREADY_CLAIMED_TODAY').
  async claimDailyBonus(userId) {
    const config = await models.getBankConfig();
    if (!config.dailyBonusAmount || config.dailyBonusAmount <= 0) {
      throw new Error('DAILY_BONUS_DISABLED');
    }
    return db.runTransaction(async (tx) => {
      const userRef = usersCol().doc(userId);
      const snap = await tx.get(userRef);
      const data = snap.data();
      const now = Date.now();
      if (data.lastDailyBonusAt && now - new Date(data.lastDailyBonusAt).getTime() < 24 * 60 * 60 * 1000) {
        throw new Error('ALREADY_CLAIMED_TODAY');
      }
      const nowIso = new Date(now).toISOString();
      tx.update(userRef, {
        balance: admin.firestore.FieldValue.increment(config.dailyBonusAmount),
        lastDailyBonusAt: nowIso,
      });
      const txRef = transactionsCol().doc();
      tx.set(txRef, {
        fromUserId: null,
        toUserId: userId,
        fromUsername: null,
        toUsername: data.username,
        amount: config.dailyBonusAmount,
        type: 'daily_bonus',
        note: 'Ежедневный бонус',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return config.dailyBonusAmount;
    });
  },

  // --- Savings deposits --------------------------------------------------

  async createSavingsDeposit(userId, amount) {
    const config = await models.getBankConfig();
    return db.runTransaction(async (tx) => {
      const userRef = usersCol().doc(userId);
      const snap = await tx.get(userRef);
      const data = snap.data();
      if (data.balance < amount) throw new Error('INSUFFICIENT_FUNDS');

      tx.update(userRef, { balance: admin.firestore.FieldValue.increment(-amount) });

      const maturesAt = new Date(Date.now() + config.savingsLockDays * 24 * 60 * 60 * 1000).toISOString();
      const depositRef = savingsCol().doc();
      tx.set(depositRef, {
        userId,
        username: data.username,
        amount,
        interestRateBps: config.savingsInterestRateBps,
        maturesAt,
        claimed: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const txRef = transactionsCol().doc();
      tx.set(txRef, {
        fromUserId: userId,
        toUserId: null,
        fromUsername: data.username,
        toUsername: null,
        amount,
        type: 'savings_lock',
        note: `Вклад на ${config.savingsLockDays} дн. под ${(config.savingsInterestRateBps / 100).toFixed(2)}%`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return depositRef.id;
    });
  },

  async listSavingsForUser(userId) {
    const snap = await savingsCol().where('userId', '==', userId).get();
    return snap.docs
      .map((d) => toSavingsRow(d.id, d.data()))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  },

  // Throws Error('NOT_FOUND'), Error('ALREADY_CLAIMED'), or Error('NOT_MATURED').
  async claimSavingsDeposit(depositId, userId) {
    return db.runTransaction(async (tx) => {
      const depositRef = savingsCol().doc(depositId);
      const snap = await tx.get(depositRef);
      if (!snap.exists || snap.data().userId !== userId) throw new Error('NOT_FOUND');
      const deposit = snap.data();
      if (deposit.claimed) throw new Error('ALREADY_CLAIMED');
      if (new Date(deposit.maturesAt) > new Date()) throw new Error('NOT_MATURED');

      const interest = Math.floor((deposit.amount * deposit.interestRateBps) / 10000);
      const payout = deposit.amount + interest;

      const userRef = usersCol().doc(userId);
      tx.update(userRef, { balance: admin.firestore.FieldValue.increment(payout) });
      tx.update(depositRef, { claimed: true, claimedAt: admin.firestore.FieldValue.serverTimestamp() });

      const txRef = transactionsCol().doc();
      tx.set(txRef, {
        fromUserId: null,
        toUserId: userId,
        fromUsername: null,
        toUsername: deposit.username,
        amount: payout,
        type: 'savings_claim',
        note: `Вклад + проценты (${interest} EMP)`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { payout, interest };
    });
  },

  // --- Payment requests ---------------------------------------------------

  async createPaymentRequest({ requesterId, requesterUsername, payerId, payerUsername, amount, note }) {
    const ref = paymentRequestsCol().doc();
    await ref.set({
      requesterId,
      requesterUsername,
      payerId,
      payerUsername,
      amount,
      note: note || null,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  async listPaymentRequestsForUser(userId) {
    const [asRequester, asPayer] = await Promise.all([
      paymentRequestsCol().where('requesterId', '==', userId).get(),
      paymentRequestsCol().where('payerId', '==', userId).get(),
    ]);
    const seen = new Map();
    for (const d of [...asRequester.docs, ...asPayer.docs]) {
      seen.set(d.id, toRequestRow(d.id, d.data()));
    }
    return [...seen.values()].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  },

  // Throws Error('NOT_FOUND'), Error('NOT_YOUR_REQUEST'), Error('ALREADY_RESOLVED'),
  // or Error('INSUFFICIENT_FUNDS') (only when approving).
  async resolvePaymentRequest(requestId, payerId, approve, feeBps) {
    return db.runTransaction(async (tx) => {
      const reqRef = paymentRequestsCol().doc(requestId);
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists) throw new Error('NOT_FOUND');
      const request = reqSnap.data();
      if (request.payerId !== payerId) throw new Error('NOT_YOUR_REQUEST');
      if (request.status !== 'pending') throw new Error('ALREADY_RESOLVED');

      if (!approve) {
        tx.update(reqRef, { status: 'declined', resolvedAt: admin.firestore.FieldValue.serverTimestamp() });
        return { status: 'declined' };
      }

      const payerRef = usersCol().doc(request.payerId);
      const requesterRef = usersCol().doc(request.requesterId);
      const payerSnap = await tx.get(payerRef);
      if (!payerSnap.exists || payerSnap.data().balance < request.amount) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      const fee = Math.floor((request.amount * (feeBps || 0)) / 10000);
      const netAmount = request.amount - fee;

      tx.update(payerRef, { balance: admin.firestore.FieldValue.increment(-request.amount) });
      tx.update(requesterRef, { balance: admin.firestore.FieldValue.increment(netAmount) });
      if (fee > 0) {
        tx.set(treasuryRef(), { balance: admin.firestore.FieldValue.increment(fee) }, { merge: true });
      }
      tx.update(reqRef, { status: 'approved', resolvedAt: admin.firestore.FieldValue.serverTimestamp() });

      const txRef = transactionsCol().doc();
      tx.set(txRef, {
        fromUserId: request.payerId,
        toUserId: request.requesterId,
        fromUsername: request.payerUsername,
        toUsername: request.requesterUsername,
        amount: netAmount,
        fee,
        type: 'transfer',
        note: request.note || 'По запросу на перевод',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { status: 'approved' };
    });
  },

  // --- Login attempt lockout ----------------------------------------------

  // Returns remaining lockout seconds (>0) if locked, otherwise 0.
  async getLoginLockoutSeconds(username) {
    const snap = await loginAttemptsCol().doc(username).get();
    if (!snap.exists) return 0;
    const data = snap.data();
    if (!data.lockedUntil) return 0;
    const remainingMs = new Date(data.lockedUntil).getTime() - Date.now();
    return remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  },

  async recordFailedLogin(username) {
    const ref = loginAttemptsCol().doc(username);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const failCount = (snap.exists ? snap.data().failCount || 0 : 0) + 1;
      const patch = { failCount };
      if (failCount >= MAX_LOGIN_ATTEMPTS) {
        patch.lockedUntil = new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60 * 1000).toISOString();
        patch.failCount = 0;
      }
      tx.set(ref, patch, { merge: true });
    });
  },

  async resetLoginAttempts(username) {
    await loginAttemptsCol().doc(username).set({ failCount: 0, lockedUntil: null }, { merge: true });
  },

  // --- Admin audit log -----------------------------------------------------

  async recordAuditLog({ adminUsername, action, targetUsername, amount, note }) {
    await auditLogCol().add({
      adminUsername,
      action,
      targetUsername: targetUsername || null,
      amount: amount != null ? amount : null,
      note: note || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  },

  async listAuditLog(limit = 200) {
    const snap = await auditLogCol().orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map((d) => toAuditRow(d.id, d.data()));
  },
};

module.exports = models;
