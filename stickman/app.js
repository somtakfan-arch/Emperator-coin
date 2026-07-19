"use strict";

/* ---------- Constants ---------- */

const WORLD_W = 360;
const WORLD_H = 460;
const DPR = Math.min(window.devicePixelRatio || 1, 3);
const STORAGE_KEY = "stickanim.scenes.v2";
const ACTIVE_KEY = "stickanim.active.v2";

const PALETTE = [
  "#1c1e26", "#e0426b", "#2f8fe0", "#25b57a",
  "#f2a83c", "#8a5cf6", "#e0592f", "#2fc4c9",
  "#c93fd1", "#5c7a2f",
];

const BACKGROUNDS = [
  { id: "dark", name: "Тёмный", draw: (ctx, w, h) => { ctx.fillStyle = "#14151b"; ctx.fillRect(0, 0, w, h); } },
  { id: "sky", name: "Небо", draw: (ctx, w, h) => { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#6fb8ec"); g.addColorStop(1, "#cfeaff"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); } },
  { id: "sunset", name: "Закат", draw: (ctx, w, h) => { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#3b2a5e"); g.addColorStop(0.55, "#e0693f"); g.addColorStop(1, "#f4c552"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); } },
  { id: "grass", name: "Трава", draw: (ctx, w, h) => { const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#bfe8ff"); g.addColorStop(0.62, "#bfe8ff"); g.addColorStop(0.62, "#4f9a4a"); g.addColorStop(1, "#357a35"); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); } },
  { id: "white", name: "Белый", draw: (ctx, w, h) => { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); } },
];

/* Bone tree. parent:null bones attach directly to the character root (hip). */
const BASE_SKELETON = [
  { id: "spine", parent: null, len: 44, rel0: -90, w: 7 },
  { id: "head", parent: "spine", len: 10, rel0: 0, w: 4, isHead: true, headR: 15 },
  { id: "armL_up", parent: "spine", len: 24, rel0: -160, w: 5 },
  { id: "armL_lo", parent: "armL_up", len: 22, rel0: 15, w: 4 },
  { id: "armR_up", parent: "spine", len: 24, rel0: 160, w: 5 },
  { id: "armR_lo", parent: "armR_up", len: 22, rel0: -15, w: 4 },
  { id: "legL_up", parent: null, len: 30, rel0: 100, w: 6 },
  { id: "legL_lo", parent: "legL_up", len: 28, rel0: 10, w: 5 },
  { id: "legR_up", parent: null, len: 30, rel0: 80, w: 6 },
  { id: "legR_lo", parent: "legR_up", len: 28, rel0: -10, w: 5 },
];

/* ---------- State ---------- */

let scenes = [];
let activeSceneId = null;
let scene = null; // convenience pointer to the active scene object
let selectedCharId = null;
let ghostOn = false;
let addJointMode = false;
let dragging = null; // { kind:'root'|'bone', boneId, charId, startSnapshot }
let undoStack = [];
let playing = false;
let playTimer = null;

/* ---------- DOM ---------- */

const canvas = document.getElementById("stage");
const ctx = canvas.getContext("2d");
canvas.width = WORLD_W * DPR;
canvas.height = WORLD_H * DPR;

const sceneNameEl = document.getElementById("scene-name");
const fpsInput = document.getElementById("fps-input");
const frameHoldInput = document.getElementById("frame-hold");
const charStrip = document.getElementById("char-strip");
const colorStrip = document.getElementById("color-strip");
const framesStrip = document.getElementById("frames-strip");
const bgStrip = document.getElementById("bg-strip");
const bgPanel = document.getElementById("bg-panel");
const scenesPanel = document.getElementById("scenes-panel");
const scenesList = document.getElementById("scenes-list");
const exportOverlay = document.getElementById("export-overlay");
const exportProgress = document.getElementById("export-progress");
const hint = document.getElementById("hint");
const ghostBtn = document.getElementById("btn-ghost");
const jointBtn = document.getElementById("btn-joint-add");
const playBtn = document.getElementById("btn-play");

/* ---------- Persistence ---------- */

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    scenes = raw ? JSON.parse(raw) : [];
  } catch (e) {
    scenes = [];
  }
  if (!scenes.length) scenes = [makeDefaultScene()];
  const active = localStorage.getItem(ACTIVE_KEY);
  activeSceneId = scenes.find((s) => s.id === active) ? active : scenes[0].id;
  scene = scenes.find((s) => s.id === activeSceneId);
  selectedCharId = scene.characters[0] ? scene.characters[0].id : null;
}

function saveAll() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenes));
  localStorage.setItem(ACTIVE_KEY, activeSceneId);
}

