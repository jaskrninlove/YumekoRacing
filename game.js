const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.disableVerticalSwipes?.();
}

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const startScreen = document.getElementById("startScreen");
const gameOverScreen = document.getElementById("gameOverScreen");
const finalStats = document.getElementById("finalStats");

const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const submitBtn = document.getElementById("submitBtn");
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");

const url = new URLSearchParams(location.search);
const chatId = url.get("chat") || "0";
const userId = url.get("user") || "0";

let audioCtx = null;
let soundEnabled = true;
let engineOsc = null;
let engineGain = null;

function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    soundEnabled = false;
  }
}

function beep(freq = 440, duration = 0.08, type = "square", gain = 0.035) {
  if (!soundEnabled || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.value = gain;
  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start();
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  osc.stop(audioCtx.currentTime + duration);
}

function sfxStart() {
  beep(440, .08); setTimeout(() => beep(660, .08), 90); setTimeout(() => beep(880, .12), 180);
}
function sfxMove() { beep(260, .035, "triangle", .018); }
function sfxCoin() { beep(880, .05, "sine", .035); setTimeout(() => beep(1320, .06, "sine", .03), 55); }
function sfxNitro() { beep(120, .09, "sawtooth", .045); setTimeout(() => beep(180, .12, "sawtooth", .04), 70); }
function sfxCrash() { beep(90, .18, "sawtooth", .06); setTimeout(() => beep(55, .22, "square", .04), 90); }
function sfxLevel() { beep(523, .08); setTimeout(() => beep(659, .08), 90); setTimeout(() => beep(784, .12), 180); }

function startEngine() {
  if (!soundEnabled || !audioCtx || engineOsc) return;
  engineOsc = audioCtx.createOscillator();
  engineGain = audioCtx.createGain();
  engineOsc.type = "sawtooth";
  engineOsc.frequency.value = 65;
  engineGain.gain.value = 0.012;
  engineOsc.connect(engineGain);
  engineGain.connect(audioCtx.destination);
  engineOsc.start();
}

function stopEngine() {
  if (!engineOsc || !audioCtx) return;
  engineGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + .25);
  engineOsc.stop(audioCtx.currentTime + .28);
  engineOsc = null;
  engineGain = null;
}

function updateEngine() {
  if (!engineOsc) return;
  engineOsc.frequency.value = 65 + speed * 7 + (nitroTime > 0 ? 60 : 0);
  engineGain.gain.value = nitroTime > 0 ? 0.026 : 0.012;
}

let W = 0, H = 0, DPR = 1;
let running = false, frame = 0;
let lane = 1, targetLane = 1, lanes = [0, 0, 0], carX = 0;
let speed = 5.2, baseSpeed = 5.2, level = 1;
let score = 0, coins = 0, distance = 0;
let nitro = 3, nitroTime = 0;
let obstacles = [], coinItems = [], particles = [];
let roadOffset = 0, mapIndex = 0;
let lastTap = 0, touchStartX = 0, touchStartY = 0;

const maps = [
  { road: "#8e949c", edge: "#ef4444", grass: "#275f13", bg: "#08111f" },
  { road: "#424a55", edge: "#f59e0b", grass: "#064e3b", bg: "#061a23" },
  { road: "#2d3340", edge: "#38bdf8", grass: "#1e293b", bg: "#0f1020" },
  { road: "#a3a3a3", edge: "#f43f5e", grass: "#365314", bg: "#21120b" }
];

function resize() {
  DPR = window.devicePixelRatio || 1;
  W = innerWidth;
  H = innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  lanes = [W * .31, W * .50, W * .69];
  if (!carX) carX = lanes[lane];
}
addEventListener("resize", resize);
resize();

function reset() {
  running = false;
  frame = 0;
  lane = 1;
  targetLane = 1;
  carX = lanes[1];
  baseSpeed = 5.2;
  speed = baseSpeed;
  level = 1;
  score = 0;
  coins = 0;
  distance = 0;
  nitro = 3;
  nitroTime = 0;
  obstacles = [];
  coinItems = [];
  particles = [];
  roadOffset = 0;
  mapIndex = 0;
}

