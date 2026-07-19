(() => {
  "use strict";

  /* ============================== DATA ============================== */

  const SKINS = [
    { id: "cat", name: "Кот", price: 0, currency: "coins" },
    { id: "fox", name: "Лис", price: 0, currency: "coins" },
    { id: "penguin", name: "Пингвин", price: 0, currency: "coins" },
    { id: "bear", name: "Медведь", price: 0, currency: "coins" },
    { id: "rabbit", name: "Заяц", price: 300, currency: "coins" },
    { id: "panda", name: "Панда", price: 500, currency: "coins" },
    { id: "lion", name: "Лев", price: 800, currency: "coins" },
    { id: "frog", name: "Лягух", price: 1200, currency: "coins" },
    { id: "koala", name: "Коала", price: 1800, currency: "coins" },
    { id: "dragon", name: "Дракон", price: 15, currency: "gems" },
    { id: "unicorn", name: "Единорог", price: 20, currency: "gems" },
    { id: "alien", name: "Пришелец", price: 25, currency: "gems" },
  ];

  const GAMES = [
    { id: "balloon", name: "Шарики", emoji: "🎈" },
    { id: "reaction", name: "Реакция", emoji: "⚡" },
    { id: "sumo", name: "Сумо-арена", emoji: "🥊" },
  ];

  const MILESTONES = [
    { goal: 1, coins: 50, gems: 0 },
    { goal: 3, coins: 100, gems: 2 },
    { goal: 6, coins: 150, gems: 3 },
    { goal: 10, coins: 250, gems: 5 },
    { goal: 15, coins: 350, gems: 5 },
    { goal: 20, coins: 500, gems: 8 },
    { goal: 30, coins: 800, gems: 10 },
    { goal: 50, coins: 1500, gems: 20 },
  ];

  const PLAYER_COLORS = ["#ff5a5f", "#4d8dff", "#4de17f", "#ffd166"];
  const RANK_REWARDS = [100, 60, 30, 10];

  /* ============================== CHARACTER ART ============================== */
  // Every player avatar is drawn on canvas from simple shapes (no emoji), so each
  // skin gets a distinct silhouette (ears/horn/beak/etc.) rather than reusing faces.

  const SKIN_VISUALS = {
    cat: { body: "#ffb454", accent: "#7a4a1e", ear: "triangle" },
    fox: { body: "#ff8a3d", accent: "#fff3e6", ear: "triangleBig", belly: true },
    penguin: { body: "#33415c", accent: "#ffffff", ear: "none", belly: true, beak: true },
    bear: { body: "#a5713f", accent: "#7a4f28", ear: "round", snout: true },
    rabbit: { body: "#f7d7e3", accent: "#ffffff", ear: "long" },
    panda: { body: "#ffffff", accent: "#20202a", ear: "roundDark", eyePatch: true },
    lion: { body: "#f2b23c", accent: "#c9741f", ear: "mane" },
    frog: { body: "#5fd167", accent: "#2f8f3d", ear: "none", bulgeEyes: true },
    koala: { body: "#a8adb8", accent: "#e9ebef", ear: "roundBig" },
    dragon: { body: "#4ec97a", accent: "#1f7a44", ear: "none", horn: true, wings: true },
    unicorn: { body: "#f6c9ef", accent: "#8ee3ff", ear: "none", horn: true, mane: true },
    alien: { body: "#8be05a", accent: "#3f7a20", ear: "none", alienEyes: true, antenna: true, tallHead: true },
  };

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawEars(ctx, v, r) {
    ctx.fillStyle = v.accent;
    ctx.strokeStyle = "rgba(255,255,255,.5)";
    ctx.lineWidth = Math.max(2, r * 0.09);
    const tri = (cx, cy, w2, h2, rot) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.moveTo(-w2, h2);
      ctx.lineTo(0, -h2);
      ctx.lineTo(w2, h2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    };
    const circleEar = (cx, cy, rr) => {
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    };
    switch (v.ear) {
      case "triangle":
        tri(-r * 0.55, -r * 0.75, r * 0.28, r * 0.4, -0.15);
        tri(r * 0.55, -r * 0.75, r * 0.28, r * 0.4, 0.15);
        break;
      case "triangleBig":
        tri(-r * 0.62, -r * 0.7, r * 0.34, r * 0.5, -0.2);
        tri(r * 0.62, -r * 0.7, r * 0.34, r * 0.5, 0.2);
        break;
      case "round":
        circleEar(-r * 0.72, -r * 0.78, r * 0.36);
        circleEar(r * 0.72, -r * 0.78, r * 0.36);
        break;
      case "roundBig":
        circleEar(-r * 0.8, -r * 0.7, r * 0.46);
        circleEar(r * 0.8, -r * 0.7, r * 0.46);
        break;
      case "roundDark":
        circleEar(-r * 0.72, -r * 0.78, r * 0.34);
        circleEar(r * 0.72, -r * 0.78, r * 0.34);
        break;
      case "long": {
        const longEar = (cx, rot) => {
          ctx.save();
          ctx.translate(cx, -r * 0.55);
          ctx.rotate(rot);
          ctx.beginPath();
          ctx.ellipse(0, -r * 0.75, r * 0.22, r * 0.78, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        };
        longEar(-r * 0.4, -0.12);
        longEar(r * 0.4, 0.12);
        break;
      }
      case "mane":
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          tri(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, r * 0.22, r * 0.34, a + Math.PI / 2);
        }
        break;
    }
  }

  function drawExtras(ctx, v, r, skinId) {
    ctx.fillStyle = v.accent;
    if (v.belly) {
      ctx.beginPath();
      ctx.ellipse(0, r * 0.32, r * 0.52, r * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (v.snout) {
      ctx.beginPath();
      ctx.ellipse(0, r * 0.24, r * 0.36, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (v.eyePatch) {
      ctx.beginPath();
      ctx.ellipse(-r * 0.36, -r * 0.06, r * 0.26, r * 0.32, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(r * 0.36, -r * 0.06, r * 0.26, r * 0.32, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (v.beak) {
      ctx.fillStyle = "#ffb84d";
      ctx.beginPath();
      ctx.moveTo(-r * 0.16, r * 0.08);
      ctx.lineTo(r * 0.16, r * 0.08);
      ctx.lineTo(0, r * 0.34);
      ctx.closePath();
      ctx.fill();
    }
    if (v.horn) {
      ctx.fillStyle = skinId === "unicorn" ? "#ffd166" : v.accent;
      ctx.beginPath();
      ctx.moveTo(-r * 0.14, -r * 0.82);
      ctx.lineTo(r * 0.14, -r * 0.82);
      ctx.lineTo(0, -r * 1.32);
      ctx.closePath();
      ctx.fill();
    }
    if (v.wings) {
      ctx.fillStyle = v.accent;
      [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.85, r * 0.05);
        ctx.quadraticCurveTo(side * r * 1.35, -r * 0.15, side * r * 1.1, r * 0.35);
        ctx.closePath();
        ctx.fill();
      });
    }
    if (v.mane) {
      const colors = ["#ff9fd6", "#8ee3ff", "#c9a4ff"];
      colors.forEach((c, idx) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(r * 0.5 + idx * r * 0.06, -r * 0.5 + idx * r * 0.3, r * 0.14, r * 0.4, 0.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    if (v.antenna) {
      ctx.strokeStyle = v.accent;
      ctx.lineWidth = Math.max(2, r * 0.07);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.92);
      ctx.lineTo(0, -r * 1.28);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -r * 1.34, r * 0.09, 0, Math.PI * 2);
      ctx.fillStyle = v.accent;
      ctx.fill();
    }
  }

  function drawEyes(ctx, v, r, skinId) {
    const eyeR = r * (skinId === "frog" ? 0.22 : 0.19);
    const spacing = r * (skinId === "alien" ? 0.3 : 0.36);
    const eyeY = skinId === "frog" ? -r * 0.55 : -r * 0.04;
    [-1, 1].forEach((side) => {
      const ex = side * spacing;
      if (v.alienEyes) {
        ctx.fillStyle = "#0c1a0a";
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, eyeR * 0.75, eyeR * 1.2, side * 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.55)";
        ctx.beginPath();
        ctx.arc(ex - side * eyeR * 0.15, eyeY - eyeR * 0.35, eyeR * 0.22, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      if (v.bulgeEyes) {
        ctx.fillStyle = v.body;
        ctx.beginPath();
        ctx.arc(ex, eyeY, eyeR * 1.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(20,10,35,.4)";
        ctx.lineWidth = Math.max(1.5, r * 0.05);
        ctx.stroke();
      }
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(ex, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1c1130";
      ctx.beginPath();
      ctx.arc(ex + side * eyeR * 0.15, eyeY + eyeR * 0.15, eyeR * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.beginPath();
      ctx.arc(ex + side * eyeR * 0.02, eyeY + eyeR * 0.02, eyeR * 0.16, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawMouth(ctx, r, skinId) {
    ctx.strokeStyle = "rgba(20,10,35,.55)";
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.lineCap = "round";
    const w = skinId === "frog" ? r * 0.48 : r * 0.26;
    const y = r * (skinId === "frog" ? 0.14 : 0.3);
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.quadraticCurveTo(0, y + r * 0.22, w, y);
    ctx.stroke();
  }

  function drawCharacter(ctx, skinId, size) {
    const v = SKIN_VISUALS[skinId] || SKIN_VISUALS.cat;
    const r = size * 0.42;
    drawEars(ctx, v, r);
    ctx.beginPath();
    if (v.tallHead) ctx.ellipse(0, 0, r * 0.82, r * 1.05, 0, 0, Math.PI * 2);
    else ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = v.body;
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.1);
    ctx.strokeStyle = "rgba(20,10,35,.4)";
    ctx.stroke();
    drawExtras(ctx, v, r, skinId);
    drawEyes(ctx, v, r, skinId);
    drawMouth(ctx, r, skinId);
  }

  function paintCharacterAt(ctx, x, y, size, skinId) {
    ctx.save();
    ctx.translate(x, y);
    drawCharacter(ctx, skinId, size);
    ctx.restore();
  }

  function numberTag(ctx, x, y, i, isBot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fillStyle = PLAYER_COLORS[i];
    ctx.fill();
    ctx.lineWidth = isBot ? 2.5 : 2;
    ctx.strokeStyle = isBot ? "rgba(255,255,255,.9)" : "rgba(20,10,35,.5)";
    if (isBot) ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#1c1130";
    ctx.font = "900 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), 0, 1);
    ctx.restore();
  }

  function drawBadge(ctx, x, y, text, textColor, bgColor) {
    ctx.save();
    ctx.font = "900 14px sans-serif";
    const padX = 11, padY = 6;
    const tw = ctx.measureText(text).width;
    const bw = tw + padX * 2, bh = 15 + padY * 2;
    ctx.translate(x, y);
    roundRectPath(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
    ctx.fillStyle = bgColor || "rgba(15,8,28,.85)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,.25)";
    ctx.stroke();
    ctx.fillStyle = textColor || "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, 1);
    ctx.restore();
  }

  // Cache rendered skin icons (offscreen canvas -> data URL) for use in DOM tiles.
  const skinIconCache = new Map();
  function getSkinIconURL(skinId, px) {
    const key = skinId + ":" + px;
    if (skinIconCache.has(key)) return skinIconCache.get(key);
    const c = document.createElement("canvas");
    c.width = px;
    c.height = px;
    const cctx = c.getContext("2d");
    cctx.translate(px / 2, px / 2 + px * 0.04);
    drawCharacter(cctx, skinId, px * 0.86);
    const url = c.toDataURL();
    skinIconCache.set(key, url);
    return url;
  }

  function iconImg(skinId, px, cls) {
    return `<img class="${cls || "char-icon"}" width="${px}" height="${px}" src="${getSkinIconURL(skinId, px)}" alt="" />`;
  }

  /* ============================== BACKGROUND ============================== */

  function drawSunburst(ctx, w, h) {
    const cx = w / 2, cy = h * 0.4;
    const maxR = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) * 1.05;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    grad.addColorStop(0, "#4a1fa0");
    grad.addColorStop(0.65, "#2a1160");
    grad.addColorStop(1, "#160a38");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    const rays = 28;
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < rays; i++) {
      if (i % 2 === 0) continue;
      const a0 = (i / rays) * Math.PI * 2;
      const a1 = ((i + 1) / rays) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, maxR, a0, a1);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,255,255,.035)";
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCenterHub(ctx, w, h, frac) {
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) * 0.085;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(20,10,45,.55)";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255,255,255,.2)";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r - 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, frac));
    ctx.closePath();
    ctx.fillStyle = "#ffd166";
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.restore();
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function outwardAnchor(zone, cx, cy, minDist, w, h) {
    const zx = zone.x + zone.w / 2, zy = zone.y + zone.h / 2;
    const dx = zx - cx, dy = zy - cy;
    const d = Math.hypot(dx, dy) || 1;
    let x = zx, y = zy;
    if (d < minDist) {
      const scale = minDist / d;
      x = cx + dx * scale;
      y = cy + dy * scale;
    }
    return { x: clamp(x, 34, w - 34), y: clamp(y, 34, h - 34) };
  }

  /* ============================== STATE ============================== */

  const STORAGE_KEY = "partyArenaState_v1";

  function defaultState() {
    return {
      coins: 300,
      gems: 10,
      ownedSkins: ["cat", "fox", "penguin", "bear"],
      gamesPlayed: 0,
      claimedMilestones: [],
      soundOn: true,
      lastSkins: ["cat", "fox", "penguin", "bear"],
    };
  }

  let STATE = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
    } catch (e) {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
  }

  /* ============================== HELPERS ============================== */

  const qs = (sel, root) => (root || document).querySelector(sel);
  const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function skinById(id) {
    return SKINS.find((s) => s.id === id) || SKINS[0];
  }

  let toastTimer = null;
  function toast(msg) {
    const el = qs("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  let audioCtx = null;
  function playTone(freq, dur, type) {
    if (!STATE.soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }

  function showScreen(id) {
    qsa(".screen").forEach((s) => (s.hidden = s.id !== id));
  }

  /* ============================== SESSION ============================== */

  const session = {
    mode: "multi", // 'solo' | 'multi' | 'team'
    humanCount: 2,
    totalCount: 2,
    activeTab: 0,
    players: [], // { skin, isBot, team }
  };

  function startSetup(mode, count) {
    session.mode = mode;
    if (mode === "solo") {
      session.humanCount = 1;
      session.totalCount = 4;
    } else if (mode === "team") {
      session.humanCount = 4;
      session.totalCount = 4;
    } else {
      session.humanCount = count;
      session.totalCount = count;
    }
    session.players = [];
    const fallback = STATE.ownedSkins[0] || "cat";
    for (let i = 0; i < session.humanCount; i++) {
      const remembered = STATE.lastSkins[i];
      const skin = STATE.ownedSkins.includes(remembered) ? remembered : fallback;
      session.players.push({
        skin,
        isBot: false,
        team: mode === "team" ? (i < 2 ? 0 : 1) : null,
      });
    }
    session.activeTab = 0;
    renderCharacterScreen();
    showScreen("screen-characters");
  }

  function fillBots() {
    const usedSkins = session.players.map((p) => p.skin);
    while (session.players.length < session.totalCount) {
      const pool = SKINS.filter((s) => !usedSkins.includes(s.id));
      const pick = (pool.length ? pool : SKINS)[Math.floor(Math.random() * (pool.length ? pool.length : SKINS.length))];
      usedSkins.push(pick.id);
      session.players.push({ skin: pick.id, isBot: true, team: null });
    }
  }

  /* ============================== HOME SCREEN ============================== */

  function renderCurrencies() {
    qsa("#home-coins, #char-coins, #shop-coins").forEach((el) => (el.textContent = STATE.coins));
    qsa("#home-gems, #char-gems, #shop-gems").forEach((el) => (el.textContent = STATE.gems));
  }

  qs("#btn-multi").addEventListener("click", () => (qs("#count-modal").hidden = false));
  qs("#count-cancel").addEventListener("click", () => (qs("#count-modal").hidden = true));
  qsa(".count-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      qs("#count-modal").hidden = true;
      startSetup("multi", Number(btn.dataset.count));
    });
  });
  qsa(".mode-btn[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      startSetup(btn.dataset.mode, Number(btn.dataset.count));
    });
  });

  qs("#btn-shop").addEventListener("click", () => {
    renderShop();
    showScreen("screen-shop");
  });
  qs("#btn-settings").addEventListener("click", () => showScreen("screen-settings"));
  qs("#btn-progress").addEventListener("click", () => {
    renderProgress();
    showScreen("screen-progress");
  });

  /* ============================== CHARACTER SELECT ============================== */

  function renderCharacterScreen() {
    const tabsEl = qs("#player-tabs");
    tabsEl.innerHTML = "";
    session.players.forEach((p, i) => {
      const btn = document.createElement("button");
      btn.className = "player-tab p" + (i + 1) + (i === session.activeTab ? " active" : "");
      btn.innerHTML = `${iconImg(p.skin, 32, "tab-icon")}Игрок ${i + 1}`;
      btn.addEventListener("click", () => {
        session.activeTab = i;
        renderCharacterScreen();
      });
      tabsEl.appendChild(btn);
    });
    renderSkinGrid();
    renderCurrencies();
  }

  function renderSkinGrid() {
    const grid = qs("#skin-grid");
    grid.innerHTML = "";
    const current = session.players[session.activeTab];
    SKINS.forEach((skin) => {
      const owned = STATE.ownedSkins.includes(skin.id);
      const tile = document.createElement("div");
      tile.className = "skin-tile" + (current.skin === skin.id ? " selected" : "") + (!owned ? " locked" : "");
      tile.innerHTML = `${iconImg(skin.id, 84)}${owned ? '<span class="check">✓</span>' : `<span class="price-tag">${skin.price} ${skin.currency === "gems" ? "💎" : "🪙"}</span>`}`;
      tile.addEventListener("click", () => {
        if (owned) {
          current.skin = skin.id;
          STATE.lastSkins[session.activeTab] = skin.id;
          saveState();
          renderCharacterScreen();
        } else {
          toast("Открой этот скин в магазине 🛒");
        }
      });
      grid.appendChild(tile);
    });
  }

  qs("#char-back").addEventListener("click", () => showScreen("screen-home"));
  qs("#btn-to-games").addEventListener("click", () => {
    renderGameGrid();
    showScreen("screen-games");
  });

  /* ============================== GAME PICKER ============================== */

  function renderGameGrid() {
    const grid = qs("#game-grid");
    grid.innerHTML = "";
    const tileColors = ["#ffd166", "#6ee7f2", "#ff9f9f"];
    GAMES.forEach((g, idx) => {
      const tile = document.createElement("button");
      tile.className = "game-tile";
      tile.style.background = tileColors[idx % tileColors.length];
      tile.innerHTML = `<span class="g-emoji">${g.emoji}</span><span class="g-name">${g.name}</span>`;
      tile.addEventListener("click", () => launchSingle(g.id));
      grid.appendChild(tile);
    });
  }

  qs("#games-back").addEventListener("click", () => showScreen("screen-characters"));

  function launchSingle(gameId) {
    fillBots();
    Play.startSequence([gameId], false);
  }

  qs("#btn-tournament").addEventListener("click", () => {
    fillBots();
    Play.startSequence(GAMES.map((g) => g.id), true);
  });

  /* ============================== PLAY ENGINE ============================== */

  const canvas = qs("#game-canvas");
  const ctx = canvas.getContext("2d");
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  function resizeCanvas() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
  }
  window.addEventListener("resize", resizeCanvas);

  function getZones(w, h, n) {
    if (n <= 2) {
      return [
        { x: 0, y: 0, w, h: h / 2 },
        { x: 0, y: h / 2, w, h: h / 2 },
      ];
    }
    if (n === 3) {
      return [
        { x: 0, y: 0, w, h: h / 2 },
        { x: 0, y: h / 2, w: w / 2, h: h / 2 },
        { x: w / 2, y: h / 2, w: w / 2, h: h / 2 },
      ];
    }
    return [
      { x: 0, y: 0, w: w / 2, h: h / 2 },
      { x: w / 2, y: 0, w: w / 2, h: h / 2 },
      { x: 0, y: h / 2, w: w / 2, h: h / 2 },
      { x: w / 2, y: h / 2, w: w / 2, h: h / 2 },
    ];
  }

  function zoneAt(zones, x, y) {
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return i;
    }
    return -1;
  }

  const Play = {
    queue: [],
    isTournament: false,
    tournamentPoints: null,
    currentGame: null,
    rafId: null,
    pointerZoneMap: new Map(),
    zones: [],

    startSequence(gameIds, tournament) {
      this.queue = gameIds.slice();
      this.isTournament = tournament;
      this.tournamentPoints = tournament ? session.players.map(() => 0) : null;
      this.next();
    },

    next() {
      if (!this.queue.length) {
        this.finishSequence();
        return;
      }
      const gameId = this.queue.shift();
      showScreen("screen-play");
      resizeCanvas();
      this.runGame(gameId);
    },

    finishSequence() {
      if (this.isTournament) {
        const ranking = session.players
          .map((p, i) => ({ i, pts: this.tournamentPoints[i] }))
          .sort((a, b) => b.pts - a.pts)
          .map((r) => r.i);
        showResults(ranking, true);
      }
    },

    runGame(gameId) {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      this.zones = getZones(w, h, session.totalCount);
      const mod = GAME_MODULES[gameId];
      this.currentGame = mod.create(w, h, this.zones, session.players);
      this.pointerZoneMap.clear();
      this.phase = "countdown";
      this.countdownEnd = performance.now() + 2600;
      this.active = true;
      playTone(440, 0.12);
      let lastTs = performance.now();
      const loop = (ts) => {
        if (!this.active) return;
        const dt = Math.min(0.05, (ts - lastTs) / 1000);
        lastTs = ts;
        this.tick(dt, ts, gameId);
        if (this.active) this.rafId = requestAnimationFrame(loop);
      };
      cancelAnimationFrame(this.rafId);
      this.rafId = requestAnimationFrame(loop);
    },

    stop() {
      this.active = false;
      cancelAnimationFrame(this.rafId);
    },

    // Draws player HUD content rotated 180deg for the far side of the device
    // (top-half zones), so each player reads their own badge right-side up.
    hud(zoneIndex, fn) {
      const z = this.zones[zoneIndex];
      if (!z) return;
      const h = canvas.height / dpr;
      this.hudAt(z.x + z.w / 2, z.y + z.h / 2, z.y + z.h / 2 < h / 2, fn);
    },

    hudAt(x, y, rotated, fn) {
      ctx.save();
      ctx.translate(x, y);
      if (rotated) ctx.rotate(Math.PI);
      fn(ctx);
      ctx.restore();
    },

    hint(text) {
      const w = canvas.width / dpr;
      ctx.save();
      ctx.fillStyle = "#fff";
      ctx.font = "900 15px sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,.5)";
      ctx.shadowBlur = 6;
      ctx.fillText(text, w / 2, 28);
      ctx.restore();
    },

    tick(dt, ts, gameId) {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawSunburst(ctx, w, h);

      if (this.phase === "countdown") {
        this.currentGame.draw(ctx, session.players, this.zones, true);
        drawCountdown(ctx, w, h, this.countdownEnd);
        if (performance.now() >= this.countdownEnd) {
          this.phase = "playing";
          this.roundEnd = performance.now() + this.currentGame.maxDuration;
          playTone(660, 0.15);
          vibrate(40);
        }
        return;
      }

      if (this.phase === "playing") {
        this.currentGame.botTick(dt, session.players);
        this.currentGame.update(dt, session.players);
        this.currentGame.draw(ctx, session.players, this.zones, false);
        if (!this.currentGame.hideHub) {
          const frac = clamp((this.roundEnd - performance.now()) / this.currentGame.maxDuration, 0, 1);
          drawCenterHub(ctx, w, h, frac);
        }
        const timedOut = performance.now() >= this.roundEnd;
        if (this.currentGame.isFinished() || timedOut) {
          this.phase = "done";
          this.doneAt = performance.now();
          this.rankings = this.currentGame.getRankings();
          playTone(880, 0.25);
          vibrate([30, 40, 30]);
        }
        return;
      }

      if (this.phase === "done") {
        this.currentGame.draw(ctx, session.players, this.zones, false);
        drawWinnerBanner(ctx, w, h, this.rankings, session.players);
        if (performance.now() - this.doneAt > 1600) {
          this.stop();
          if (this.isTournament) {
            const total = session.players.length;
            this.rankings.forEach((playerIdx, rank) => {
              this.tournamentPoints[playerIdx] += total - rank;
            });
            setTimeout(() => this.next(), 0);
          } else {
            setTimeout(() => showResults(this.rankings, false), 0);
          }
        }
      }
    },

    handlePointer(zoneIndex, type, pointerId) {
      if (this.phase !== "playing" || !this.currentGame) return;
      const player = session.players[zoneIndex];
      if (!player || player.isBot) return;
      this.currentGame.handleInput(zoneIndex, type);
    },
  };

  function drawCountdown(ctx, w, h, end) {
    const remain = Math.max(0, end - performance.now());
    const n = Math.ceil(remain / 900);
    ctx.save();
    ctx.fillStyle = "rgba(10,4,30,.45)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.font = "900 88px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(n > 0 ? String(n) : "ИГРА!", w / 2, h / 2);
    ctx.restore();
  }

  function drawWinnerBanner(ctx, w, h, rankings, players) {
    const winner = players[rankings[0]];
    ctx.save();
    ctx.fillStyle = "rgba(10,4,30,.55)";
    ctx.fillRect(0, 0, w, h);
    paintCharacterAt(ctx, w / 2, h / 2 - 48, 84, winner.skin);
    ctx.fillStyle = "#ffd166";
    ctx.font = "900 32px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`Игрок ${rankings[0] + 1} побеждает!`, w / 2, h / 2 + 34);
    ctx.restore();
  }

  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const zi = zoneAt(Play.zones, x, y);
    if (zi === -1) return;
    Play.pointerZoneMap.set(e.pointerId, zi);
    Play.handlePointer(zi, "down", e.pointerId);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((evt) => {
    canvas.addEventListener(evt, (e) => {
      const zi = Play.pointerZoneMap.get(e.pointerId);
      if (zi === undefined) return;
      Play.pointerZoneMap.delete(e.pointerId);
      Play.handlePointer(zi, "up", e.pointerId);
    });
  });

  qs("#play-exit").addEventListener("click", () => {
    Play.stop();
    showScreen("screen-games");
  });

  /* ============================== MINIGAME: BALLOON ============================== */

  const BalloonGame = {
    create(w, h, zones, players) {
      const fills = players.map(() => 0);
      const popped = players.map(() => false);
      return {
        maxDuration: 12000,
        fills,
        botCooldown: players.map(() => 0),
        addFill(i, amt) {
          if (fills[i] >= 100) return;
          fills[i] = Math.min(100, fills[i] + amt);
          if (fills[i] >= 100) popped[i] = true;
        },
        handleInput(i, type) {
          if (type === "down") this.addFill(i, 9);
        },
        botTick(dt) {
          players.forEach((p, i) => {
            if (!p.isBot) return;
            this.botCooldown[i] -= dt;
            if (this.botCooldown[i] <= 0) {
              this.addFill(i, 7 + Math.random() * 4);
              this.botCooldown[i] = 0.09 + Math.random() * 0.1;
            }
          });
        },
        update(dt) {},
        isFinished() {
          return popped.some((p) => p);
        },
        getRankings() {
          return players.map((_, i) => i).sort((a, b) => fills[b] - fills[a]);
        },
        draw(ctx, players, zones) {
          players.forEach((p, i) => {
            if (!p) return;
            const z = zones[i];
            const charSize = clamp(Math.min(z.w, z.h) * 0.34, 44, 100);
            Play.hud(i, (ctx) => {
              const bR = charSize * 0.32 + (fills[i] / 100) * charSize * 0.46;
              const balloonY = -charSize * 0.62 - bR * 0.65;
              ctx.beginPath();
              ctx.ellipse(0, balloonY, bR * 0.86, bR, 0, 0, Math.PI * 2);
              ctx.fillStyle = PLAYER_COLORS[i];
              ctx.fill();
              ctx.strokeStyle = "rgba(255,255,255,.5)";
              ctx.lineWidth = 2;
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(0, balloonY + bR);
              ctx.lineTo(0, balloonY + bR + charSize * 0.22);
              ctx.strokeStyle = "rgba(255,255,255,.5)";
              ctx.lineWidth = 1.5;
              ctx.stroke();

              paintCharacterAt(ctx, 0, 0, charSize, p.skin);
              numberTag(ctx, -charSize * 0.36, -charSize * 0.36, i, p.isBot);
              drawBadge(ctx, 0, charSize * 0.62, `${Math.round(fills[i])}%`, "#1c1130", PLAYER_COLORS[i]);
            });
          });
          Play.hint("Жми быстрее — надуй шарик!");
        },
      };
    },
  };

  /* ============================== MINIGAME: REACTION ============================== */

  const ReactionGame = {
    create(w, h, zones, players) {
      const state = players.map(() => ({ falseStart: false, reacted: false, time: null }));
      const waitFor = 1400 + Math.random() * 2400;
      const startTs = performance.now();
      return {
        maxDuration: 8000,
        state,
        goTs: null,
        botScheduled: players.map(() => false),
        handleInput(i, type) {
          if (type !== "down") return;
          const s = state[i];
          if (s.falseStart || s.reacted) return;
          if (this.goTs === null) {
            s.falseStart = true;
          } else {
            s.reacted = true;
            s.time = performance.now() - this.goTs;
          }
        },
        botTick(dt, players) {
          if (this.goTs === null) return;
          players.forEach((p, i) => {
            if (!p.isBot || this.botScheduled[i]) return;
            this.botScheduled[i] = true;
            const falseStartChance = Math.random() < 0.08;
            const delay = falseStartChance ? -50 : 180 + Math.random() * 420;
            setTimeout(() => {
              if (state[i].falseStart || state[i].reacted) return;
              if (delay < 0) {
                state[i].falseStart = true;
              } else {
                state[i].reacted = true;
                state[i].time = delay;
              }
            }, Math.max(0, delay));
          });
        },
        update(dt) {
          if (this.goTs === null && performance.now() - startTs >= waitFor) {
            this.goTs = performance.now();
          }
        },
        isFinished() {
          return state.every((s) => s.falseStart || s.reacted);
        },
        getRankings() {
          return players
            .map((_, i) => i)
            .sort((a, b) => {
              const sa = state[a], sb = state[b];
              if (sa.reacted && sb.reacted) return sa.time - sb.time;
              if (sa.reacted) return -1;
              if (sb.reacted) return 1;
              return a - b;
            });
        },
        draw(ctx, players, zones) {
          const isGo = this.goTs !== null;
          players.forEach((p, i) => {
            if (!p) return;
            const z = zones[i];
            const charSize = clamp(Math.min(z.w, z.h) * 0.34, 44, 100);
            const s = state[i];
            let statusColor = isGo ? "#2fbf5e" : "#c53d3d";
            let textColor = "#fff";
            let label = isGo ? "ЖМИ!" : "ЖДИ…";
            if (s.falseStart) {
              statusColor = "#4a4460";
              label = "РАНО!";
            }
            if (s.reacted) {
              statusColor = "#ffd166";
              textColor = "#3a2a00";
              label = Math.round(s.time) + " мс";
            }
            Play.hud(i, (ctx) => {
              paintCharacterAt(ctx, 0, -10, charSize, p.skin);
              numberTag(ctx, -charSize * 0.36, -charSize * 0.46, i, p.isBot);
              drawBadge(ctx, 0, charSize * 0.5, label, textColor, statusColor);
            });
          });
          Play.hint("Жди сигнал и жми первым!");
        },
      };
    },
  };

  /* ============================== MINIGAME: SUMO ARENA ============================== */

  const SumoGame = {
    create(w, h, zones, players) {
      const cx = w / 2, cy = h / 2;
      const r0 = Math.min(w, h) * 0.42;
      const rMin = Math.min(w, h) * 0.16;
      const duration = 18000;
      const startTs = performance.now();
      const n = players.length;
      const balls = players.map((p, i) => {
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
        return {
          x: cx + Math.cos(angle) * r0 * 0.5,
          y: cy + Math.sin(angle) * r0 * 0.5,
          vx: 0,
          vy: 0,
          radius: 22,
          alive: true,
          eliminatedAt: -1,
        };
      });
      const thrust = players.map(() => false);
      let order = 0;

      return {
        maxDuration: duration,
        hideHub: true,
        balls,
        handleInput(i, type) {
          thrust[i] = type === "down";
        },
        botTick(dt, players) {
          players.forEach((p, i) => {
            if (!p.isBot || !balls[i].alive) return;
            const dist = Math.hypot(balls[i].x - cx, balls[i].y - cy);
            const arenaR = this.currentRadius();
            const danger = dist > arenaR * 0.55;
            thrust[i] = danger ? Math.random() < 0.85 : Math.random() < 0.35;
          });
        },
        currentRadius() {
          const t = Math.min(1, (performance.now() - startTs) / duration);
          return r0 - (r0 - rMin) * t;
        },
        update(dt) {
          const arenaR = this.currentRadius();
          balls.forEach((b, i) => {
            if (!b.alive) return;
            if (thrust[i]) {
              const dx = cx - b.x, dy = cy - b.y;
              const dist = Math.hypot(dx, dy) || 1;
              b.vx += (dx / dist) * 620 * dt;
              b.vy += (dy / dist) * 620 * dt;
            }
            b.vx *= 0.92;
            b.vy *= 0.92;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
          });
          for (let i = 0; i < balls.length; i++) {
            for (let j = i + 1; j < balls.length; j++) {
              const a = balls[i], c = balls[j];
              if (!a.alive || !c.alive) continue;
              const dx = c.x - a.x, dy = c.y - a.y;
              const dist = Math.hypot(dx, dy) || 0.01;
              const minDist = a.radius + c.radius;
              if (dist < minDist) {
                const overlap = (minDist - dist) / 2;
                const nx = dx / dist, ny = dy / dist;
                a.x -= nx * overlap;
                a.y -= ny * overlap;
                c.x += nx * overlap;
                c.y += ny * overlap;
                const avx = a.vx, avy = a.vy;
                a.vx = c.vx * 0.9;
                a.vy = c.vy * 0.9;
                c.vx = avx * 0.9;
                c.vy = avy * 0.9;
              }
            }
          }
          balls.forEach((b) => {
            if (!b.alive) return;
            const dist = Math.hypot(b.x - cx, b.y - cy);
            if (dist - b.radius * 0.4 > arenaR) {
              b.alive = false;
              b.eliminatedAt = order++;
            }
          });
        },
        isFinished() {
          return balls.filter((b) => b.alive).length <= 1;
        },
        getRankings() {
          return players
            .map((_, i) => i)
            .sort((a, b) => {
              const ba = balls[a], bb = balls[b];
              if (ba.alive && bb.alive) {
                return Math.hypot(ba.x - cx, ba.y - cy) - Math.hypot(bb.x - cx, bb.y - cy);
              }
              if (ba.alive) return -1;
              if (bb.alive) return 1;
              return bb.eliminatedAt - ba.eliminatedAt;
            });
        },
        draw(ctx, players, zones) {
          const arenaR = this.currentRadius();
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, arenaR, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(90,48,190,.4)";
          ctx.fill();
          ctx.lineWidth = 5;
          ctx.strokeStyle = "#ffd166";
          ctx.stroke();
          ctx.restore();

          balls.forEach((b, i) => {
            if (!b.alive) return;
            paintCharacterAt(ctx, b.x, b.y, b.radius * 2.3, players[i].skin);
          });

          zones.forEach((z, i) => {
            const p = players[i];
            if (!p) return;
            const anchor = outwardAnchor(z, cx, cy, r0 * 1.18, w, h);
            const rotated = anchor.y < h / 2;
            Play.hudAt(anchor.x, anchor.y, rotated, (ctx) => {
              paintCharacterAt(ctx, 0, -20, 42, p.skin);
              numberTag(ctx, -16, -38, i, p.isBot);
              drawBadge(ctx, 0, 14, "Держи", "#1c1130", PLAYER_COLORS[i]);
            });
          });

          Play.hint("Держи свою зону — толкай к центру!");
        },
      };
    },
  };

  const GAME_MODULES = {
    balloon: BalloonGame,
    reaction: ReactionGame,
    sumo: SumoGame,
  };

  /* ============================== RESULTS ============================== */

  function showResults(rankings, isTournament) {
    STATE.gamesPlayed += 1;
    const myRank = rankings.indexOf(0);
    const reward = RANK_REWARDS[Math.min(myRank, RANK_REWARDS.length - 1)] * (isTournament ? 1.5 : 1);
    STATE.coins += Math.round(reward);
    saveState();

    qs("#results-title").textContent = isTournament ? "🏆 Итоги турнира" : "Результаты раунда";
    const podium = qs("#podium");
    podium.innerHTML = "";
    const order = [1, 0, 2, 3].filter((r) => r < rankings.length); // 2nd,1st,3rd,4th visual order
    order.forEach((rankPos) => {
      const playerIdx = rankings[rankPos];
      if (playerIdx === undefined) return;
      const p = session.players[playerIdx];
      const slot = document.createElement("div");
      slot.className = "podium-slot rank-" + (rankPos + 1);
      slot.innerHTML = `${iconImg(p.skin, 56, "p-icon")}<span class="p-name">Игрок ${playerIdx + 1}${p.isBot ? " (бот)" : ""}</span><div class="p-bar">${rankPos + 1}</div>`;
      podium.appendChild(slot);
    });
    qs("#reward-line").textContent = `+${Math.round(reward)} 🪙`;
    renderCurrencies();
    checkMilestoneToast();
    showScreen("screen-results");
  }

  function checkMilestoneToast() {
    const next = MILESTONES.find((m) => STATE.gamesPlayed >= m.goal && !STATE.claimedMilestones.includes(m.goal));
    if (next) toast("Доступна награда в «Треке наград» 🏅");
  }

  qs("#btn-again").addEventListener("click", () => {
    Play.startSequence([Play.lastGameId || GAMES[0].id], false);
  });
  qs("#btn-other-game").addEventListener("click", () => {
    renderGameGrid();
    showScreen("screen-games");
  });
  qs("#btn-home").addEventListener("click", () => showScreen("screen-home"));

  /* ============================== SHOP ============================== */

  function renderShop() {
    renderCurrencies();
    const grid = qs("#shop-grid");
    grid.innerHTML = "";
    SKINS.forEach((skin) => {
      const owned = STATE.ownedSkins.includes(skin.id);
      const tile = document.createElement("div");
      tile.className = "skin-tile" + (owned ? "" : " locked");
      tile.innerHTML = `${iconImg(skin.id, 84)}<span class="price-tag">${owned ? "Куплено" : skin.price + (skin.currency === "gems" ? " 💎" : " 🪙")}</span>`;
      if (!owned) {
        tile.addEventListener("click", () => buySkin(skin));
      }
      grid.appendChild(tile);
    });
  }

  function buySkin(skin) {
    const bal = skin.currency === "gems" ? STATE.gems : STATE.coins;
    if (bal < skin.price) {
      toast("Недостаточно " + (skin.currency === "gems" ? "кристаллов 💎" : "монет 🪙"));
      return;
    }
    if (skin.currency === "gems") STATE.gems -= skin.price;
    else STATE.coins -= skin.price;
    STATE.ownedSkins.push(skin.id);
    saveState();
    toast(`Открыт новый скин: ${skin.name}`);
    renderShop();
  }

  qs("#shop-back").addEventListener("click", () => showScreen("screen-home"));

  /* ============================== PROGRESS PATH ============================== */

  function renderProgress() {
    qs("#progress-count").textContent = STATE.gamesPlayed;
    const wrap = qs("#progress-track-scroll");
    wrap.innerHTML = "";
    MILESTONES.forEach((m, idx) => {
      if (idx > 0) {
        const line = document.createElement("div");
        line.className = "milestone-line" + (STATE.gamesPlayed >= m.goal ? " filled" : "");
        wrap.appendChild(line);
      }
      const reached = STATE.gamesPlayed >= m.goal;
      const claimed = STATE.claimedMilestones.includes(m.goal);
      const el = document.createElement("div");
      el.className = "milestone" + (reached ? " reached" : "") + (claimed ? " claimed" : "");
      el.innerHTML = `<div class="m-circle">${claimed ? "✅" : "🏅"}</div><div class="m-goal">${m.goal} игр</div>`;
      if (reached && !claimed) {
        const btn = document.createElement("button");
        btn.className = "m-claim";
        btn.textContent = `+${m.coins}🪙${m.gems ? " +" + m.gems + "💎" : ""}`;
        btn.addEventListener("click", () => {
          STATE.coins += m.coins;
          STATE.gems += m.gems;
          STATE.claimedMilestones.push(m.goal);
          saveState();
          renderProgress();
          renderCurrencies();
          toast("Награда получена!");
        });
        el.appendChild(btn);
      }
      wrap.appendChild(el);
    });
  }

  qs("#progress-back").addEventListener("click", () => showScreen("screen-home"));

  /* ============================== SETTINGS ============================== */

  qs("#setting-sound").checked = STATE.soundOn;
  qs("#setting-sound").addEventListener("change", (e) => {
    STATE.soundOn = e.target.checked;
    saveState();
  });
  qs("#settings-back").addEventListener("click", () => showScreen("screen-home"));
  qs("#btn-reset").addEventListener("click", () => {
    if (!confirm("Сбросить весь прогресс, монеты и скины?")) return;
    STATE = defaultState();
    saveState();
    renderCurrencies();
    toast("Прогресс сброшен");
    showScreen("screen-home");
  });

  /* ============================== INIT ============================== */

  const originalStartSequence = Play.startSequence.bind(Play);
  Play.startSequence = function (gameIds, tournament) {
    if (!tournament && gameIds.length === 1) Play.lastGameId = gameIds[0];
    originalStartSequence(gameIds, tournament);
  };

  qs("#mascots").innerHTML = ["cat", "fox", "penguin", "unicorn"].map((id) => iconImg(id, 56, "mascot-icon")).join("");

  renderCurrencies();
  resizeCanvas();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