function uid(prefix) {
  return prefix + "_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function defaultPoseFor(index) {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return {
    x: 60 + col * 80,
    y: 260 + row * 90,
    angles: {},
  };
}

function makeDefaultScene() {
  const charId = uid("char");
  const frameId = uid("frame");
  return {
    id: uid("scene"),
    name: "Сцена 1",
    createdAt: Date.now(),
    fps: 12,
    background: "dark",
    skeleton: BASE_SKELETON.map((b) => ({ ...b })),
    characters: [{ id: charId, color: PALETTE[1], name: "Персонаж 1" }],
    frames: [{ id: frameId, hold: 2, poses: { [charId]: defaultPoseFor(0) } }],
    currentFrameIndex: 0,
  };
}

/* ---------- Pose math ---------- */

function computePoints(pose, skeleton) {
  const points = {};
  const root = { x: pose.x, y: pose.y };
  for (const bone of skeleton) {
    const parentAbs = bone.parent ? points[bone.parent].absAngle : 0;
    const start = bone.parent ? points[bone.parent].end : root;
    const rel = pose.angles[bone.id] ?? bone.rel0;
    const absAngle = bone.parent ? parentAbs + rel : rel;
    const rad = (absAngle * Math.PI) / 180;
    const end = { x: start.x + Math.cos(rad) * bone.len, y: start.y + Math.sin(rad) * bone.len };
    points[bone.id] = { start, end, absAngle };
  }
  return points;
}

function currentFrame() {
  return scene.frames[scene.currentFrameIndex];
}

function poseFor(charId, frame) {
  frame = frame || currentFrame();
  if (!frame.poses[charId]) {
    const idx = scene.characters.findIndex((c) => c.id === charId);
    frame.poses[charId] = defaultPoseFor(Math.max(idx, 0));
  }
  return frame.poses[charId];
}

/* ---------- Rendering ---------- */

