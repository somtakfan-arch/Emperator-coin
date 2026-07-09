const crypto = require('crypto');
const { admin, db } = require('./firestore');
const totp = require('../util/totp');

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
const loginHistoryCol = () => db.collection('loginHistory');
const favoritesCol = () => db.collection('favorites');
const scheduledTransfersCol = () => db.collection('scheduledTransfers');
const recurringTransfersCol = () => db.collection('recurringTransfers');
const payLinksCol = () => db.collection('payLinks');
const groupsCol = () => db.collection('groups');
const loansCol = () => db.collection('loans');
const auctionsCol = () => db.collection('auctions');
const achievementsCol = () => db.collection('achievements');
const weeklyQuestCol = () => db.collection('weeklyQuests');
const adminMintLimitCol = () => db.collection('adminMintLimits');

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
  adminIpWhitelist: [], // empty = no restriction
  pinRequiredAbove: 0, // 0 = disabled
  savingsTiers: [{ days: 7, rateBps: 500 }], // available lock-terms for new deposits
  earlyWithdrawalPenaltyBps: 2000, // forfeits all interest + this % of principal
  tierThresholds: [
    { name: 'Bronze', minVolume: 0, feeDiscountBps: 0 },
    { name: 'Silver', minVolume: 10000, feeDiscountBps: 50 },
    { name: 'Gold', minVolume: 100000, feeDiscountBps: 150 },
  ],
  referralBonusAmount: 0, // 0 = disabled
  lotteryPrizes: [
    { weight: 50, amount: 10 },
    { weight: 30, amount: 50 },
    { weight: 15, amount: 200 },
    { weight: 5, amount: 1000 },
  ],
  dailyMintLimit: 0, // 0 = no limit, per-admin per-day
  auctionFeeBps: 0,
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
    pin_hash: data.pinHash || null,
    role: data.role,
    frozen: data.frozen,
    balance: data.balance,
    two_factor_enabled: !!data.twoFactorEnabled,
    group_id: data.groupId || null,
    lifetime_volume: data.lifetimeVolume || 0,
    credit_score: data.creditScore != null ? data.creditScore : 500,
    referred_by: data.referredBy || null,
    created_at: toIso(data.createdAt),
  };
}

function isoWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

const QUEST_DEFS = [
  { code: 'WEEKLY_TRANSFERS', description: 'Сделать 3 перевода за неделю', target: 3, reward: 50 },
  { code: 'WEEKLY_SAVINGS', description: 'Открыть вклад за неделю', target: 1, reward: 30 },
];

const ACHIEVEMENT_DEFS = {
  FIRST_TRANSFER: { description: 'Первый перевод', reward: 10 },
  BIG_SPENDER: { description: 'Перевод на 10 000 EMP и больше за раз', reward: 25 },
  SAVER: { description: 'Открыт первый вклад', reward: 10 },
  LOAN_REPAID: { description: 'Кредит погашен полностью', reward: 15 },
  RICH: { description: 'Баланс достиг 100 000 EMP', reward: 50 },
};

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
    lock_days: data.lockDays,
    auto_renew: !!data.autoRenew,
    matures_at: data.maturesAt,
    claimed: data.claimed,
    early_withdrawal: !!data.earlyWithdrawal,
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

function toScheduledRow(id, data) {
  return {
    id,
    from_username: data.fromUsername,
    to_username: data.toUsername,
    amount: data.amount,
    note: data.note,
    execute_at: data.executeAt,
    status: data.status,
    kind: data.kind,
    created_at: toIso(data.createdAt),
  };
}

function toRecurringRow(id, data) {
  return {
    id,
    to_username: data.toUsername,
    amount: data.amount,
    note: data.note,
    interval_days: data.intervalDays,
    next_run_at: data.nextRunAt,
    active: data.active,
    created_at: toIso(data.createdAt),
  };
}

function toGroupRow(id, data) {
  return {
    id,
    name: data.name,
    balance: data.balance,
    tax_bps: data.taxBps || 0,
    members: data.members || [],
    created_at: toIso(data.createdAt),
  };
}

function toLoanRow(id, data) {
  return {
    id,
    lender_username: data.lenderUsername,
    borrower_username: data.borrowerUsername,
    principal: data.principal,
    interest_rate_bps: data.interestRateBps,
    term_days: data.termDays,
    collateral_amount: data.collateralAmount || 0,
    remaining_balance: data.remainingBalance,
    status: data.status,
    due_at: data.dueAt,
    created_at: toIso(data.createdAt),
  };
}

function toAuctionRow(id, data) {
  return {
    id,
    seller_username: data.sellerUsername,
    item_name: data.itemName,
    description: data.description,
    starting_bid: data.startingBid,
    current_bid: data.currentBid,
    current_bidder_username: data.currentBidderUsername,
    ends_at: data.endsAt,
    status: data.status,
    created_at: toIso(data.createdAt),
  };
}

