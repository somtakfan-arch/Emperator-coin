// Простое JSON-хранилище: состав, выговоры, активность, сборы.
// Без базы — файл на диске. Для бесплатного хостинга подключи volume,
// иначе данные обнулятся при перезапуске контейнера (см. README).

import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

const EMPTY = { members: {}, warns: {}, activity: { last: null, entries: [] }, musters: {}, applications: {} };

export class Store {
  constructor(file) {
    this.file = file;
    this.data = structuredClone(EMPTY);
    this.saving = null;
    this.dirty = false;
  }

  async load() {
    try {
      const raw = await readFile(this.file, 'utf8');
      this.data = { ...structuredClone(EMPTY), ...JSON.parse(raw) };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      await this.save();
    }
    return this;
  }

  async save() {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    await rename(tmp, this.file);
  }

  // Несколько изменений подряд не должны бить по диску каждым полем.
  queueSave() {
    this.dirty = true;
    this.saving ??= setTimeout(async () => {
      this.saving = null;
      this.dirty = false;
      await this.save().catch((e) => console.error('store: не удалось сохранить', e));
    }, 500);
  }

  member(id) {
    this.data.members[id] ??= { name: null, static: null, rank: null, joinedAt: null };
    return this.data.members[id];
  }

  addWarn(id, entry) {
    this.data.warns[id] ??= [];
    this.data.warns[id].push(entry);
    this.queueSave();
    return this.data.warns[id];
  }

  warns(id) {
    return this.data.warns[id] ?? [];
  }

  removeWarn(id, warnId) {
    const list = this.warns(id);
    const idx = list.findIndex((w) => w.id === warnId);
    if (idx === -1) return null;
    const [removed] = list.splice(idx, 1);
    this.queueSave();
    return removed;
  }

  logActivity(entry) {
    this.data.activity.last = entry;
    this.data.activity.entries.unshift(entry);
    this.data.activity.entries = this.data.activity.entries.slice(0, 200);
    this.queueSave();
  }

  muster(messageId) {
    return this.data.musters[messageId] ?? null;
  }

  setMuster(messageId, data) {
    this.data.musters[messageId] = data;
    this.queueSave();
  }
}

// Три предупреждения складываются в выговор — как на проекте.
export function disciplineSummary(list) {
  const warnings = list.filter((w) => w.level === 'warn').length;
  const strikes = list.filter((w) => w.level === 'strike').length;
  return { warnings, strikes, totalStrikes: strikes + Math.floor(warnings / 3) };
}
