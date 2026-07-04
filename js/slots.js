/* =========================================================
   ЭМПЕРАТОР: ОТ БОМЖА ДО МИЛЛИАРДЕРА
   Слоты персонажей: у каждого аккаунта (или у гостя на этом
   устройстве) до 3 отдельных героев, полностью независимых друг
   от друга — свои деньги, инвентарь, история, черты характера.
   Судьбу нельзя перекрутить: один раз выпавший персонаж закрепляется
   за слотом навсегда, пока слот не будет очищен через "Начать
   новую жизнь" после конца партии.

   Хранится в localStorage (работает и без аккаунта), а если
   подключён Firestore — дополнительно зеркалится в облако
   (users/{uid}.slots), чтобы слоты не терялись при смене устройства.
   ========================================================= */

window.Slots = (function () {
  const MAX_SLOTS = 3;
  const STORAGE_KEY = 'emperator_slots_v1';

  function scopeKey() {
    return window.Cloud && window.Cloud.enabled && window.Cloud.currentUser
      ? 'u_' + window.Cloud.currentUser.uid
      : 'guest';
  }

  function readAll() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  function writeAll(all) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      /* localStorage может быть недоступен — не критично, останется только в облаке */
    }
  }

  function emptyArr() {
    return [null, null, null];
  }

  function getRawSlots() {
    const all = readAll();
    const arr = all[scopeKey()] || emptyArr();
    while (arr.length < MAX_SLOTS) arr.push(null);
    return arr;
  }

  function setRawSlots(arr) {
    const all = readAll();
    all[scopeKey()] = arr;
    writeAll(all);
    if (window.Cloud && window.Cloud.enabled && window.Cloud.currentUser) {
      window.Cloud.saveSlots(arr).catch(() => {});
    }
  }

  function getSummaries() {
    return getRawSlots().map((entry) => {
      if (!entry || !entry.state) return null;
      const s = entry.state;
      const tier = getTier(computeEffectiveWealth(deserializeState(s)));
      return {
        name: s.name,
        age: s.age,
        money: s.money,
        tierLabel: tier.label,
        tierId: tier.id,
        ended: !!s.ended,
      };
    });
  }

  function loadSlot(index) {
    const entry = getRawSlots()[index];
    return entry && entry.state ? deserializeState(entry.state) : null;
  }

  function saveSlot(index, state) {
    const arr = getRawSlots();
    arr[index] = { state: serializeState(state), updatedAt: Date.now() };
    setRawSlots(arr);
  }

  function deleteSlot(index) {
    const arr = getRawSlots();
    arr[index] = null;
    setRawSlots(arr);
  }

  function syncFromCloud() {
    if (!(window.Cloud && window.Cloud.enabled && window.Cloud.currentUser)) return Promise.resolve();
    return window.Cloud.loadSlots()
      .then((cloudArr) => {
        if (!cloudArr) return;
        const all = readAll();
        all[scopeKey()] = cloudArr;
        writeAll(all);
      })
      .catch(() => {});
  }

  return { MAX_SLOTS, getSummaries, loadSlot, saveSlot, deleteSlot, syncFromCloud };
})();