function drawCharacter(g, pose, skeleton, color, opts) {
  opts = opts || {};
  const points = computePoints(pose, skeleton);
  g.save();
  g.globalAlpha = opts.alpha ?? 1;
  g.strokeStyle = color;
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const bone of skeleton) {
    if (bone.isHead) continue;
    const p = points[bone.id];
    g.lineWidth = bone.w;
    g.beginPath();
    g.moveTo(p.start.x, p.start.y);
    g.lineTo(p.end.x, p.end.y);
    g.stroke();
  }
  for (const bone of skeleton) {
    if (!bone.isHead) continue;
    const p = points[bone.id];
    g.lineWidth = bone.w;
    g.beginPath();
    g.arc(p.end.x, p.end.y, bone.headR, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();

  if (opts.showJoints) {
    g.save();
    g.globalAlpha = opts.alpha ?? 1;
    const drawHandle = (x, y, active) => {
      g.beginPath();
      g.arc(x, y, active ? 7 : 5.5, 0, Math.PI * 2);
      g.fillStyle = active ? "#3fd0ff" : "#ffffff";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = "#1c1e26";
      g.stroke();
    };
    drawHandle(pose.x, pose.y, dragging && dragging.kind === "root" && dragging.charId === opts.charId);
    for (const bone of skeleton) {
      const p = points[bone.id];
      const active = dragging && dragging.kind === "bone" && dragging.boneId === bone.id && dragging.charId === opts.charId;
      drawHandle(p.end.x, p.end.y, active);
    }
    g.restore();
  }
  return points;
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, WORLD_W, WORLD_H);
  const bg = BACKGROUNDS.find((b) => b.id === scene.background) || BACKGROUNDS[0];
  bg.draw(ctx, WORLD_W, WORLD_H);

  if (ghostOn && !playing) {
    const prevIdx = scene.currentFrameIndex - 1;
    if (prevIdx >= 0) {
      const prevFrame = scene.frames[prevIdx];
      for (const c of scene.characters) {
        const p = prevFrame.poses[c.id];
        if (p) drawCharacter(ctx, p, scene.skeleton, c.color, { alpha: 0.28, showJoints: false });
      }
    }
  }

  const frame = currentFrame();
  for (const c of scene.characters) {
    const pose = poseFor(c.id, frame);
    const isSel = c.id === selectedCharId;
    drawCharacter(ctx, pose, scene.skeleton, c.color, {
      alpha: playing || isSel ? 1 : 0.55,
      showJoints: !playing && isSel,
      charId: c.id,
    });
  }
}

/* ---------- Hit testing / dragging ---------- */

function toWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * WORLD_W,
    y: ((clientY - rect.top) / rect.height) * WORLD_H,
  };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function findNearestJoint(worldPt, maxDist) {
  let best = null;
  let bestD = maxDist;
  const frame = currentFrame();
  for (const c of scene.characters) {
    const pose = poseFor(c.id, frame);
    const points = computePoints(pose, scene.skeleton);
    const dRoot = dist(worldPt, { x: pose.x, y: pose.y });
    if (dRoot < bestD) {
      bestD = dRoot;
      best = { charId: c.id, kind: "root" };
    }
    for (const bone of scene.skeleton) {
      const d = dist(worldPt, points[bone.id].end);
      if (d < bestD) {
        bestD = d;
        best = { charId: c.id, kind: "bone", boneId: bone.id };
      }
    }
  }
  return best;
}

function snapshotFramePoses() {
  return JSON.parse(JSON.stringify(currentFrame().poses));
}

function pushUndo() {
  undoStack.push({ frameIndex: scene.currentFrameIndex, poses: snapshotFramePoses() });
  if (undoStack.length > 25) undoStack.shift();
}

function undo() {
  const last = undoStack.pop();
  if (!last) return;
  scene.frames[last.frameIndex].poses = last.poses;
  render();
  refreshThumb(last.frameIndex);
  saveAll();
}

canvas.addEventListener("pointerdown", (e) => {
  if (playing) return;
  const pt = toWorld(e.clientX, e.clientY);

  if (addJointMode) {
    const hit = findNearestJoint(pt, 26);
    if (hit) {
      const parentBoneId = hit.kind === "bone" ? hit.boneId : null;
      scene.skeleton.push({ id: uid("bone"), parent: parentBoneId, len: 20, rel0: 0, w: 4 });
      saveAll();
      render();
    }
    addJointMode = false;
    jointBtn.classList.remove("active");
    setHint("");
    return;
  }

  const hit = findNearestJoint(pt, 22);
  if (!hit) return;
  if (hit.charId !== selectedCharId) {
    selectedCharId = hit.charId;
    syncCharUI();
  }
  pushUndo();
  dragging = { ...hit };
  canvas.setPointerCapture(e.pointerId);
  render();
});

