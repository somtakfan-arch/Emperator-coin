// Короткие звуки на WebAudio (без файлов) + вибрация, где поддерживается.
import { prefs } from "./prefs.js";

let ctx = null;
function tone(freq, dur = 0.12, type = "sine", gain = 0.06, delay = 0) {
  if (!prefs().sound) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch { /* нет звука — не страшно */ }
}
const buzz = (p) => { try { if (prefs().sound) navigator.vibrate?.(p); } catch { /* ignore */ } };

export const sfx = {
  buy: () => { tone(660, 0.09); tone(880, 0.12, "sine", 0.05, 0.08); buzz(20); },
  sell: () => { tone(520, 0.09); tone(390, 0.14, "sine", 0.05, 0.08); buzz(20); },
  coin: () => { tone(988, 0.08, "triangle"); tone(1319, 0.16, "triangle", 0.05, 0.07); buzz(15); },
  open: () => { [0, 0.07, 0.14].forEach((d, i) => tone(400 + i * 120, 0.08, "square", 0.025, d)); buzz([10, 30, 10]); },
  rare: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "triangle", 0.05, i * 0.09)); buzz([30, 40, 60]); },
  alert: () => { tone(880, 0.15, "sine", 0.07); tone(880, 0.15, "sine", 0.07, 0.25); buzz([100, 80, 100]); },
  error: () => { tone(200, 0.2, "sawtooth", 0.03); buzz(60); },
};
