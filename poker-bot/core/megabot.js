// Бот для огромного стола (40 ботов, 6 колод): решает мгновенно, без перебора рук —
// по простым правилам: сила стартовой руки до флопа и готовая комбинация после.
import { evaluate, handCategory } from './cards.js';

const rank = (c) => c >> 2;
const suit = (c) => c & 3;

// сила стартовой руки: пары и старшие карты выше, одномастные и связанные — бонус
function preScore([a, b]) {
  const hi = Math.max(rank(a), rank(b)), lo = Math.min(rank(a), rank(b));
  if (hi === lo) return 10 + hi;
  return hi * 0.6 + lo * 0.4 + (suit(a) === suit(b) ? 1.5 : 0) - Math.max(0, hi - lo - 1) * 0.6;
}
const premium = ([a, b]) => {
  const hi = Math.max(rank(a), rank(b)), lo = Math.min(rank(a), rank(b));
  return (hi === lo && hi >= 8) || (hi === 12 && lo >= 11); // TT+, AK, AQ
};

// ещё 40 имён к 60 ботам толпы — для стола на 101
export const MEGA_EXTRA = ['Арбуз', 'Бобёр', 'Ворон', 'Гусь', 'Дизель', 'Ерёма', 'Жук', 'Зубр', 'Индеец', 'Йети',
  'Кабан', 'Лимон', 'Мамонт', 'Носорог', 'Окунь', 'Пончик', 'Рысь', 'Сокол', 'Тигрёнок', 'Удав',
  'Филин', 'Хомяк', 'Цыплёнок', 'Чижик', 'Шмель', 'Щука', 'Эскимо', 'Юнга', 'Ястреб', 'Батон',
  'Вареник', 'Гном', 'Дятел', 'Ёрш', 'Зефир', 'Кактус', 'Леший', 'Мопс', 'Нарвал', 'Огурец'];

export class MegaBot {
  // style: 0 — тайтовый, 1 — обычный, 2 — лузовый и агрессивный
  constructor(name, style = 1) {
    this.name = name;
    this.style = style;
    this.need = [11, 9.5, 8][style];
    this.agg = [0.2, 0.4, 0.7][style];
  }

  observe() {}

  act(s) {
    const r = Math.random();
    const all = s.myBet + s.stack;
    const raiseTo = (x) => ({ type: 'raise', to: Math.min(all, Math.max(s.minRaiseTo, Math.round(x))) });
    const passive = () => (s.toCall === 0 ? { type: 'check' } : { type: 'fold' });
    const raises = s.actions.filter((a) => a.street === s.street && a.action === 'raise').length;
    const bb = s.bigBlind;

    if (s.street === 'preflop') {
      const sc = preScore(s.hole);
      if (premium(s.hole)) {
        if (raises >= 3) return sc >= 21 ? raiseTo(all) : { type: 'call' };
        return raiseTo(Math.max(s.currentBet * 3, bb * 3));
      }
      if (sc < this.need) return passive();
      const c = s.toCall / bb;
      if (c === 0) return r < this.agg * 0.3 ? raiseTo(bb * 2.5) : { type: 'check' };
      if (c <= 1) return r < this.agg * 0.2 ? raiseTo(bb * 3) : { type: 'call' };
      if (c <= 4 && r < 0.4 + this.agg * 0.3) return { type: 'call' };
      return { type: 'fold' };
    }

    const cat = handCategory(evaluate(s.hole.concat(s.board)));
    const boardCat = handCategory(evaluate(s.board));
    const mine = cat > boardCat; // комбинация собрана с моими картами, а не лежит на столе
    const pot = Math.max(s.pot, bb);
    const frac = s.toCall / pot;
    if (mine && cat >= 2) {
      // две пары и сильнее
      if (s.toCall === 0) return raiseTo(s.currentBet + pot * (0.5 + this.agg * 0.3));
      if (raises < 2 && r < 0.3 + this.agg * 0.3) return raiseTo(s.currentBet * 2.5);
      return { type: 'call' };
    }
    if (mine && cat === 1) {
      // пара
      if (s.toCall === 0) return r < this.agg * 0.5 ? raiseTo(pot * 0.4) : { type: 'check' };
      if (frac <= 0.5 || r < 0.15) return { type: 'call' };
      return { type: 'fold' };
    }
    // ничего нет: редкий блеф, мелкую ставку иногда доплачиваем
    if (s.toCall === 0) return r < this.agg * 0.08 ? raiseTo(pot * 0.5) : { type: 'check' };
    if (frac <= 0.1 && r < 0.5) return { type: 'call' };
    return { type: 'fold' };
  }
}