canvas.addEventListener("pointermove", (e) => {
  if (!dragging || playing) return;
  const pt = toWorld(e.clientX, e.clientY);
  const frame = currentFrame();
  const pose = poseFor(dragging.charId, frame);

  if (dragging.kind === "root") {
    pose.x = Math.max(10, Math.min(WORLD_W - 10, pt.x));
    pose.y = Math.max(10, Math.min(WORLD_H - 10, pt.y));
  } else {
    const points = computePoints(pose, scene.skeleton);
    const bone = scene.skeleton.find((b) => b.id === dragging.boneId);
    const start = bone.parent ? points[bone.parent].end : { x: pose.x, y: pose.y };
    const parentAbs = bone.parent ? points[bone.parent].absAngle : 0;
    const absAngle = (Math.atan2(pt.y - start.y, pt.x - start.x) * 180) / Math.PI;
    pose.angles[bone.id] = absAngle - parentAbs;
  }
  render();
});

function endDrag() {
  if (!dragging) return;
  dragging = null;
  refreshThumb(scene.currentFrameIndex);
  saveAll();
  render();
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

function setHint(text) {
  hint.textContent = text;
  hint.hidden = !text;
}

/* ---------- Characters UI ---------- */

function syncCharUI() {
  charStrip.innerHTML = "";
  scene.characters.forEach((c) => {
    const chip = document.createElement("button");
    chip.className = "char-chip" + (c.id === selectedCharId ? " active" : "");
    chip.style.background = c.color;
    chip.title = c.name;
    chip.addEventListener("click", () => {
      selectedCharId = c.id;
      syncCharUI();
      render();
    });
    charStrip.appendChild(chip);
  });

  colorStrip.innerHTML = "";
  PALETTE.forEach((color) => {
    const sw = document.createElement("button");
    sw.className = "color-swatch";
    sw.style.background = color;
    const cur = scene.characters.find((c) => c.id === selectedCharId);
    if (cur && cur.color === color) sw.classList.add("active");
    sw.addEventListener("click", () => {
      if (!cur) return;
      cur.color = color;
      syncCharUI();
      render();
      saveAll();
    });
    colorStrip.appendChild(sw);
  });
}

document.getElementById("btn-char-add").addEventListener("click", () => {
  const idx = scene.characters.length;
  const color = PALETTE[idx % PALETTE.length];
  const c = { id: uid("char"), color, name: "Персонаж " + (idx + 1) };
  scene.characters.push(c);
  scene.frames.forEach((f, i) => {
    f.poses[c.id] = defaultPoseFor(idx);
  });
  selectedCharId = c.id;
  syncCharUI();
  rebuildThumbs();
  render();
  saveAll();
});

document.getElementById("btn-char-remove").addEventListener("click", () => {
  if (scene.characters.length <= 1) {
    setHint("Нужен хотя бы один персонаж");
    setTimeout(() => setHint(""), 1800);
    return;
  }
  scene.characters = scene.characters.filter((c) => c.id !== selectedCharId);
  scene.frames.forEach((f) => delete f.poses[selectedCharId]);
  selectedCharId = scene.characters[0].id;
  syncCharUI();
  rebuildThumbs();
  render();
  saveAll();
});

jointBtn.addEventListener("click", () => {
  addJointMode = !addJointMode;
  jointBtn.classList.toggle("active", addJointMode);
  setHint(addJointMode ? "Нажмите на существующий сустав, чтобы добавить новый" : "");
});

ghostBtn.addEventListener("click", () => {
  ghostOn = !ghostOn;
  ghostBtn.classList.toggle("active", ghostOn);
  render();
});

document.getElementById("btn-undo").addEventListener("click", undo);

/* ---------- Frames / timeline ---------- */

function renderThumbDataUrl(frame) {
  const tw = 72, th = 92;
  const tc = document.createElement("canvas");
  tc.width = tw;
  tc.height = th;
  const tctx = tc.getContext("2d");
  const scale = tw / WORLD_W;
  tctx.setTransform(scale, 0, 0, scale, 0, 0);
  const bg = BACKGROUNDS.find((b) => b.id === scene.background) || BACKGROUNDS[0];
  bg.draw(tctx, WORLD_W, WORLD_H);
  for (const c of scene.characters) {
    const pose = frame.poses[c.id];
    if (pose) drawCharacter(tctx, pose, scene.skeleton, c.color, { showJoints: false });
  }
  return tc.toDataURL();
}

function rebuildThumbs() {
  framesStrip.innerHTML = "";
  scene.frames.forEach((f, i) => {
    const item = document.createElement("button");
    item.className = "frame-item" + (i === scene.currentFrameIndex ? " active" : "");
    item.dataset.index = i;
    const img = document.createElement("img");
    img.src = renderThumbDataUrl(f);
    const label = document.createElement("span");
    label.textContent = i + 1;
    item.appendChild(img);
    item.appendChild(label);
    item.addEventListener("click", () => selectFrame(i));
    framesStrip.appendChild(item);
  });
  framesStrip.scrollLeft = framesStrip.scrollWidth;
}

function refreshThumb(index) {
  const item = framesStrip.querySelector(`[data-index="${index}"]`);
  if (!item) return rebuildThumbs();
  const img = item.querySelector("img");
  img.src = renderThumbDataUrl(scene.frames[index]);
}

function selectFrame(i) {
  scene.currentFrameIndex = i;
  frameHoldInput.value = scene.frames[i].hold;
  Array.from(framesStrip.children).forEach((el, idx) => el.classList.toggle("active", idx === i));
  render();
  saveAll();
}

document.getElementById("btn-frame-add").addEventListener("click", () => {
  const clone = JSON.parse(JSON.stringify(currentFrame().poses));
  const f = { id: uid("frame"), hold: 2, poses: clone };
  scene.frames.splice(scene.currentFrameIndex + 1, 0, f);
  scene.currentFrameIndex += 1;
  rebuildThumbs();
  frameHoldInput.value = f.hold;
  render();
  saveAll();
});

document.getElementById("btn-frame-dup").addEventListener("click", () => {
  const clone = JSON.parse(JSON.stringify(currentFrame().poses));
  const f = { id: uid("frame"), hold: currentFrame().hold, poses: clone };
  scene.frames.splice(scene.currentFrameIndex + 1, 0, f);
  scene.currentFrameIndex += 1;
  rebuildThumbs();
  render();
  saveAll();
});

document.getElementById("btn-frame-del").addEventListener("click", () => {
  if (scene.frames.length <= 1) {
    setHint("Нужен хотя бы один кадр");
    setTimeout(() => setHint(""), 1800);
    return;
  }
  scene.frames.splice(scene.currentFrameIndex, 1);
  scene.currentFrameIndex = Math.max(0, scene.currentFrameIndex - 1);
  rebuildThumbs();
  frameHoldInput.value = currentFrame().hold;
  render();
  saveAll();
});

frameHoldInput.addEventListener("change", () => {
  const v = Math.max(1, Math.min(30, parseInt(frameHoldInput.value, 10) || 1));
  currentFrame().hold = v;
  frameHoldInput.value = v;
  saveAll();
});

fpsInput.addEventListener("change", () => {
  const v = Math.max(1, Math.min(60, parseInt(fpsInput.value, 10) || 12));
  scene.fps = v;
  fpsInput.value = v;
  saveAll();
});

/* ---------- Playback ---------- */

function stopPlayback() {
  playing = false;
  playBtn.classList.remove("active");
  playBtn.textContent = "▶";
  if (playTimer) clearTimeout(playTimer);
  render();
}

function startPlayback() {
  if (scene.frames.length < 1) return;
  playing = true;
  playBtn.classList.add("active");
  playBtn.textContent = "⏸";
  let i = scene.currentFrameIndex;
  const step = () => {
    if (!playing) return;
    scene.currentFrameIndex = i;
    render();
    const frame = scene.frames[i];
    const ms = (frame.hold / scene.fps) * 1000;
    i = (i + 1) % scene.frames.length;
    playTimer = setTimeout(step, ms);
  };
  step();
}

playBtn.addEventListener("click", () => {
  if (playing) stopPlayback();
  else startPlayback();
});

/* ---------- Background panel ---------- */

function buildBgPanel() {
  bgStrip.innerHTML = "";
  BACKGROUNDS.forEach((b) => {
    const sw = document.createElement("button");
    sw.className = "bg-swatch" + (scene.background === b.id ? " active" : "");
    const c = document.createElement("canvas");
    c.width = 40;
    c.height = 40;
    b.draw(c.getContext("2d"), 40, 40);
    sw.appendChild(c);
    const label = document.createElement("span");
    label.textContent = b.name;
    sw.appendChild(label);
    sw.addEventListener("click", () => {
      scene.background = b.id;
      buildBgPanel();
      rebuildThumbs();
      render();
      saveAll();
    });
    bgStrip.appendChild(sw);
  });
}

document.getElementById("btn-bg").addEventListener("click", () => {
  bgPanel.hidden = !bgPanel.hidden;
  scenesPanel.hidden = true;
});
document.getElementById("bg-close").addEventListener("click", () => (bgPanel.hidden = true));

/* ---------- Scenes panel ---------- */

function buildScenesPanel() {
  scenesList.innerHTML = "";
  scenes.forEach((s) => {
    const row = document.createElement("div");
    row.className = "scene-row" + (s.id === activeSceneId ? " active" : "");
    const nameBtn = document.createElement("button");
    nameBtn.className = "scene-name-btn";
    nameBtn.textContent = s.name;
    nameBtn.addEventListener("click", () => {
      stopPlayback();
      activeSceneId = s.id;
      scene = s;
      selectedCharId = scene.characters[0] ? scene.characters[0].id : null;
      afterSceneSwitch();
      scenesPanel.hidden = true;
    });
    const delBtn = document.createElement("button");
    delBtn.className = "scene-del-btn";
    delBtn.textContent = "✕";
    delBtn.addEventListener("click", () => {
      if (scenes.length <= 1) return;
      scenes = scenes.filter((x) => x.id !== s.id);
      if (activeSceneId === s.id) {
        activeSceneId = scenes[0].id;
        scene = scenes[0];
        selectedCharId = scene.characters[0] ? scene.characters[0].id : null;
        afterSceneSwitch();
      }
      buildScenesPanel();
      saveAll();
    });
    row.appendChild(nameBtn);
    row.appendChild(delBtn);
    scenesList.appendChild(row);
  });
}

function afterSceneSwitch() {
  sceneNameEl.textContent = scene.name;
  fpsInput.value = scene.fps;
  frameHoldInput.value = currentFrame().hold;
  ghostOn = false;
  ghostBtn.classList.remove("active");
  syncCharUI();
  buildBgPanel();
  rebuildThumbs();
  render();
  saveAll();
}

document.getElementById("btn-scene-new").addEventListener("click", () => {
  const s = makeDefaultScene();
  s.name = "Сцена " + (scenes.length + 1);
  scenes.push(s);
  activeSceneId = s.id;
  scene = s;
  selectedCharId = scene.characters[0].id;
  afterSceneSwitch();
  buildScenesPanel();
  scenesPanel.hidden = true;
});

document.getElementById("btn-scenes").addEventListener("click", () => {
  buildScenesPanel();
  scenesPanel.hidden = !scenesPanel.hidden;
  bgPanel.hidden = true;
});
document.getElementById("scenes-close").addEventListener("click", () => (scenesPanel.hidden = true));

sceneNameEl.addEventListener("click", () => {
  const name = prompt("Название сцены", scene.name);
  if (name && name.trim()) {
    scene.name = name.trim();
    sceneNameEl.textContent = scene.name;
    saveAll();
  }
});

/* ---------- Export video ---------- */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function exportVideo() {
  if (typeof MediaRecorder === "undefined" || !canvas.captureStream) {
    await exportPngSequence();
    return;
  }
  const mimeCandidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4",
  ];
  const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m));
  if (!mime) {
    await exportPngSequence();
    return;
  }

  const wasPlaying = playing;
  stopPlayback();
  exportOverlay.hidden = false;
  exportProgress.textContent = "0%";

  const scale = 2;
  const ec = document.createElement("canvas");
  ec.width = WORLD_W * scale;
  ec.height = WORLD_H * scale;
  const ectx = ec.getContext("2d");
  ectx.setTransform(scale, 0, 0, scale, 0, 0);

  const drawFrame = (frame) => {
    ectx.clearRect(0, 0, WORLD_W, WORLD_H);
    const bg = BACKGROUNDS.find((b) => b.id === scene.background) || BACKGROUNDS[0];
    bg.draw(ectx, WORLD_W, WORLD_H);
    for (const c of scene.characters) {
      const pose = frame.poses[c.id];
      if (pose) drawCharacter(ectx, pose, scene.skeleton, c.color, { showJoints: false });
    }
  };

  drawFrame(scene.frames[0]);
  const stream = ec.captureStream(scene.fps);
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((res) => (recorder.onstop = res));
  recorder.start();

  const total = scene.frames.length;
  for (let i = 0; i < total; i++) {
    drawFrame(scene.frames[i]);
    exportProgress.textContent = Math.round(((i + 1) / total) * 100) + "%";
    const ms = (scene.frames[i].hold / scene.fps) * 1000;
    await sleep(Math.max(ms, 1000 / scene.fps));
  }
  await sleep(200);
  recorder.stop();
  await stopped;

  const blob = new Blob(chunks, { type: mime.split(";")[0] });
  const ext = mime.includes("mp4") ? "mp4" : "webm";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizeFilename(scene.name) + "." + ext;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);

  exportOverlay.hidden = true;
  if (wasPlaying) startPlayback();
}