const models = {
  // Throws Error('USERNAME_TAKEN') if the username is already registered.
  async createUser(username, passwordHash, referredBy = null) {
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
        referredBy: referredBy || null,
        creditScore: 500,
        lifetimeVolume: 0,
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

  // Fee discount (basis points) from the sender's lifetime-volume tier.
  getTierForVolume(volume, tierThresholds) {
    const tiers = [...(tierThresholds || DEFAULT_CONFIG.tierThresholds)].sort((a, b) => a.minVolume - b.minVolume);
    let current = tiers[0];
    for (const tier of tiers) {
      if (volume >= tier.minVolume) current = tier;
    }
    return current;
  },

  // Peer-to-peer transfer with bank fee + rolling daily-limit enforcement,
  // optional clan/group tax, and tier-based fee discount — all applied
  // atomically in the same transaction as the balance change.
  // Throws Error('INSUFFICIENT_FUNDS') or Error('DAILY_LIMIT_EXCEEDED').
  async transferBetweenUsers({ fromUserId, toUserId, amount, note, feeBps, dailyLimit, tierThresholds }) {
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

      const tier = models.getTierForVolume(fromData.lifetimeVolume || 0, tierThresholds);
      const effectiveFeeBps = Math.max(0, (feeBps || 0) - (tier.feeDiscountBps || 0));
      const fee = Math.floor((amount * effectiveFeeBps) / 10000);

      let groupRef = null;
      let groupTax = 0;
      if (fromData.groupId) {
        groupRef = groupsCol().doc(fromData.groupId);
        const groupSnap = await tx.get(groupRef);
        if (groupSnap.exists && groupSnap.data().taxBps > 0) {
          groupTax = Math.floor((amount * groupSnap.data().taxBps) / 10000);
        } else {
          groupRef = null;
        }
      }

      const netAmount = amount - fee - groupTax;

      tx.update(fromRef, {
        balance: admin.firestore.FieldValue.increment(-amount),
        dailySentAmount: currentDailySent + amount,
        dailySentDate: today,
        lifetimeVolume: admin.firestore.FieldValue.increment(amount),
      });
      tx.update(toRef, { balance: admin.firestore.FieldValue.increment(netAmount) });
      if (fee > 0) {
        tx.set(treasuryRef(), { balance: admin.firestore.FieldValue.increment(fee) }, { merge: true });
      }
      if (groupRef && groupTax > 0) {
        tx.update(groupRef, { balance: admin.firestore.FieldValue.increment(groupTax) });
      }

      const txRef = transactionsCol().doc();
      tx.set(txRef, {
        fromUserId,
        toUserId,
        fromUsername: fromData.username,
        toUsername: toData ? toData.username : null,
        amount: netAmount,
        fee,
        groupTax,
        type: 'transfer',
        note: note || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { txId: txRef.id, fee, groupTax, netAmount };
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
    const before = await models.getBankConfig();
    await configRef().set(patch, { merge: true });
    const after = await models.getBankConfig();
    const changes = Object.keys(patch)
      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
      .map((key) => ({ key, before: before[key], after: after[key] }));
    return { config: after, changes };
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

  // `tierIndex` picks from config.savingsTiers (defaults to the first tier).
  async createSavingsDeposit(userId, amount, tierIndex = 0, autoRenew = false) {
    const config = await models.getBankConfig();
    const tiers = config.savingsTiers && config.savingsTiers.length ? config.savingsTiers : DEFAULT_CONFIG.savingsTiers;
    const tier = tiers[tierIndex] || tiers[0];
    return db.runTransaction(async (tx) => {
      const userRef = usersCol().doc(userId);
      const snap = await tx.get(userRef);
      const data = snap.data();
      if (data.balance < amount) throw new Error('INSUFFICIENT_FUNDS');

      tx.update(userRef, { balance: admin.firestore.FieldValue.increment(-amount) });

      const maturesAt = new Date(Date.now() + tier.days * 24 * 60 * 60 * 1000).toISOString();
      const depositRef = savingsCol().doc();
      tx.set(depositRef, {
        userId,
        username: data.username,
        amount,
        interestRateBps: tier.rateBps,
        lockDays: tier.days,
        autoRenew: !!autoRenew,
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
        note: `Вклад на ${tier.days} дн. под ${(tier.rateBps / 100).toFixed(2)}%`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return depositRef.id;
    });
  },

  // Rolls over any matured auto-renew deposits for a user into fresh deposits
  // at the same tier. Called lazily whenever savings are listed.
  async processAutoRenewals(userId) {
    const snap = await savingsCol().where('userId', '==', userId).where('autoRenew', '==', true).get();
    for (const doc of snap.docs) {
      const deposit = doc.data();
      if (deposit.claimed) continue;
      if (new Date(deposit.maturesAt) > new Date()) continue;
      await db.runTransaction(async (tx) => {
        const ref = savingsCol().doc(doc.id);
        const fresh = await tx.get(ref);
        if (fresh.data().claimed) return;
        const interest = Math.floor((deposit.amount * deposit.interestRateBps) / 10000);
        const newPrincipal = deposit.amount + interest;
        tx.update(ref, { claimed: true, claimedAt: admin.firestore.FieldValue.serverTimestamp(), rolledOver: true });
        const newRef = savingsCol().doc();
        tx.set(newRef, {
          userId,
          username: deposit.username,
          amount: newPrincipal,
          interestRateBps: deposit.interestRateBps,
          lockDays: deposit.lockDays,
          autoRenew: true,
          maturesAt: new Date(Date.now() + deposit.lockDays * 24 * 60 * 60 * 1000).toISOString(),
          claimed: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
    }
  },

  // Withdraw before maturity: forfeits all interest plus a configurable
  // penalty percentage of the principal. Throws Error('NOT_FOUND'),
  // Error('ALREADY_CLAIMED'), or Error('ALREADY_MATURED') (use the normal
  // claim endpoint once matured).
  async earlyWithdrawSavings(depositId, userId) {
    const config = await models.getBankConfig();
    return db.runTransaction(async (tx) => {
      const depositRef = savingsCol().doc(depositId);
      const snap = await tx.get(depositRef);
      if (!snap.exists || snap.data().userId !== userId) throw new Error('NOT_FOUND');
      const deposit = snap.data();
      if (deposit.claimed) throw new Error('ALREADY_CLAIMED');
      if (new Date(deposit.maturesAt) <= new Date()) throw new Error('ALREADY_MATURED');

      const penalty = Math.floor((deposit.amount * config.earlyWithdrawalPenaltyBps) / 10000);
      const payout = Math.max(0, deposit.amount - penalty);

      const userRef = usersCol().doc(userId);
      tx.update(userRef, { balance: admin.firestore.FieldValue.increment(payout) });
      tx.update(depositRef, { claimed: true, claimedAt: admin.firestore.FieldValue.serverTimestamp(), earlyWithdrawal: true });

      const txRef = transactionsCol().doc();
      tx.set(txRef, {
        fromUserId: null,
        toUserId: userId,
        fromUsername: null,
        toUsername: deposit.username,
        amount: payout,
        type: 'savings_early_withdraw',
        note: `Досрочное снятие вклада, штраф ${penalty} EMP`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { payout, penalty };
    });
  },

  async listSavingsForUser(userId) {
    await models.processAutoRenewals(userId);
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

  // --- Security: raw field access, 2FA, PIN, login history --------------------

  async getUserRaw(userId) {
    const snap = await usersCol().doc(userId).get();
    return snap.exists ? { id: snap.id, ...snap.data() } : null;
  },

  async updateUserFields(userId, patch) {
    await usersCol().doc(userId).update(patch);
  },

  async updatePasswordHash(userId, newHash) {
    await usersCol().doc(userId).update({ passwordHash: newHash });
  },

  async setPinHash(userId, pinHash) {
    await usersCol().doc(userId).update({ pinHash });
  },

  async setup2FA(userId) {
    const secret = totp.randomBase32Secret();
    await usersCol().doc(userId).update({ twoFactorSecretPending: secret });
    return secret;
  },

  // Throws Error('INVALID_CODE').
  async confirm2FA(userId, code) {
    const user = await models.getUserRaw(userId);
    if (!user.twoFactorSecretPending || !totp.verifyTotp(user.twoFactorSecretPending, code)) {
      throw new Error('INVALID_CODE');
    }
    await usersCol().doc(userId).update({
      twoFactorSecret: user.twoFactorSecretPending,
      twoFactorSecretPending: admin.firestore.FieldValue.delete(),
      twoFactorEnabled: true,
    });
  },

  async disable2FA(userId) {
    await usersCol().doc(userId).update({
      twoFactorEnabled: false,
      twoFactorSecret: admin.firestore.FieldValue.delete(),
      twoFactorSecretPending: admin.firestore.FieldValue.delete(),
    });
  },

  // Throws Error('2FA_NOT_ENABLED') or Error('INVALID_CODE').
  async verifyTwoFactorCode(userId, code) {
    const user = await models.getUserRaw(userId);
    if (!user.twoFactorEnabled || !user.twoFactorSecret) throw new Error('2FA_NOT_ENABLED');
    if (!totp.verifyTotp(user.twoFactorSecret, code)) throw new Error('INVALID_CODE');
  },

  // Records a login and reports whether this IP+user-agent combo is new for
  // this account (best-effort "new device" signal, not a security guarantee).
  async recordLoginHistory(userId, ip, userAgent) {
    const deviceHash = crypto.createHash('sha256').update(`${ip}|${userAgent}`).digest('hex').slice(0, 16);
    const user = await models.getUserRaw(userId);
    const known = user.knownDeviceHashes || [];
    const isNewDevice = !known.includes(deviceHash);
    if (isNewDevice) {
      const updated = [...known, deviceHash].slice(-20);
      await usersCol().doc(userId).update({ knownDeviceHashes: updated });
    }
    await loginHistoryCol().add({
      userId,
      ip: ip || null,
      userAgent: userAgent || null,
      isNewDevice,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return isNewDevice;
  },

  async listLoginHistory(userId, limit = 50) {
    const snap = await loginHistoryCol().where('userId', '==', userId).limit(500).get();
    return snap.docs
      .map((d) => ({
        id: d.id,
        ip: d.data().ip,
        user_agent: d.data().userAgent,
        is_new_device: d.data().isNewDevice,
        created_at: toIso(d.data().createdAt),
      }))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, limit);
  },

  // --- Favorites -----------------------------------------------------------

  async getFavorites(userId) {
    const snap = await favoritesCol().doc(userId).get();
    return snap.exists ? snap.data().usernames || [] : [];
  },

  async addFavorite(userId, username) {
    await favoritesCol().doc(userId).set(
      { usernames: admin.firestore.FieldValue.arrayUnion(username) },
      { merge: true }
    );
  },

  async removeFavorite(userId, username) {
    await favoritesCol().doc(userId).set(
      { usernames: admin.firestore.FieldValue.arrayRemove(username) },
      { merge: true }
    );
  },

  // --- Scheduled transfers (also powers the 30s "cancel window") -----------
  // Funds are escrowed (deducted) immediately at creation and only credited
  // to the recipient at execution time, so a cancellation is a simple refund.

  async createScheduledTransfer({ fromUserId, toUserId, amount, note, executeAt, kind }) {
    return db.runTransaction(async (tx) => {
      const fromRef = usersCol().doc(fromUserId);
      const toRef = usersCol().doc(toUserId);
      const fromSnap = await tx.get(fromRef);
      const toSnap = await tx.get(toRef);
      if (!fromSnap.exists || fromSnap.data().balance < amount) throw new Error('INSUFFICIENT_FUNDS');
      if (!toSnap.exists) throw new Error('RECIPIENT_NOT_FOUND');

      tx.update(fromRef, { balance: admin.firestore.FieldValue.increment(-amount) });
      const ref = scheduledTransfersCol().doc();
      tx.set(ref, {
        fromUserId,
        toUserId,
        fromUsername: fromSnap.data().username,
        toUsername: toSnap.data().username,
        amount,
        note: note || null,
        executeAt,
        kind: kind || 'scheduled',
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return ref.id;
    });
  },

  async listScheduledForUser(userId) {
    const snap = await scheduledTransfersCol().where('fromUserId', '==', userId).limit(200).get();
    return snap.docs
      .map((d) => toScheduledRow(d.id, d.data()))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  },

  // Throws Error('NOT_FOUND') or Error('ALREADY_RESOLVED').
  async cancelScheduledTransfer(id, userId) {
    return db.runTransaction(async (tx) => {
      const ref = scheduledTransfersCol().doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data().fromUserId !== userId) throw new Error('NOT_FOUND');
      const data = snap.data();
      if (data.status !== 'pending') throw new Error('ALREADY_RESOLVED');
      tx.update(usersCol().doc(userId), { balance: admin.firestore.FieldValue.increment(data.amount) });
      tx.update(ref, { status: 'cancelled' });
    });
  },

  // Executes any due scheduled transfers involving this user (as sender).
  // Called lazily whenever the user's transfers/balance are checked.
  async executeDueScheduledTransfers(userId) {
    const snap = await scheduledTransfersCol().where('fromUserId', '==', userId).limit(200).get();
    const now = new Date();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.status !== 'pending' || new Date(data.executeAt) > now) continue;
      let executed = false;
      await db.runTransaction(async (tx) => {
        const ref = scheduledTransfersCol().doc(doc.id);
        const fresh = await tx.get(ref);
        if (fresh.data().status !== 'pending') return;
        tx.update(usersCol().doc(data.toUserId), { balance: admin.firestore.FieldValue.increment(data.amount) });
        tx.update(ref, { status: 'executed' });
        const txRef = transactionsCol().doc();
        tx.set(txRef, {
          fromUserId: data.fromUserId,
          toUserId: data.toUserId,
          fromUsername: data.fromUsername,
          toUsername: data.toUsername,
          amount: data.amount,
          fee: 0,
          type: data.kind === 'scheduled' ? 'scheduled_transfer' : 'transfer',
          note: data.note,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        executed = true;
      });
      if (executed) {
        await models.awardAchievement(userId, 'FIRST_TRANSFER');
        if (data.amount >= 10000) await models.awardAchievement(userId, 'BIG_SPENDER');
        await models.incrementWeeklyProgress(userId, 'WEEKLY_TRANSFERS');
      }
    }
  },

  // --- Recurring transfers --------------------------------------------------

  async createRecurringTransfer({ fromUserId, toUserId, amount, note, intervalDays }) {
    const toUser = await models.findUserById(toUserId);
    const fromUser = await models.findUserById(fromUserId);
    const ref = recurringTransfersCol().doc();
    await ref.set({
      fromUserId,
      toUserId,
      fromUsername: fromUser.username,
      toUsername: toUser.username,
      amount,
      note: note || null,
      intervalDays,
      nextRunAt: new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString(),
      active: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  async listRecurringForUser(userId) {
    const snap = await recurringTransfersCol().where('fromUserId', '==', userId).limit(200).get();
    return snap.docs
      .map((d) => toRecurringRow(d.id, d.data()))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  },

  async cancelRecurringTransfer(id, userId) {
    const ref = recurringTransfersCol().doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data().fromUserId !== userId) throw new Error('NOT_FOUND');
    await ref.update({ active: false });
  },

  // Executes any due recurring transfers for this user. Insufficient funds
  // silently skips a cycle (left active for the next check) rather than
  // failing the caller's unrelated request.
  async executeDueRecurringTransfers(userId, feeBps) {
    const snap = await recurringTransfersCol().where('fromUserId', '==', userId).limit(200).get();
    const now = new Date();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (!data.active || new Date(data.nextRunAt) > now) continue;
      try {
        await models.transferBetweenUsers({
          fromUserId: data.fromUserId,
          toUserId: data.toUserId,
          amount: data.amount,
          note: data.note || 'Регулярный перевод',
          feeBps,
        });
      } catch (err) {
        continue; // insufficient funds this cycle - try again next time
      }
      await recurringTransfersCol()
        .doc(doc.id)
        .update({ nextRunAt: new Date(now.getTime() + data.intervalDays * 24 * 60 * 60 * 1000).toISOString() });
    }
  },

  // --- Pay links ("pay me X EMP", redeemable by anyone) --------------------

  async createPayLink({ creatorId, creatorUsername, amount, note }) {
    const code = crypto.randomBytes(5).toString('hex');
    await payLinksCol().doc(code).set({
      creatorId,
      creatorUsername,
      amount,
      note: note || null,
      used: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return code;
  },

  async listPayLinksForUser(userId) {
    const snap = await payLinksCol().where('creatorId', '==', userId).limit(200).get();
    return snap.docs
      .map((d) => ({
        code: d.id,
        amount: d.data().amount,
        note: d.data().note,
        used: d.data().used,
        used_by: d.data().usedBy || null,
        created_at: toIso(d.data().createdAt),
      }))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  },

  // Throws Error('NOT_FOUND'), Error('ALREADY_USED'), Error('CANNOT_PAY_SELF'),
  // or Error('INSUFFICIENT_FUNDS').
  async redeemPayLink(code, payerId, feeBps) {
    return db.runTransaction(async (tx) => {
      const linkRef = payLinksCol().doc(code);
      const linkSnap = await tx.get(linkRef);
      if (!linkSnap.exists) throw new Error('NOT_FOUND');
      const link = linkSnap.data();
      if (link.used) throw new Error('ALREADY_USED');
      if (link.creatorId === payerId) throw new Error('CANNOT_PAY_SELF');

      const payerRef = usersCol().doc(payerId);
      const creatorRef = usersCol().doc(link.creatorId);
      const payerSnap = await tx.get(payerRef);
      if (!payerSnap.exists || payerSnap.data().balance < link.amount) throw new Error('INSUFFICIENT_FUNDS');

      const fee = Math.floor((link.amount * (feeBps || 0)) / 10000);
      const netAmount = link.amount - fee;

      tx.update(payerRef, { balance: admin.firestore.FieldValue.increment(-link.amount) });
      tx.update(creatorRef, { balance: admin.firestore.FieldValue.increment(netAmount) });
      if (fee > 0) {
        tx.set(treasuryRef(), { balance: admin.firestore.FieldValue.increment(fee) }, { merge: true });
      }
      tx.update(linkRef, { used: true, usedBy: payerSnap.data().username });

      const txRef = transactionsCol().doc();
      tx.set(txRef, {
        fromUserId: payerId,
        toUserId: link.creatorId,
        fromUsername: payerSnap.data().username,
        toUsername: link.creatorUsername,
        amount: netAmount,
        fee,
        type: 'transfer',
        note: link.note || 'По платёжной ссылке',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { netAmount, fee, creatorUsername: link.creatorUsername };
    });
  },

  // --- Split / group transfer ------------------------------------------------

  // Splits `totalAmount` evenly (remainder to the first recipients) across
  // several recipients. Each leg is its own atomic transfer; a failure partway
  // through does not roll back legs that already succeeded.
  async splitTransfer({ fromUserId, recipients, totalAmount, note, feeBps, dailyLimit, tierThresholds }) {
    const base = Math.floor(totalAmount / recipients.length);
    let remainder = totalAmount - base * recipients.length;
    const results = [];
    for (const recipient of recipients) {
      const share = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
      const result = await models.transferBetweenUsers({
        fromUserId,
        toUserId: recipient.id,
        amount: share,
        note,
        feeBps,
        dailyLimit,
        tierThresholds,
      });
      results.push({ username: recipient.username, share, ...result });
    }
    return results;
  },

  // --- Groups (joint personal accounts / clan treasuries share one model) --

  // Throws Error('ALREADY_IN_GROUP').
  async createGroup(ownerId, ownerUsername, name) {
    const owner = await models.getUserRaw(ownerId);
    if (owner.groupId) throw new Error('ALREADY_IN_GROUP');
    const ref = groupsCol().doc();
    await ref.set({
      name,
      balance: 0,
      taxBps: 0,
      members: [{ userId: ownerId, username: ownerUsername, role: 'leader' }],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await usersCol().doc(ownerId).update({ groupId: ref.id });
    return ref.id;
  },

  async getMyGroup(userId) {
    const user = await models.getUserRaw(userId);
    if (!user.groupId) return null;
    const snap = await groupsCol().doc(user.groupId).get();
    return snap.exists ? toGroupRow(snap.id, snap.data()) : null;
  },

  // Throws Error('NOT_LEADER'), Error('USER_NOT_FOUND'), Error('ALREADY_IN_GROUP').
  async inviteToGroup(groupId, actingUserId, targetUsername) {
    const target = await models.findUserByUsername(targetUsername);
    if (!target) throw new Error('USER_NOT_FOUND');
    if (target.group_id) throw new Error('ALREADY_IN_GROUP');
    await db.runTransaction(async (tx) => {
      const ref = groupsCol().doc(groupId);
      const snap = await tx.get(ref);
      const group = snap.data();
      const acting = group.members.find((m) => m.userId === actingUserId);
      if (!acting || acting.role !== 'leader') throw new Error('NOT_LEADER');
      tx.update(ref, {
        members: admin.firestore.FieldValue.arrayUnion({ userId: target.id, username: target.username, role: 'member' }),
      });
      tx.update(usersCol().doc(target.id), { groupId });
    });
  },

  // Throws Error('NOT_IN_GROUP').
  async leaveGroup(userId) {
    const user = await models.getUserRaw(userId);
    if (!user.groupId) throw new Error('NOT_IN_GROUP');
    await db.runTransaction(async (tx) => {
      const ref = groupsCol().doc(user.groupId);
      const snap = await tx.get(ref);
      if (!snap.exists) {
        tx.update(usersCol().doc(userId), { groupId: admin.firestore.FieldValue.delete() });
        return;
      }
      const group = snap.data();
      const remaining = group.members.filter((m) => m.userId !== userId);
      tx.update(usersCol().doc(userId), { groupId: admin.firestore.FieldValue.delete() });
      if (remaining.length === 0) {
        // Last member leaving: refund any remaining treasury balance to them.
        if (group.balance > 0) {
          tx.update(usersCol().doc(userId), { balance: admin.firestore.FieldValue.increment(group.balance) });
        }
        tx.delete(ref);
      } else {
        const wasLeader = group.members.find((m) => m.userId === userId)?.role === 'leader';
        if (wasLeader) remaining[0].role = 'leader';
        tx.update(ref, { members: remaining });
      }
    });
  },

  // Throws Error('NOT_IN_GROUP') or Error('INSUFFICIENT_FUNDS').
  async depositToGroup(userId, amount) {
    const user = await models.getUserRaw(userId);
    if (!user.groupId) throw new Error('NOT_IN_GROUP');
    return db.runTransaction(async (tx) => {
      const userRef = usersCol().doc(userId);
      const userSnap = await tx.get(userRef);
      if (userSnap.data().balance < amount) throw new Error('INSUFFICIENT_FUNDS');
      tx.update(userRef, { balance: admin.firestore.FieldValue.increment(-amount) });
      tx.update(groupsCol().doc(user.groupId), { balance: admin.firestore.FieldValue.increment(amount) });
      const txRef = transactionsCol().doc();
      tx.set(txRef, {
        fromUserId: userId,
        toUserId: null,
        fromUsername: user.username,
        toUsername: null,
        amount,
        type: 'group_deposit',
        note: 'Взнос в казну группы',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  },

  // Throws Error('NOT_IN_GROUP'), Error('NOT_AUTHORIZED'), Error('INSUFFICIENT_FUNDS').
  async withdrawFromGroup(userId, amount) {
    const user = await models.getUserRaw(userId);
    if (!user.groupId) throw new Error('NOT_IN_GROUP');
    return db.runTransaction(async (tx) => {
      const groupRef = groupsCol().doc(user.groupId);
      const groupSnap = await tx.get(groupRef);
      const group = groupSnap.data();
      const member = group.members.find((m) => m.userId === userId);
      if (!member || (member.role !== 'leader' && member.role !== 'treasurer')) throw new Error('NOT_AUTHORIZED');
      if (group.balance < amount) throw new Error('INSUFFICIENT_FUNDS');
      tx.update(groupRef, { balance: admin.firestore.FieldValue.increment(-amount) });
      tx.update(usersCol().doc(userId), { balance: admin.firestore.FieldValue.increment(amount) });
      const txRef = transactionsCol().doc();
      tx.set(txRef, {
        fromUserId: null,
        toUserId: userId,
        fromUsername: null,
        toUsername: user.username,
        amount,
        type: 'group_withdraw',
        note: 'Вывод из казны группы',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  },

  async setGroupTax(groupId, actingUserId, taxBps) {
    await db.runTransaction(async (tx) => {
      const ref = groupsCol().doc(groupId);
      const snap = await tx.get(ref);
      const group = snap.data();
      const acting = group.members.find((m) => m.userId === actingUserId);
      if (!acting || acting.role !== 'leader') throw new Error('NOT_LEADER');
      tx.update(ref, { taxBps: Math.max(0, Math.min(10000, taxBps)) });
    });
  },

  // --- Loans -----------------------------------------------------------------

  // Throws Error('USER_NOT_FOUND').
  async createLoanOffer({ lenderId, lenderUsername, borrowerUsername, principal, interestRateBps, termDays, collateralAmount }) {
    const borrower = await models.findUserByUsername(borrowerUsername);
    if (!borrower) throw new Error('USER_NOT_FOUND');
    const ref = loansCol().doc();
    await ref.set({
      lenderId,
      lenderUsername,
      borrowerId: borrower.id,
      borrowerUsername: borrower.username,
      principal,
      interestRateBps,
      termDays,
      collateralAmount: collateralAmount || 0,
      remainingBalance: 0,
      status: 'offered',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  async listLoansForUser(userId) {
    await models.checkLoanDefaults(userId);
    const [asLender, asBorrower] = await Promise.all([
      loansCol().where('lenderId', '==', userId).limit(200).get(),
      loansCol().where('borrowerId', '==', userId).limit(200).get(),
    ]);
    const seen = new Map();
    for (const d of [...asLender.docs, ...asBorrower.docs]) {
      seen.set(d.id, toLoanRow(d.id, d.data()));
    }
    return [...seen.values()].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  },

  // Throws Error('NOT_FOUND'), Error('NOT_YOUR_OFFER'), Error('ALREADY_RESOLVED'),
  // or Error('INSUFFICIENT_FUNDS').
  async acceptLoan(loanId, borrowerId) {
    return db.runTransaction(async (tx) => {
      const ref = loansCol().doc(loanId);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('NOT_FOUND');
      const loan = snap.data();
      if (loan.borrowerId !== borrowerId) throw new Error('NOT_YOUR_OFFER');
      if (loan.status !== 'offered') throw new Error('ALREADY_RESOLVED');

      const lenderRef = usersCol().doc(loan.lenderId);
      const borrowerRef = usersCol().doc(loan.borrowerId);
      const lenderSnap = await tx.get(lenderRef);
      const borrowerSnap = await tx.get(borrowerRef);
      if (!lenderSnap.exists || lenderSnap.data().balance < loan.principal) throw new Error('INSUFFICIENT_FUNDS');
      if (loan.collateralAmount > 0 && borrowerSnap.data().balance < loan.collateralAmount) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      tx.update(lenderRef, { balance: admin.firestore.FieldValue.increment(-loan.principal) });
      tx.update(borrowerRef, {
        balance: admin.firestore.FieldValue.increment(loan.principal - loan.collateralAmount),
      });

      const totalOwed = loan.principal + Math.floor((loan.principal * loan.interestRateBps) / 10000);
      tx.update(ref, {
        status: 'active',
        remainingBalance: totalOwed,
        dueAt: new Date(Date.now() + loan.termDays * 24 * 60 * 60 * 1000).toISOString(),
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const txRef = transactionsCol().doc();
      tx.set(txRef, {
        fromUserId: loan.lenderId,
        toUserId: loan.borrowerId,
        fromUsername: loan.lenderUsername,
        toUsername: loan.borrowerUsername,
        amount: loan.principal,
        type: 'loan_disbursement',
        note: `Кредит выдан, к возврату ${totalOwed} EMP`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  },

  // Throws Error('NOT_FOUND'), Error('NOT_YOUR_LOAN'), Error('NOT_ACTIVE'),
  // or Error('INSUFFICIENT_FUNDS').
  async repayLoan(loanId, borrowerId, amount) {
    return db.runTransaction(async (tx) => {
      const ref = loansCol().doc(loanId);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('NOT_FOUND');
      const loan = snap.data();
      if (loan.borrowerId !== borrowerId) throw new Error('NOT_YOUR_LOAN');
      if (loan.status !== 'active') throw new Error('NOT_ACTIVE');

      const borrowerRef = usersCol().doc(borrowerId);
      const lenderRef = usersCol().doc(loan.lenderId);
      const borrowerSnap = await tx.get(borrowerRef);
      if (borrowerSnap.data().balance < amount) throw new Error('INSUFFICIENT_FUNDS');

      const payment = Math.min(amount, loan.remainingBalance);
      tx.update(borrowerRef, { balance: admin.firestore.FieldValue.increment(-payment) });
      tx.update(lenderRef, { balance: admin.firestore.FieldValue.increment(payment) });

      const newRemaining = loan.remainingBalance - payment;
      const patch = { remainingBalance: newRemaining };
      if (newRemaining <= 0) {
        patch.status = 'paid';
        if (loan.collateralAmount > 0) {
          tx.update(borrowerRef, { balance: admin.firestore.FieldValue.increment(loan.collateralAmount) });
        }
        tx.update(borrowerRef, { creditScore: admin.firestore.FieldValue.increment(50) });
      }
      tx.update(ref, patch);

      const txRef = transactionsCol().doc();
      tx.set(txRef, {
        fromUserId: borrowerId,
        toUserId: loan.lenderId,
        fromUsername: loan.borrowerUsername,
        toUsername: loan.lenderUsername,
        amount: payment,
        type: 'loan_repayment',
        note: newRemaining <= 0 ? 'Кредит полностью погашен' : `Остаток долга: ${newRemaining} EMP`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { remainingBalance: Math.max(0, newRemaining), paidOff: newRemaining <= 0 };
    });
  },

  // Marks overdue active loans as defaulted and seizes any collateral.
  // Called lazily whenever a user's loans are listed.
  async checkLoanDefaults(userId) {
    const snap = await loansCol().where('borrowerId', '==', userId).limit(200).get();
    const now = new Date();
    for (const doc of snap.docs) {
      const loan = doc.data();
      if (loan.status !== 'active' || !loan.dueAt || new Date(loan.dueAt) > now) continue;
      await db.runTransaction(async (tx) => {
        const ref = loansCol().doc(doc.id);
        const fresh = await tx.get(ref);
        if (fresh.data().status !== 'active') return;
        tx.update(ref, { status: 'defaulted' });
        const borrowerRef = usersCol().doc(loan.borrowerId);
        tx.update(borrowerRef, { creditScore: admin.firestore.FieldValue.increment(-100) });
        if (loan.collateralAmount > 0) {
          tx.update(usersCol().doc(loan.lenderId), {
            balance: admin.firestore.FieldValue.increment(loan.collateralAmount),
          });
        }
      });
    }
  },

  // --- Auctions ----------------------------------------------------------

  async createAuction({ sellerId, sellerUsername, itemName, description, startingBid, durationHours }) {
    const ref = auctionsCol().doc();
    await ref.set({
      sellerId,
      sellerUsername,
      itemName,
      description: description || null,
      startingBid,
      currentBid: startingBid,
      currentBidderId: null,
      currentBidderUsername: null,
      endsAt: new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString(),
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  },

  async listAuctions() {
    await models.finalizeExpiredAuctions();
    const snap = await auctionsCol().orderBy('createdAt', 'desc').limit(100).get();
    return snap.docs.map((d) => toAuctionRow(d.id, d.data()));
  },

  // Throws Error('NOT_FOUND'), Error('AUCTION_ENDED'), Error('BID_TOO_LOW'),
  // Error('CANNOT_BID_OWN_AUCTION'), or Error('INSUFFICIENT_FUNDS').
  async bidOnAuction(auctionId, bidderId, bidderUsername, amount) {
    return db.runTransaction(async (tx) => {
      const ref = auctionsCol().doc(auctionId);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('NOT_FOUND');
      const auction = snap.data();
      if (auction.status !== 'active' || new Date(auction.endsAt) <= new Date()) throw new Error('AUCTION_ENDED');
      if (auction.sellerId === bidderId) throw new Error('CANNOT_BID_OWN_AUCTION');
      if (amount <= auction.currentBid) throw new Error('BID_TOO_LOW');

      const bidderRef = usersCol().doc(bidderId);
      const bidderSnap = await tx.get(bidderRef);
      if (!bidderSnap.exists || bidderSnap.data().balance < amount) throw new Error('INSUFFICIENT_FUNDS');

      tx.update(bidderRef, { balance: admin.firestore.FieldValue.increment(-amount) });
      if (auction.currentBidderId) {
        tx.update(usersCol().doc(auction.currentBidderId), {
          balance: admin.firestore.FieldValue.increment(auction.currentBid),
        });
      }
      tx.update(ref, { currentBid: amount, currentBidderId: bidderId, currentBidderUsername: bidderUsername });
    });
  },

  // Pays out the winning bid (minus fee) to the seller and closes the
  // auction. No-op if the auction isn't active or hasn't expired yet.
  async finalizeAuction(auctionId, auctionFeeBps) {
    await db.runTransaction(async (tx) => {
      const ref = auctionsCol().doc(auctionId);
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const auction = snap.data();
      if (auction.status !== 'active' || new Date(auction.endsAt) > new Date()) return;

      if (auction.currentBidderId) {
        const fee = Math.floor((auction.currentBid * (auctionFeeBps || 0)) / 10000);
        const payout = auction.currentBid - fee;
        tx.update(usersCol().doc(auction.sellerId), { balance: admin.firestore.FieldValue.increment(payout) });
        if (fee > 0) {
          tx.set(treasuryRef(), { balance: admin.firestore.FieldValue.increment(fee) }, { merge: true });
        }
        const txRef = transactionsCol().doc();
        tx.set(txRef, {
          fromUserId: auction.currentBidderId,
          toUserId: auction.sellerId,
          fromUsername: auction.currentBidderUsername,
          toUsername: auction.sellerUsername,
          amount: payout,
          fee,
          type: 'auction_sale',
          note: `Продано на аукционе: ${auction.itemName}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      tx.update(ref, { status: 'ended' });
    });
  },

  async finalizeExpiredAuctions() {
    const config = await models.getBankConfig();
    const snap = await auctionsCol().where('status', '==', 'active').limit(200).get();
    const now = new Date();
    for (const doc of snap.docs) {
      if (new Date(doc.data().endsAt) <= now) {
        await models.finalizeAuction(doc.id, config.auctionFeeBps);
      }
    }
  },

  // --- Achievements ----------------------------------------------------------

  async awardAchievement(userId, code) {
    const ref = achievementsCol().doc(userId);
    const snap = await ref.get();
    const unlocked = snap.exists ? snap.data().unlocked || [] : [];
    if (unlocked.some((a) => a.code === code)) return false;
    await ref.set(
      { unlocked: admin.firestore.FieldValue.arrayUnion({ code, unlockedAt: new Date().toISOString() }) },
      { merge: true }
    );
    const def = ACHIEVEMENT_DEFS[code];
    if (def && def.reward > 0) {
      await models.transferFunds({
        fromUserId: null,
        toUserId: userId,
        amount: def.reward,
        type: 'achievement_reward',
        note: `Достижение: ${def.description}`,
      });
    }
    return true;
  },

  async listAchievements(userId) {
    const snap = await achievementsCol().doc(userId).get();
    const unlocked = snap.exists ? snap.data().unlocked || [] : [];
    return Object.entries(ACHIEVEMENT_DEFS).map(([code, def]) => ({
      code,
      description: def.description,
      reward: def.reward,
      unlocked_at: unlocked.find((a) => a.code === code)?.unlockedAt || null,
    }));
  },

  // --- Account tiers -----------------------------------------------------

  async getUserTier(userId) {
    const config = await models.getBankConfig();
    const user = await models.getUserRaw(userId);
    return models.getTierForVolume(user.lifetimeVolume || 0, config.tierThresholds);
  },

  // --- Referrals -----------------------------------------------------------

  async applyReferralBonus(newUserId, referredByUsername) {
    const config = await models.getBankConfig();
    if (!config.referralBonusAmount || config.referralBonusAmount <= 0) return;
    const referrer = await models.findUserByUsername(referredByUsername);
    if (!referrer) return;
    await models.transferFunds({
      fromUserId: null,
      toUserId: referrer.id,
      amount: config.referralBonusAmount,
      type: 'referral_bonus',
      note: 'Бонус за приглашённого друга',
    });
    await models.transferFunds({
      fromUserId: null,
      toUserId: newUserId,
      amount: config.referralBonusAmount,
      type: 'referral_bonus',
      note: 'Бонус за регистрацию по приглашению',
    });
  },

  // --- Weekly quests -----------------------------------------------------

  async incrementWeeklyProgress(userId, code) {
    const key = `${userId}_${isoWeekKey()}`;
    const ref = weeklyQuestCol().doc(key);
    // Nested plain objects (not dotted-string keys) so Firestore's merge:true
    // deep-merges just this quest code's counter, leaving others untouched.
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? (snap.data().progress || {}) : {};
      const newCount = (current[code] || 0) + 1;
      tx.set(ref, { userId, weekKey: isoWeekKey(), progress: { [code]: newCount } }, { merge: true });
    });
  },

  async getWeeklyProgress(userId) {
    const key = `${userId}_${isoWeekKey()}`;
    const snap = await weeklyQuestCol().doc(key).get();
    const data = snap.exists ? snap.data() : { progress: {}, claimed: {} };
    return QUEST_DEFS.map((quest) => ({
      code: quest.code,
      description: quest.description,
      target: quest.target,
      reward: quest.reward,
      progress: Math.min(quest.target, (data.progress && data.progress[quest.code]) || 0),
      claimed: !!(data.claimed && data.claimed[quest.code]),
    }));
  },

  // Throws Error('QUEST_NOT_FOUND'), Error('NOT_COMPLETE'), or Error('ALREADY_CLAIMED').
  async claimWeeklyQuest(userId, code) {
    const quest = QUEST_DEFS.find((q) => q.code === code);
    if (!quest) throw new Error('QUEST_NOT_FOUND');
    const key = `${userId}_${isoWeekKey()}`;
    const ref = weeklyQuestCol().doc(key);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : { progress: {}, claimed: {} };
      if ((data.claimed && data.claimed[code]) || false) throw new Error('ALREADY_CLAIMED');
      if (((data.progress && data.progress[code]) || 0) < quest.target) throw new Error('NOT_COMPLETE');
      tx.set(ref, { claimed: { [code]: true } }, { merge: true });
      const userRef = usersCol().doc(userId);
      tx.update(userRef, { balance: admin.firestore.FieldValue.increment(quest.reward) });
      const txRef = transactionsCol().doc();
      tx.set(txRef, {
        fromUserId: null,
        toUserId: userId,
        fromUsername: null,
        toUsername: null,
        amount: quest.reward,
        type: 'quest_reward',
        note: quest.description,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return quest.reward;
    });
  },

  // --- Daily lottery -----------------------------------------------------

  // Throws Error('ALREADY_SPUN_TODAY').
  async spinLottery(userId) {
    const config = await models.getBankConfig();
    const prizes = config.lotteryPrizes && config.lotteryPrizes.length ? config.lotteryPrizes : DEFAULT_CONFIG.lotteryPrizes;
    return db.runTransaction(async (tx) => {
      const userRef = usersCol().doc(userId);
      const snap = await tx.get(userRef);
      const data = snap.data();
      const now = Date.now();
      if (data.lastLotteryAt && now - new Date(data.lastLotteryAt).getTime() < 24 * 60 * 60 * 1000) {
        throw new Error('ALREADY_SPUN_TODAY');
      }
      const totalWeight = prizes.reduce((sum, p) => sum + p.weight, 0);
      let roll = Math.random() * totalWeight;
      let prize = prizes[prizes.length - 1].amount;
      for (const p of prizes) {
        if (roll < p.weight) {
          prize = p.amount;
          break;
        }
        roll -= p.weight;
      }
      tx.update(userRef, {
        balance: admin.firestore.FieldValue.increment(prize),
        lastLotteryAt: new Date(now).toISOString(),
      });
      const txRef = transactionsCol().doc();
      tx.set(txRef, {
        fromUserId: null,
        toUserId: userId,
        fromUsername: null,
        toUsername: data.username,
        amount: prize,
        type: 'lottery',
        note: 'Ежедневная лотерея',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return prize;
    });
  },

  // --- Admin: moderator tools, mint cap, bulk freeze, export ------------------

  async bulkFreeze(usernames, frozen) {
    const results = { updated: [], notFound: [] };
    for (const username of usernames) {
      const user = await models.findUserByUsername(username);
      if (!user) {
        results.notFound.push(username);
        continue;
      }
      await models.setFrozen(user.id, frozen);
      results.updated.push(username);
    }
    return results;
  },

  // Throws Error('DAILY_MINT_LIMIT_EXCEEDED').
  async checkAndRecordAdminMint(adminUserId, amount) {
    const config = await models.getBankConfig();
    if (!config.dailyMintLimit || config.dailyMintLimit <= 0) return;
    const ref = adminMintLimitCol().doc(adminUserId);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const today = todayUtc();
      const data = snap.exists ? snap.data() : {};
      const mintedToday = data.date === today ? data.mintedToday || 0 : 0;
      if (mintedToday + amount > config.dailyMintLimit) {
        throw new Error('DAILY_MINT_LIMIT_EXCEEDED');
      }
      tx.set(ref, { date: today, mintedToday: mintedToday + amount }, { merge: true });
    });
  },

  async exportAllData() {
    const [users, transactions, savings, groups, loans, auctions, auditLog, config] = await Promise.all([
      models.listUsers(),
      transactionsCol().limit(5000).get().then((s) => s.docs.map((d) => toTxRow(d.id, d.data()))),
      savingsCol().limit(2000).get().then((s) => s.docs.map((d) => toSavingsRow(d.id, d.data()))),
      groupsCol().limit(500).get().then((s) => s.docs.map((d) => toGroupRow(d.id, d.data()))),
      loansCol().limit(2000).get().then((s) => s.docs.map((d) => toLoanRow(d.id, d.data()))),
      auctionsCol().limit(1000).get().then((s) => s.docs.map((d) => toAuctionRow(d.id, d.data()))),
      models.listAuditLog(2000),
      models.getBankConfig(),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      users: users.map((u) => ({ ...u, password_hash: undefined, pin_hash: undefined })),
      transactions,
      savings,
      groups,
      loans,
      auctions,
      auditLog,
      config,
    };
  },

  // --- Public showcase -----------------------------------------------------

  async getPublicShowcase() {
    return models.getEconomyStats();
  },
};

module.exports = models;
