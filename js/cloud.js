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
   без бэкенда. Пароль "empc" в админке — защита от случайных
   заходов, а не криптографическая защита: технически залогиненный
   пользователь мог бы через консоль браузера дописать себе денег
   напрямую в Firestore. Для игры с друзьями это нормальный
   компромисс; для публичного конкурентного проекта такую логику
   стоит перенести на Cloud Functions.
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
   *  Вызывается после каждого значимого изменения состояния. */
  function saveState(state) {
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
            tx.update(buyerRef, { money: (buyerData.money || 0) - listing.price, inventory: buyerInventory });
            tx.update(sellerRef, { money: (sellerData.money || 0) + listing.price });
            tx.delete(listingRef);
            return listing;
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

  function adminAdjustMoney(uid, delta) {
    if (!enabled) return Promise.reject(new Error('Облако недоступно.'));
    const ref = db.collection('users').doc(uid);
    return db.runTransaction((tx) =>
      tx.get(ref).then((doc) => {
        const data = doc.exists ? doc.data() : { money: 0 };
        const newMoney = Math.round((data.money || 0) + delta);
        tx.update(ref, { money: newMoney });
        return newMoney;
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
    createAuctionListing,
    listAuctionListings,
    buyAuctionListing,
    cancelAuctionListing,
    adminFindPlayers,
    adminAdjustMoney,
  };
})();
