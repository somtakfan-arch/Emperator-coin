/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Облачный слой (Firebase Auth + Firestore).

   Модель данных:
   - users/{uid}: { email, name, money, inventory, netWorth,
     effectiveWealth, tier, bestTier, age, turn, slots, updatedAt }
     `slots` — массив из 3 независимых персонажей (полное состояние
     партии каждого: деньги, инвентарь, история, черты характера) —
     см. js/slots.js. Судьбу нельзя перекрутить: персонаж слота
     закрепляется за ним, пока слот не будет очищен. Остальные поля
     (money/inventory/tier/...) — это снимок ТЕКУЩЕГО активного
     персонажа, по которому считается таблица лидеров и работает
     выдача/списание денег в админ-панели.
   - auction/{listingId}: { sellerUid, sellerName, itemId, itemName,
     price, category, createdAt }

   Если Firebase не настроен (см. js/firebase-config.js) или SDK не
   загрузился (нет сети), Cloud.enabled=false и игра работает
   полностью локально — регистрация, лидеры и аукцион скрываются,
   всё остальное продолжает работать как обычно.

   ВАЖНО О БЕЗОПАСНОСТИ: это простая клиентская интеграция без
   собственного сервера. Правила Firestore (см. README) разрешают
   писать в чужие документы любому АВТОРИЗОВАННОМУ пользователю —
   это нужно, чтобы админ-панель и аукцион вообще могли работать
   без бэкенда. Админ-панель (js/admin.js) доступна только аккаунту
   с конкретным email — это защита на клиенте, а не криптографическая
   защита: технически залогиненный пользователь мог бы через консоль
   браузера дописать себе денег напрямую в Firestore. Для игры с
   друзьями это нормальный компромисс; для публичного конкурентного
   проекта такую логику стоит перенести на Cloud Functions.
   ========================================================= */