async function exportPngSequence() {
  exportOverlay.hidden = false;
  exportProgress.textContent = "PNG 0%";
  const scale = 2;
  const ec = document.createElement("canvas");
  ec.width = WORLD_W * scale;
  ec.height = WORLD_H * scale;
  const ectx = ec.getContext("2d");
  ectx.setTransform(scale, 0, 0, scale, 0, 0);
  const total = scene.frames.length;
  for (let i = 0; i < total; i++) {
    ectx.clearRect(0, 0, WORLD_W, WORLD_H);
    const bg = BACKGROUNDS.find((b) => b.id === scene.background) || BACKGROUNDS[0];
    bg.draw(ectx, WORLD_W, WORLD_H);
    const frame = scene.frames[i];
    for (const c of scene.characters) {
      const pose = frame.poses[c.id];
      if (pose) drawCharacter(ectx, pose, scene.skeleton, c.color, { showJoints: false });
    }
    const blob = await new Promise((res) => ec.toBlob(res, "image/png"));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFilename(scene.name)}_${String(i + 1).padStart(3, "0")}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    exportProgress.textContent = "PNG " + Math.round(((i + 1) / total) * 100) + "%";
    await sleep(60);
  }
  exportOverlay.hidden = true;
}

function sanitizeFilename(name) {
  return (name || "stickanim").replace(/[^a-zA-Zа-яА-Я0-9_-]+/g, "_").slice(0, 40) || "stickanim";
}

document.getElementById("btn-export").addEventListener("click", () => {
  stopPlayback();
  exportVideo();
});

/* ---------- Init ---------- */

function init() {
  loadAll();
  scene = scenes.find((s) => s.id === activeSceneId);
  sceneNameEl.textContent = scene.name;
  fpsInput.value = scene.fps;
  frameHoldInput.value = currentFrame().hold;
  syncCharUI();
  buildBgPanel();
  buildScenesPanel();
  rebuildThumbs();
  render();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

init();