function start() {
  initAudio();
  sfxStart();
  reset();
  running = true;
  startEngine();
  startScreen.classList.add("hidden");
  gameOverScreen.classList.add("hidden");
  requestAnimationFrame(loop);
}

function end() {
  if (!running) return;
  sfxCrash();
  stopEngine();
  running = false;
  finalStats.innerHTML = `Score: <b>${score}</b><br>Distance: <b>${Math.floor(distance)}m</b><br>Coins: <b>${coins}</b><br>Level: <b>${level}</b>`;
  gameOverScreen.classList.remove("hidden");
}

function rr(x, y, w, h, r, f) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = f;
  ctx.fill();
}

function drawTree(x, y, k) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.beginPath();
  ctx.ellipse(3, 8, 28, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = k ? "#15803d" : "#22c55e";
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#14532d";
  ctx.beginPath();
  ctx.arc(-10, -5, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function bg() {
  const m = maps[mapIndex % maps.length];
  ctx.fillStyle = m.bg;
  ctx.fillRect(0, 0, W, H);

  const rx = W * .15, rw = W * .70;
  ctx.fillStyle = m.grass;
  ctx.fillRect(0, 0, rx, H);
  ctx.fillRect(W * .85, 0, W * .15, H);

  for (let i = 0; i < 14; i++) {
    const y = (i * 120 + roadOffset * .35) % (H + 140) - 80;
    drawTree(W * .07, y, i % 2);
    drawTree(W * .93, y + 50, (i + 1) % 2);
  }

  ctx.fillStyle = m.road;
  ctx.fillRect(rx, 0, rw, H);

  const b = 38;
  for (let y = -b * 2; y < H + b; y += b) {
    const yy = y + (roadOffset % (b * 2));
    ctx.fillStyle = m.edge;
    ctx.fillRect(rx - 18, yy, 18, b);
    ctx.fillRect(rx + rw, yy, 18, b);
    ctx.fillStyle = "#fff";
    ctx.fillRect(rx - 18, yy + b, 18, b);
    ctx.fillRect(rx + rw, yy + b, 18, b);
  }

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 7;
  ctx.setLineDash([42, 42]);
  ctx.lineDashOffset = -roadOffset;
  ctx.beginPath();
  ctx.moveTo(W * .40, 0);
  ctx.lineTo(W * .40, H);
  ctx.moveTo(W * .60, 0);
  ctx.lineTo(W * .60, H);
  ctx.stroke();
  ctx.setLineDash([]);
}

function car(x, y, color, s = 1, player = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  ctx.shadowColor = "rgba(0,0,0,.55)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 7;

  ctx.fillStyle = "#0b0b0b";
  ctx.fillRect(-34, -42, 13, 31);
  ctx.fillRect(21, -42, 13, 31);
  ctx.fillRect(-34, 18, 13, 31);
  ctx.fillRect(21, 18, 13, 31);

  const g = ctx.createLinearGradient(0, -70, 0, 70);
  g.addColorStop(0, "#e0f2fe");
  g.addColorStop(.17, color);
  g.addColorStop(.78, color);
  g.addColorStop(1, "#111827");
  ctx.fillStyle = g;

  ctx.beginPath();
  ctx.moveTo(0, -72);
  ctx.bezierCurveTo(34, -42, 37, 28, 0, 68);
  ctx.bezierCurveTo(-37, 28, -34, -42, 0, -72);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.fillRect(-42, -65, 84, 13);
  ctx.fillRect(-36, 54, 72, 12);

  rr(-11, -15, 22, 34, 7, "rgba(8,15,25,.8)");

  ctx.fillStyle = "rgba(255,255,255,.35)";
  ctx.fillRect(-6, -54, 12, 28);

  if (player && nitroTime > 0) {
    ctx.fillStyle = "rgba(255,159,28,.9)";
    ctx.beginPath();
    ctx.moveTo(-16, 68);
    ctx.lineTo(0, 112);
    ctx.lineTo(16, 68);
    ctx.fill();
  }

  ctx.restore();
}

function spawnObs() {
  const l = Math.floor(Math.random() * 3);
  const cs = ["#ef4444", "#facc15", "#22c55e", "#a855f7"];
  obstacles.push({ x: lanes[l], y: -120, color: cs[Math.floor(Math.random() * cs.length)] });
}

function spawnCoin() {
  const l = Math.floor(Math.random() * 3);
  coinItems.push({ x: lanes[l], y: -40, spin: 0 });
}

function coin(c) {
  c.spin += .16;
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.scale(Math.abs(Math.cos(c.spin)) * .7 + .3, 1);
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd23f";
  ctx.fill();
  ctx.strokeStyle = "#fff7ad";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#b45309";
  ctx.font = "900 14px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("¥", 0, 1);
  ctx.restore();
}

function update() {
  const sp = speed + (nitroTime > 0 ? 4.5 : 0);
  obstacles.forEach(o => o.y += sp);
  coinItems.forEach(c => c.y += sp);

  obstacles = obstacles.filter(o => o.y < H + 150);
  coinItems = coinItems.filter(c => c.y < H + 70);

  const py = H - 104;

  for (const o of obstacles) {
    if (Math.abs(o.x - carX) < 34 && Math.abs(o.y - py) < 60) {
      end();
      return;
    }
  }

  for (const c of coinItems) {
    if (!c.hit && Math.abs(c.x - carX) < 36 && Math.abs(c.y - py) < 58) {
      c.hit = true;
      coins++;
      score += 35;
      sfxCoin();
      particles.push({ x: c.x, y: c.y, t: 30, text: "+1" });
    }
  }

  coinItems = coinItems.filter(c => !c.hit);
}

function parts() {
  for (const p of particles) {
    p.t--;
    ctx.globalAlpha = Math.max(0, p.t / 30);
    ctx.fillStyle = "#ffd23f";
    ctx.font = "900 22px Arial";
    ctx.textAlign = "center";
    ctx.fillText(p.text, p.x, p.y - p.t);
    ctx.globalAlpha = 1;
  }
  particles = particles.filter(p => p.t > 0);
}

function drawControlsHint() {
  if (!running) return;
  ctx.globalAlpha = .65;
  rr(18, H - 96, 72, 72, 36, "rgba(0,0,0,.42)");
  rr(W - 90, H - 96, 72, 72, 36, "rgba(0,0,0,.42)");
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#fff";
  ctx.font = "900 32px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("‹", 54, H - 60);
  ctx.fillText("›", W - 54, H - 60);
  ctx.textBaseline = "alphabetic";
}

function hud() {
  rr(14, 14, 150, 82, 18, "rgba(3,7,18,.58)");
  ctx.fillStyle = "#fff";
  ctx.font = "900 16px Arial";
  ctx.textAlign = "left";
  ctx.fillText("SCORE " + score, 28, 40);
  ctx.fillText("COINS " + coins, 28, 63);
  ctx.fillText("NITRO " + nitro, 28, 86);

  rr(W - 120, 14, 104, 52, 17, "rgba(255,255,255,.9)");
  ctx.fillStyle = "#0b1020";
  ctx.font = "1000 18px Arial";
  ctx.textAlign = "center";
  ctx.fillText("LV " + level, W - 68, 47);
  ctx.font = "900 20px Arial";
  ctx.fillText(soundEnabled ? "🔊" : "🔇", W - 30, 92);

  if (frame < 180) {
    ctx.globalAlpha = 1 - frame / 180;
    rr(W / 2 - 120, H - 148, 240, 42, 18, "rgba(0,0,0,.45)");
    ctx.fillStyle = "#fff";
    ctx.font = "800 14px Arial";
    ctx.fillText("Tap buttons / Swipe • Double tap Nitro", W / 2, H - 122);
    ctx.globalAlpha = 1;
  }
}

function lvl() {
  const nl = Math.floor(distance / 360) + 1;
  if (nl !== level) {
    level = nl;
    baseSpeed += .55;
    speed = baseSpeed;
    mapIndex = (level - 1) % maps.length;
    sfxLevel();
  }
}

function loop() {
  if (!running) return;

  frame++;
  const sp = speed + (nitroTime > 0 ? 4.5 : 0);

  updateEngine();
  roadOffset += sp;
  distance += sp * .22;
  score = Math.floor(distance * 2) + coins * 35 + level * 15;

  if (nitroTime > 0) nitroTime--;

  if (frame % Math.max(24, 62 - level * 4) === 0) spawnObs();
  if (frame % 88 === 0) spawnCoin();

  lvl();

  carX += (lanes[targetLane] - carX) * .22;

  update();
  bg();
  coinItems.forEach(coin);
  obstacles.forEach(o => car(o.x, o.y, o.color, .62));

  if (nitroTime > 0) {
    ctx.fillStyle = "rgba(255,159,28,.12)";
    ctx.fillRect(0, 0, W, H);
  }

  car(carX, H - 104, "#0ea5e9", .82, true);
  parts();
  hud();
  drawControlsHint();

  requestAnimationFrame(loop);
}

function left() {
  const old = targetLane;
  targetLane = Math.max(0, targetLane - 1);
  if (old !== targetLane) sfxMove();
}

function right() {
  const old = targetLane;
  targetLane = Math.min(2, targetLane + 1);
  if (old !== targetLane) sfxMove();
}

function nitroFn() {
  if (!running || nitro <= 0 || nitroTime > 0) return;
  nitro--;
  nitroTime = 120;
  sfxNitro();
}

canvas.addEventListener("touchstart", e => {
  const t = e.changedTouches[0];
  touchStartX = t.clientX;
  touchStartY = t.clientY;

  const now = Date.now();
  if (now - lastTap < 280) nitroFn();
  lastTap = now;
}, { passive: false });

canvas.addEventListener("touchend", e => {
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStartX;
  const dy = t.clientY - touchStartY;

  if (t.clientX > W - 70 && t.clientY < 120) {
    soundEnabled = !soundEnabled;
    if (!soundEnabled) stopEngine();
    else {
      initAudio();
      if (running) startEngine();
    }
    return;
  }

  if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) {
    dx < 0 ? left() : right();
  }
}, { passive: false });

canvas.addEventListener("mousedown", e => {
  if (e.clientX < W * .35) left();
  else if (e.clientX > W * .65) right();
});

window.addEventListener("keydown", e => {
  if (e.key === "ArrowLeft") left();
  if (e.key === "ArrowRight") right();
  if (e.key === " ") nitroFn();
});

leftBtn.addEventListener("click", left);
rightBtn.addEventListener("click", right);

leftBtn.addEventListener("touchstart", e => {
  e.preventDefault();
  left();
}, { passive: false });

rightBtn.addEventListener("touchstart", e => {
  e.preventDefault();
  right();
}, { passive: false });

startBtn.onclick = start;
restartBtn.onclick = start;

submitBtn.onclick = async () => {
  const payload = {
    type: "racing_score",
    chat_id: chatId,
    user_id: userId,
    score,
    coins,
    distance: Math.floor(distance),
    level
  };

  submitBtn.disabled = true;
  submitBtn.textContent = "SUBMITTING...";

  try {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.ok) {
      submitBtn.textContent = "SUBMITTED ✅";
      alert(`Score submitted! Coins +${data.reward_coins}, XP +${data.reward_xp}`);
    } else {
      submitBtn.disabled = false;
      submitBtn.textContent = "SUBMIT SCORE";
      alert(data.error || "Submit failed");
    }
  } catch {
    submitBtn.disabled = false;
    submitBtn.textContent = "SUBMIT SCORE";
    alert("Submit failed");
  }
};

bg();
car(W / 2, H - 104, "#0ea5e9", .82, true);