window.Cloud = (function () {
  let enabled = false;
  let auth = null;
  let db = null;
  let currentUser = null;
  const authListeners = [];

  function isConfigured() {
    const c = window.FIREBASE_CONFIG;
    return !!(c && c.apiKey && c.projectId && c.apiKey.indexOf('ВСТАВЬ') === -1 && c.projectId.indexOf('ВСТАВЬ') === -1);
  }

  function init() {
    if (window.__firebaseSdkFailed || typeof firebase === 'undefined' || !isConfigured()) {
      enabled = false;
      return;
    }
    try {
      firebase.initializeApp(window.FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.firestore();
      enabled = true;
      auth.onAuthStateChanged((user) => {
        currentUser = user;
        authListeners.forEach((cb) => cb(user));
      });
    } catch (e) {
      console.warn('Firebase init failed, running offline:', e.message);
      enabled = false;
    }
  }

  function onAuthChange(cb) {
    authListeners.push(cb);
    if (enabled && auth) cb(auth.currentUser);
  }

  function register(email, password, name) {
    if (!enabled) return Promise.reject(new Error('Облако недоступно.'));
    return auth.createUserWithEmailAndPassword(email, password).then((cred) =>
      db.collection('users').doc(cred.user.uid).set({
        email,
        name: name || email.split('@')[0],
        money: 0,
        inventory: {},
        netWorth: 0,
        effectiveWealth: 0,
        tier: 'poor',
        bestTier: 'poor',
        age: 0,
        turn: 0,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      })
    );
  }

  function login(email, password) {
    if (!enabled) return Promise.reject(new Error('Облако недоступно.'));
    return auth.signInWithEmailAndPassword(email, password);
  }

  function logout() {
    if (!enabled) return Promise.resolve();
    return auth.signOut();
  }

  function loadProfile(uid) {
    if (!enabled) return Promise.resolve(null);
    return db.collection('users').doc(uid).get().then((doc) => (doc.exists ? doc.data() : null));
  }

  const TIER_ORDER_FOR_BEST = ['homeless', 'poor', 'middle', 'rich', 'millionaire', 'billionaire'];

  /** Синхронизирует постоянный кошелёк/инвентарь игрока с Firestore.
   *  Вызывается после каждого значимого изменения состояния.
   *  `activeSlotIndex` — какой из 3 слотов сейчас активен, чтобы
   *  админ-панель могла найти и изменить деньги именно в нём (иначе
   *  правки видны только в этом снимке, а не в реальном слоте игрока). */
  function saveState(state, activeSlotIndex) {
    if (!enabled || !currentUser) return Promise.resolve();
    const netWorth = window.ITEMS.computeInventoryNetWorth(state);
    const effectiveWealth = computeEffectiveWealth(state);
    const tier = getTier(effectiveWealth).id;
    return db.collection('users').doc(currentUser.uid).get().then((doc) => {
      const prevBest = doc.exists && doc.data().bestTier ? doc.data().bestTier : 'poor';
      const bestTier = TIER_ORDER_FOR_BEST.indexOf(tier) > TIER_ORDER_FOR_BEST.indexOf(prevBest) ? tier : prevBest;
      return db.collection('users').doc(currentUser.uid).set(
        {
          email: currentUser.email,
          name: state.name,
          money: Math.round(state.money),
          inventory: state.inventory || {},
          netWorth: Math.round(netWorth),
          effectiveWealth: Math.round(effectiveWealth),
          tier,
          bestTier,
          age: state.age,
          turn: state.turn,
          activeSlotIndex: typeof activeSlotIndex === 'number' ? activeSlotIndex : null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }).catch((e) => console.warn('Cloud save failed:', e.message));
  }

  /** Зеркалит 3 слота персонажей в облако, чтобы они не терялись
   *  при входе с другого устройства. */
  function saveSlots(slots) {
    if (!enabled || !currentUser) return Promise.resolve();
    return db
      .collection('users')
      .doc(currentUser.uid)
      .set({ slots, slotsUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
      .catch((e) => console.warn('Cloud slots save failed:', e.message));
  }

  function loadSlots() {
    if (!enabled || !currentUser) return Promise.resolve(null);
    return db
      .collection('users')
      .doc(currentUser.uid)
      .get()
      .then((doc) => (doc.exists && doc.data().slots ? doc.data().slots : null));
  }

  function getLeaderboard(limit) {
    if (!enabled) return Promise.resolve([]);
    return db.collection('users').orderBy('effectiveWealth', 'desc').limit(limit || 20).get().then((snap) => {
      const rows = [];
      snap.forEach((doc) => rows.push(Object.assign({ uid: doc.id }, doc.data())));
      return rows;
    });
  }

  /* ---------- Лента активности друзей ---------- */

  function postActivity(text) {
    if (!enabled || !currentUser) return Promise.resolve();
    return db.collection('activity').add({
      uid: currentUser.uid,
      name: currentUser.email,
      text,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    }).catch((e) => console.warn('Activity post failed:', e.message));
  }

  function listActivity(limit) {
    if (!enabled) return Promise.resolve([]);
    return db.collection('activity').orderBy('createdAt', 'desc').limit(limit || 30).get().then((snap) => {
      const rows = [];
      snap.forEach((doc) => rows.push(Object.assign({ id: doc.id }, doc.data())));
      return rows;
    });
  }

  /* ---------- Дуэли мини-игр на ставку ---------- */

  function createDuel(stake, minigameType, challengerResult) {
    if (!enabled || !currentUser) return Promise.reject(new Error('Нужно войти в аккаунт.'));
    const challengerRef = db.collection('users').doc(currentUser.uid);
    return db.runTransaction((tx) =>
      tx.get(challengerRef).then((doc) => {
        const data = doc.exists ? doc.data() : { money: 0 };
        if ((data.money || 0) < stake) throw new Error('Не хватает денег на ставку.');
        tx.update(challengerRef, { money: (data.money || 0) - stake });
        const duelRef = db.collection('duels').doc();
        tx.set(duelRef, {
          challengerUid: currentUser.uid,
          challengerName: currentUser.email,
          stake: Math.round(stake),
          minigameType,
          challengerSuccess: !!challengerResult.success,
          challengerPrecision: challengerResult.precision || 0,
          status: 'pending',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        return duelRef.id;
      })
    );
  }

  /** Firestore-таймстемп -> число мс (для сортировки без orderBy —
   *  see комментарий у listOpenDuels про составные индексы). */
  function toMillis(ts) {
    return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
  }

  function listOpenDuels() {
    if (!enabled) return Promise.resolve([]);
    // Без orderBy: where + orderBy на разных полях требует составной
    // индекс, который по умолчанию не создан — запрос падал молча.
    // Сортируем на клиенте вместо этого.
    return db.collection('duels').where('status', '==', 'pending').limit(50).get().then((snap) => {
      const rows = [];
      snap.forEach((doc) => rows.push(Object.assign({ id: doc.id }, doc.data())));
      rows.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      return rows.slice(0, 20);
    });
  }

  /** Принять дуэль: соперник тоже играет в ту же мини-игру, итог решает
   *  транзакция — кто успешнее (или точнее при равном исходе) забирает банк. */
  function acceptDuel(duelId, opponentResult) {
    if (!enabled || !currentUser) return Promise.reject(new Error('Нужно войти в аккаунт.'));
    const duelRef = db.collection('duels').doc(duelId);
    const opponentRef = db.collection('users').doc(currentUser.uid);
    return db.runTransaction((tx) =>
      tx.get(duelRef).then((duelDoc) => {
        if (!duelDoc.exists) throw new Error('Дуэль уже завершена или отменена.');
        const duel = duelDoc.data();
        if (duel.status !== 'pending') throw new Error('Дуэль уже принята другим игроком.');
        if (duel.challengerUid === currentUser.uid) throw new Error('Нельзя принять свой же вызов.');
        const challengerRef = db.collection('users').doc(duel.challengerUid);
        return tx.get(opponentRef).then((opponentDoc) =>
          tx.get(challengerRef).then((challengerDoc) => {
            const opponentData = opponentDoc.exists ? opponentDoc.data() : { money: 0 };
            const challengerData = challengerDoc.exists ? challengerDoc.data() : { money: 0 };
            if ((opponentData.money || 0) < duel.stake) throw new Error('Не хватает денег на ставку.');
            const oppSucceeded = !!opponentResult.success;
            const oppPrecision = opponentResult.precision || 0;
            const challengerWins = duel.challengerSuccess !== oppSucceeded
              ? duel.challengerSuccess
              : duel.challengerPrecision >= oppPrecision;
            const pot = duel.stake * 2;
            tx.update(opponentRef, { money: (opponentData.money || 0) - duel.stake + (challengerWins ? 0 : pot) });
            tx.update(challengerRef, { money: (challengerData.money || 0) + (challengerWins ? pot : 0) });
            tx.update(duelRef, {
              status: 'resolved',
              opponentUid: currentUser.uid,
              opponentName: currentUser.email,
              opponentSuccess: oppSucceeded,
              opponentPrecision: oppPrecision,
              winnerUid: challengerWins ? duel.challengerUid : currentUser.uid,
              resolvedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            return { challengerWins, pot };
          })
        );
      })
    );
  }

  function cancelDuel(duelId) {
    if (!enabled || !currentUser) return Promise.reject(new Error('Нужно войти в аккаунт.'));
    const duelRef = db.collection('duels').doc(duelId);
    const challengerRef = db.collection('users').doc(currentUser.uid);
    return db.runTransaction((tx) =>
      tx.get(duelRef).then((duelDoc) => {
        if (!duelDoc.exists) throw new Error('Дуэль уже недоступна.');
        const duel = duelDoc.data();
        if (duel.challengerUid !== currentUser.uid) throw new Error('Это не твой вызов.');
        if (duel.status !== 'pending') throw new Error('Дуэль уже принята — отменить нельзя.');
        return tx.get(challengerRef).then((challengerDoc) => {
          const data = challengerDoc.exists ? challengerDoc.data() : { money: 0 };
          tx.update(challengerRef, { money: (data.money || 0) + duel.stake });
          tx.delete(duelRef);
        });
      })
    );
  }

  /* ---------- Совместный бизнес (два игрока делят доход) ---------- */

  const VENTURE_DAILY_YIELD = 0.03; // 3% от общего пула в реальные сутки, делится по доле вклада

  function createVenture(name, stake) {
    if (!enabled || !currentUser) return Promise.reject(new Error('Нужно войти в аккаунт.'));
    const founderRef = db.collection('users').doc(currentUser.uid);
    return db.runTransaction((tx) =>
      tx.get(founderRef).then((doc) => {
        const data = doc.exists ? doc.data() : { money: 0 };
        if ((data.money || 0) < stake) throw new Error('Не хватает денег на вклад.');
        tx.update(founderRef, { money: (data.money || 0) - stake });
        const ventureRef = db.collection('ventures').doc();
        tx.set(ventureRef, {
          name,
          founderUid: currentUser.uid,
          founderName: currentUser.email,
          founderStake: Math.round(stake),
          partnerUid: null,
          partnerName: null,
          partnerStake: 0,
          pool: Math.round(stake),
          status: 'open',
          lastAccrualAt: firebase.firestore.FieldValue.serverTimestamp(),
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        return ventureRef.id;
      })
    );
  }

  function listOpenVentures() {
    if (!enabled) return Promise.resolve([]);
    // См. комментарий в listOpenDuels — без orderBy, чтобы не требовался
    // составной индекс; сортируем на клиенте.
    return db.collection('ventures').where('status', '==', 'open').limit(50).get().then((snap) => {
      const rows = [];
      snap.forEach((doc) => rows.push(Object.assign({ id: doc.id }, doc.data())));
      rows.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      return rows.slice(0, 20);
    });
  }

  function joinVenture(ventureId, stake) {
    if (!enabled || !currentUser) return Promise.reject(new Error('Нужно войти в аккаунт.'));
    const ventureRef = db.collection('ventures').doc(ventureId);
    const partnerRef = db.collection('users').doc(currentUser.uid);
    return db.runTransaction((tx) =>
      tx.get(ventureRef).then((ventureDoc) => {
        if (!ventureDoc.exists) throw new Error('Предприятие уже недоступно.');
        const venture = ventureDoc.data();
        if (venture.status !== 'open') throw new Error('В это предприятие уже кто-то вложился.');
        if (venture.founderUid === currentUser.uid) throw new Error('Нельзя присоединиться к своему же предприятию.');
        return tx.get(partnerRef).then((partnerDoc) => {
          const data = partnerDoc.exists ? partnerDoc.data() : { money: 0 };
          if ((data.money || 0) < stake) throw new Error('Не хватает денег на вклад.');
          tx.update(partnerRef, { money: (data.money || 0) - stake });
          tx.update(ventureRef, {
            partnerUid: currentUser.uid,
            partnerName: currentUser.email,
            partnerStake: Math.round(stake),
            pool: venture.founderStake + Math.round(stake),
            status: 'active',
            lastAccrualAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
        });
      })
    );
  }

  /** Собрать накопленный доход предприятия — доступно любому из двух
   *  партнёров, начисляет обеим сторонам пропорционально вкладу. */
  function collectVentureIncome(ventureId) {
    if (!enabled || !currentUser) return Promise.reject(new Error('Нужно войти в аккаунт.'));
    const ventureRef = db.collection('ventures').doc(ventureId);
    return db.runTransaction((tx) =>
      tx.get(ventureRef).then((ventureDoc) => {
        if (!ventureDoc.exists) throw new Error('Предприятие не найдено.');
        const venture = ventureDoc.data();
        if (venture.status !== 'active') throw new Error('Предприятие ещё не заработало — партнёр не присоединился.');
        if (venture.founderUid !== currentUser.uid && venture.partnerUid !== currentUser.uid) throw new Error('Ты не участник этого предприятия.');
        const founderRef = db.collection('users').doc(venture.founderUid);
        const partnerRef = db.collection('users').doc(venture.partnerUid);
        return tx.get(founderRef).then((founderDoc) =>
          tx.get(partnerRef).then((partnerDoc) => {
            const now = Date.now();
            const lastMs = venture.lastAccrualAt && venture.lastAccrualAt.toMillis ? venture.lastAccrualAt.toMillis() : now;
            const elapsedDays = Math.max(0, (now - lastMs) / 86400000);
            const totalIncome = Math.round(venture.pool * VENTURE_DAILY_YIELD * elapsedDays);
            if (totalIncome <= 0) throw new Error('Пока нечего собирать — доход ещё не накопился.');
            const founderShare = Math.round(totalIncome * (venture.founderStake / venture.pool));
            const partnerShare = totalIncome - founderShare;
            const founderData = founderDoc.exists ? founderDoc.data() : { money: 0 };
            const partnerData = partnerDoc.exists ? partnerDoc.data() : { money: 0 };
            tx.update(founderRef, { money: (founderData.money || 0) + founderShare });
            tx.update(partnerRef, { money: (partnerData.money || 0) + partnerShare });
            tx.update(ventureRef, { lastAccrualAt: firebase.firestore.FieldValue.serverTimestamp() });
            const myShare = currentUser.uid === venture.founderUid ? founderShare : partnerShare;
            return { totalIncome, myShare };
          })
        );
      })
    );
  }

  function listMyVentures() {
    if (!enabled || !currentUser) return Promise.resolve([]);
    const uid = currentUser.uid;
    return Promise.all([
      db.collection('ventures').where('founderUid', '==', uid).get(),
      db.collection('ventures').where('partnerUid', '==', uid).get(),
    ]).then(([foundedSnap, joinedSnap]) => {
      const rows = [];
      foundedSnap.forEach((doc) => rows.push(Object.assign({ id: doc.id }, doc.data())));
      joinedSnap.forEach((doc) => {
        if (!rows.some((r) => r.id === doc.id)) rows.push(Object.assign({ id: doc.id }, doc.data()));
      });
      return rows;
    });
  }

  /** Закрыть предприятие: доступно только основателю, пока никто не
   *  присоединился — возвращает вклад. */
  function dissolveVenture(ventureId) {
    if (!enabled || !currentUser) return Promise.reject(new Error('Нужно войти в аккаунт.'));
    const ventureRef = db.collection('ventures').doc(ventureId);
    const founderRef = db.collection('users').doc(currentUser.uid);
    return db.runTransaction((tx) =>
      tx.get(ventureRef).then((ventureDoc) => {
        if (!ventureDoc.exists) throw new Error('Предприятие уже недоступно.');
        const venture = ventureDoc.data();
        if (venture.founderUid !== currentUser.uid) throw new Error('Закрыть может только основатель.');
        if (venture.status !== 'open') throw new Error('Нельзя закрыть предприятие, в которое уже вложился партнёр.');
        return tx.get(founderRef).then((founderDoc) => {
          const data = founderDoc.exists ? founderDoc.data() : { money: 0 };
          tx.update(founderRef, { money: (data.money || 0) + venture.founderStake });
          tx.delete(ventureRef);
        });
      })
    );
  }

  /* ---------- Президентство: один глобальный пост на все аккаунты ---------- */

  const PRESIDENCY_TERM_MS = 12 * 60 * 60 * 1000; // "пол дня" реального времени
  const PRESIDENCY_DOC = () => db.collection('state_global').doc('presidency');

  function getPresidency() {
    if (!enabled) return Promise.resolve(null);
    return PRESIDENCY_DOC().get().then((doc) => (doc.exists ? doc.data() : { presidentUid: null, bankruptcyTaxRate: 0, laws: {}, log: [] }));
  }

  /** Попытка занять пост: `won` — уже брошенный кубик (25% шанс),
   *  считается на клиенте синхронно до вызова. Пост можно занять,
   *  только если он свободен или прошлый срок истёк. */
  function runForPresident(name, won) {
    if (!enabled || !currentUser) return Promise.resolve({ elected: false, reason: 'offline' });
    const ref = PRESIDENCY_DOC();
    return db.runTransaction((tx) =>
      tx.get(ref).then((doc) => {
        const data = doc.exists ? doc.data() : { bankruptcyTaxRate: 0, laws: {}, log: [] };
        const now = Date.now();
        const occupied = data.presidentUid && data.termEndsAtMs && data.termEndsAtMs > now;
        if (occupied) return { elected: false, reason: 'occupied' };
        if (!won) return { elected: false, reason: 'lost' };
        tx.set(ref, {
          presidentUid: currentUser.uid,
          presidentName: name,
          electedAtMs: now,
          termEndsAtMs: now + PRESIDENCY_TERM_MS,
          bankruptcyTaxRate: typeof data.bankruptcyTaxRate === 'number' ? data.bankruptcyTaxRate : 0,
          laws: data.laws || {},
          log: (data.log || []).concat([`${name} вступил(а) в должность президента.`]).slice(-30),
        });
        return { elected: true };
      })
    );
  }

  /** Указ президента: правки к законам/налогу + запись в журнал.
   *  Работает только пока действующий срок у вызывающего не истёк. */
  function issuePresidentialDecree(patch, logLine) {
    if (!enabled || !currentUser) return Promise.reject(new Error('Нужно войти в аккаунт.'));
    const ref = PRESIDENCY_DOC();
    return db.runTransaction((tx) =>
      tx.get(ref).then((doc) => {
        if (!doc.exists) throw new Error('Пост президента сейчас свободен.');
        const data = doc.data();
        const now = Date.now();
        if (data.presidentUid !== currentUser.uid || !data.termEndsAtMs || data.termEndsAtMs <= now) {
          throw new Error('Ты сейчас не president — срок истёк или пост занял кто-то другой.');
        }
        const next = Object.assign({}, data, patch, { laws: Object.assign({}, data.laws || {}, patch.laws || {}) });
        next.log = (data.log || []).concat([logLine]).slice(-30);
        tx.set(ref, next);
        return next;
      })
    );
  }

  /* ---------- Аукцион ---------- */

  function createAuctionListing(item, price) {
    if (!enabled || !currentUser) return Promise.reject(new Error('Нужно войти в аккаунт.'));
    return db.collection('auction').add({
      sellerUid: currentUser.uid,
      sellerName: currentUser.email,
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      icon: item.icon,
      price: Math.round(price),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  function listAuctionListings() {
    if (!enabled) return Promise.resolve([]);
    return db.collection('auction').orderBy('createdAt', 'desc').limit(50).get().then((snap) => {
      const rows = [];
      snap.forEach((doc) => rows.push(Object.assign({ id: doc.id }, doc.data())));
      return rows;
    });
  }

  /** Комиссия аукциона: часть цены не доходит до продавца, чтобы рынок
   *  не был бесконечным насосом денег между игроками. */
  const AUCTION_COMMISSION_RATE = 0.08;

  /** Покупка предмета на аукционе: транзакция переводит деньги и вещь. */
  function buyAuctionListing(listingId) {
    if (!enabled || !currentUser) return Promise.reject(new Error('Нужно войти в аккаунт.'));
    const listingRef = db.collection('auction').doc(listingId);
    const buyerRef = db.collection('users').doc(currentUser.uid);
    return db.runTransaction((tx) =>
      tx.get(listingRef).then((listingDoc) => {
        if (!listingDoc.exists) throw new Error('Лот уже продан или снят.');
        const listing = listingDoc.data();
        if (listing.sellerUid === currentUser.uid) throw new Error('Нельзя купить свой же лот.');
        return tx.get(buyerRef).then((buyerDoc) => {
          const buyerData = buyerDoc.exists ? buyerDoc.data() : { money: 0, inventory: {} };
          if ((buyerData.money || 0) < listing.price) throw new Error('Не хватает денег.');
          const sellerRef = db.collection('users').doc(listing.sellerUid);
          return tx.get(sellerRef).then((sellerDoc) => {
            const sellerData = sellerDoc.exists ? sellerDoc.data() : { money: 0 };
            const buyerInventory = Object.assign({}, buyerData.inventory || {});
            buyerInventory[listing.itemId] = (buyerInventory[listing.itemId] || 0) + 1;
            const commission = Math.round(listing.price * AUCTION_COMMISSION_RATE);
            const sellerProceeds = listing.price - commission;
            tx.update(buyerRef, { money: (buyerData.money || 0) - listing.price, inventory: buyerInventory });
            tx.update(sellerRef, { money: (sellerData.money || 0) + sellerProceeds });
            tx.delete(listingRef);
            return Object.assign({ commission, sellerProceeds }, listing);
          });
        });
      })
    );
  }

  function cancelAuctionListing(listingId) {
    if (!enabled || !currentUser) return Promise.reject(new Error('Нужно войти в аккаунт.'));
    return db.collection('auction').doc(listingId).delete();
  }

  /* ---------- Админ-панель ---------- */

  function adminFindPlayers(query) {
    if (!enabled) return Promise.resolve([]);
    const q = (query || '').trim().toLowerCase();
    return db.collection('users').limit(200).get().then((snap) => {
      const rows = [];
      snap.forEach((doc) => {
        const data = doc.data();
        if (!q || (data.email && data.email.toLowerCase().indexOf(q) !== -1) || (data.name && data.name.toLowerCase().indexOf(q) !== -1)) {
          rows.push(Object.assign({ uid: doc.id }, data));
        }
      });
      return rows;
    });
  }

  /** Выдать/списать деньги игроку. Правит не только верхнеуровневый
   *  снимок (`money` — по нему считается лидерборд), но и деньги
   *  ВНУТРИ активного слота персонажа (`slots[activeSlotIndex]`),
   *  иначе игрок продолжит видеть старую сумму в самой партии, а
   *  следующее же автосохранение перезапишет снимок обратно. */
  function adminAdjustMoney(uid, delta) {
    if (!enabled) return Promise.reject(new Error('Облако недоступно.'));
    const ref = db.collection('users').doc(uid);
    return db.runTransaction((tx) =>
      tx.get(ref).then((doc) => {
        const data = doc.exists ? doc.data() : { money: 0 };
        const newMoney = Math.round((data.money || 0) + delta);
        const update = { money: newMoney };
        const idx = data.activeSlotIndex;
        let slotSynced = false;
        if (typeof idx === 'number' && Array.isArray(data.slots) && data.slots[idx] && data.slots[idx].state) {
          const slots = data.slots.slice();
          const entry = Object.assign({}, slots[idx]);
          const slotState = Object.assign({}, entry.state);
          slotState.money = Math.round((slotState.money || 0) + delta);
          entry.state = slotState;
          slots[idx] = entry;
          update.slots = slots;
          slotSynced = true;
        }
        tx.update(ref, update);
        return { newMoney, slotSynced };
      })
    );
  }

  init();

  return {
    get enabled() { return enabled; },
    get currentUser() { return currentUser; },
    onAuthChange,
    register,
    login,
    logout,
    loadProfile,
    saveState,
    saveSlots,
    loadSlots,
    getLeaderboard,
    postActivity,
    listActivity,
    createDuel,
    listOpenDuels,
    acceptDuel,
    cancelDuel,
    createVenture,
    listOpenVentures,
    joinVenture,
    collectVentureIncome,
    listMyVentures,
    dissolveVenture,
    getPresidency,
    runForPresident,
    issuePresidentialDecree,
    createAuctionListing,
    listAuctionListings,
    buyAuctionListing,
    cancelAuctionListing,
    adminFindPlayers,
    adminAdjustMoney,
  };
})();
