/* ===================== EDIT HERE AFTER LAUNCH ===================== */
// Paste the contract address between the quotes. Leave "" until launch.
const CA = "";
// Your X profile link.
const X_URL = "https://x.com";
// Market cap where tank growth starts (level 1). Every further 3x grows the scene one level.
const START_MC = 5000;
// Holder room ("Enter the room"): read-only balance check via a public Solana RPC.
const RPC_URL = "https://api.mainnet-beta.solana.com";        // put your own RPC here for reliability (e.g. a free Helius key)
const RPC_FALLBACK = "https://public.rpc.solanavibestation.com";
const MIN_HOLD = 0;                                             // tokens needed; entry when balance > MIN_HOLD
// While CA is empty the gate runs in test mode and lets everyone in. Turns off automatically once CA is set.
const TEST_UNLOCK = true;
/* ================================================================== */

const PLACEHOLDER = "CA coming soon";
const $ = s => document.querySelector(s);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/* ---------- CA box + buttons (all driven by the CA constant) ---------- */
$("#caText").textContent = CA || PLACEHOLDER;
$("#buyBtn").href = CA ? "https://pump.fun/coin/" + CA : "https://pump.fun";
$("#xBtn").href = X_URL;
$("#copyBtn").addEventListener("click", async () => {
  const b = $("#copyBtn");
  if (!CA) { b.textContent = "Soon"; setTimeout(() => b.textContent = "Copy", 1200); return; }
  try { await navigator.clipboard.writeText(CA); }
  catch { const t = document.createElement("textarea"); t.value = CA; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
  b.textContent = "Copied"; setTimeout(() => b.textContent = "Copy", 1400);
});

/* ---------- tabs ---------- */
document.querySelectorAll(".tabs button").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".tabs button,.tab").forEach(e => e.classList.remove("on"));
  btn.classList.add("on"); $("#tab-" + btn.dataset.tab).classList.add("on");
}));

/* ======================================================================
   DATA SOURCE
   fetchSenses() is the single place where market data comes in.
   It must return { snacks, salt, vibes, sunshine } each 0..1, plus
   { buys, sells, notes, marketCap } for the UI. With no CA it uses simulated test data.
   ====================================================================== */
let sim = { price: 1, trend: 0, mc: START_MC, drift: Math.log(3) / 150 }; // test mode: ~one 3x step every 2.5 min
function simSenses() {
  sim.trend = clamp(sim.trend * 0.92 + (Math.random() - 0.48) * 0.06, -0.3, 0.3);
  sim.price *= 1 + sim.trend * 0.05;
  const buys = Math.random() < 0.55 ? Math.floor(Math.random() * (sim.trend > 0 ? 5 : 3)) : 0;
  const sells = Math.random() < 0.35 ? Math.floor(Math.random() * (sim.trend < 0 ? 5 : 2)) : 0;
  const vibes = clamp(0.25 + Math.sin(Date.now() / 9000) * 0.25 + Math.random() * 0.3);
  if (sim.mc > START_MC * Math.pow(3, 8)) sim.drift = -Math.abs(sim.drift);
  if (sim.mc < START_MC * 0.8) sim.drift = Math.abs(sim.drift);
  sim.mc *= Math.exp(sim.drift + sim.trend * 0.01 + (Math.random() - 0.5) * 0.01);
  if (!CA) chartOnSimTick(sim.mc);
  return {
    snacks: clamp(buys / 4), salt: clamp(sells / 4 + Math.max(0, -sim.trend) * 1.5),
    vibes, sunshine: clamp(0.5 + sim.trend * 2.5), buys, sells, marketCap: sim.mc,
    notes: { snacks: `${buys} simulated buys this second`, salt: sells ? `${sells} simulated sells, a bit salty` : "nothing salty right now",
             vibes: "simulated chatter", sunshine: `simulated trend ${(sim.trend * 100).toFixed(1)}%` }
  };
}

let realCache = null, realAt = 0, lastTx = null;
async function realSenses() {
  // DexScreener public API (allows browser requests). Refresh every 15 s.
  if (!realCache || Date.now() - realAt > 15000) {
    realAt = Date.now();
    try {
      const r = await fetch("https://api.dexscreener.com/latest/dex/tokens/" + CA);
      const d = await r.json();
      const p = (d.pairs || []).sort((a, b) => ((b.liquidity || {}).usd || 0) - ((a.liquidity || {}).usd || 0))[0];
      if (p) { realCache = p; chartOnDexSnapshot(p); }
    } catch (e) { /* keep last value */ }
  }
  if (!realCache) return null;
  const t = (realCache.txns || {}).m5 || { buys: 0, sells: 0 };
  const pc = realCache.priceChange || {};
  // Turn 5 minute counts into "new since last read" so buys appear as snacks.
  let buys = 0, sells = 0;
  if (lastTx) { buys = Math.max(0, t.buys - lastTx.buys); sells = Math.max(0, t.sells - lastTx.sells); }
  lastTx = { buys: t.buys, sells: t.sells };
  return {
    snacks: clamp(t.buys / 40), salt: clamp(t.sells / 40 + Math.max(0, -(pc.m5 || 0)) / 15),
    vibes: clamp(0.3 + Math.random() * 0.3), // no free social feed: estimated
    sunshine: clamp(((pc.h1 || 0) + 20) / 40), buys, sells, marketCap: realCache.marketCap || realCache.fdv || 0,
    notes: { snacks: `${t.buys} buys in the last 5 min`, salt: `${t.sells} sells, price ${(pc.m5 || 0).toFixed(1)}% in 5 min`,
             vibes: "estimated (no live social feed yet)", sunshine: `price ${(pc.h1 || 0).toFixed(1)}% in 1 h` }
  };
}

/* ======================================================================
   WALL CHART DATA
   One model for the 3D wall screen: market-cap candles (price x supply).
   - no CA: simulated history ("test data")
   - CA set: GeckoTerminal 1-minute OHLCV for the biggest DexScreener pool,
     refreshed every 60 s, with the live DexScreener value appended between
     refreshes. If OHLCV fails, DexScreener snapshots build a line chart.
   ====================================================================== */
const OHLCV_EVERY = 60000, CHART_MAX = 200, SIM_CANDLE_SECS = 10;
const chart = { candles: [], kind: "candles", source: CA ? "live · loading" : "test data (simulated)", change: null, changeLabel: "", version: 0 };
let ohlcvNext = 0, ohlcvOk = false, ohlcvBusy = false;
function bump() { chart.version++; }
function pushCandle(t, o, h, l, c) { chart.candles.push({ t, o, h, l, c }); if (chart.candles.length > CHART_MAX) chart.candles.shift(); }

// simulated history so the wall is never empty before launch
function seedSimChart(endMc) {
  const n = 120, now = Date.now(); let v = endMc, rows = [];
  for (let i = 0; i < n; i++) {
    const c = v, o = c / Math.exp((Math.random() - 0.46) * 0.09);
    rows.push({ t: now - (i + 1) * SIM_CANDLE_SECS * 1000, o, c, h: Math.max(o, c) * (1 + Math.random() * 0.02), l: Math.min(o, c) * (1 - Math.random() * 0.02) });
    v = o;
  }
  chart.candles = rows.reverse(); bump();
}
let simTicks = 0;
function chartOnSimTick(mc) {
  const last = chart.candles[chart.candles.length - 1];
  if (!last || simTicks++ % SIM_CANDLE_SECS === 0) pushCandle(Date.now(), last ? last.c : mc, Math.max(mc, last ? last.c : mc), Math.min(mc, last ? last.c : mc), mc);
  else { last.c = mc; last.h = Math.max(last.h, mc); last.l = Math.min(last.l, mc); }
  const first = chart.candles[0];
  chart.change = first ? (mc / first.o - 1) * 100 : null; chart.changeLabel = "window";
  bump();
}

async function fetchOHLCV(pool, mcPerPrice) {
  if (ohlcvBusy || Date.now() < ohlcvNext) return;
  ohlcvBusy = true; ohlcvNext = Date.now() + OHLCV_EVERY;
  try {
    const r = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/minute?aggregate=1&limit=${CHART_MAX}`);
    if (r.status === 429) { ohlcvNext = Date.now() + 2 * OHLCV_EVERY; throw new Error("rate limited"); }
    const d = await r.json();
    const list = (((d || {}).data || {}).attributes || {}).ohlcv_list || [];
    if (!list.length) throw new Error("no candles");
    chart.candles = list.slice().reverse().map(([ts, o, h, l, c]) => ({ t: ts * 1000, o: o * mcPerPrice, h: h * mcPerPrice, l: l * mcPerPrice, c: c * mcPerPrice }));
    chart.kind = "candles"; chart.source = "live · GeckoTerminal 1m"; ohlcvOk = true; bump();
  } catch (e) {
    if (!ohlcvOk) { chart.kind = "line"; chart.source = "live · DexScreener snapshots"; bump(); }
  } finally { ohlcvBusy = false; }
}
function chartOnDexSnapshot(p) {
  const price = parseFloat(p.priceUsd) || 0, mc = p.marketCap || p.fdv || 0;
  if (!price || !mc) return;
  const now = Date.now();
  if (chart.source === "live · loading" && !ohlcvOk && chart.kind === "candles") chart.kind = "line";
  const last = chart.candles[chart.candles.length - 1];
  if (chart.kind === "candles" && ohlcvOk && last && Math.floor(last.t / 60000) === Math.floor(now / 60000)) {
    last.c = mc; last.h = Math.max(last.h, mc); last.l = Math.min(last.l, mc);   // live value inside the current minute
  } else if (chart.kind === "candles" && ohlcvOk) {
    pushCandle(now, last ? last.c : mc, Math.max(mc, last ? last.c : mc), Math.min(mc, last ? last.c : mc), mc);
  } else {
    pushCandle(now, mc, mc, mc, mc);                                              // snapshot line (fallback / while loading)
  }
  const h24 = (p.priceChange || {}).h24;
  chart.change = typeof h24 === "number" ? h24 : null; chart.changeLabel = "24h";
  bump();
  if (p.pairAddress) fetchOHLCV(p.pairAddress, mc / price);
}

async function fetchSenses() {
  if (CA) { const s = await realSenses(); if (s) return { ...s, real: true }; }
  return { ...simSenses(), real: false };
}

/* ---------- toy brain: 4 sense cells -> 4 action cells, leaky ---------- */
const sig = x => 1 / (1 + Math.exp(-x));
const brain = { appetite: 0.3, wiggle: 0.3, glow: 0.2, sulk: 0.1, fullness: 0 };
function think(s) {
  const target = {
    appetite: sig(3.2 * s.snacks + 0.8 * s.sunshine - 2.5 * brain.fullness - 1.2),
    wiggle: sig(2.4 * s.vibes + 1.2 * s.sunshine + 0.8 * s.snacks - 2.2 * s.salt - 1.0),
    glow: sig(1.8 * s.snacks + 1.6 * s.vibes + 1.2 * s.sunshine - 2.0),
    sulk: sig(3.4 * s.salt - 1.4 * s.sunshine - 0.8 * s.vibes - 0.8)
  };
  for (const k in target) brain[k] = brain[k] * 0.7 + target[k] * 0.3; // leak: feelings fade
  brain.fullness = clamp(brain.fullness * 0.97);
}

/* ---------- panel ---------- */
const SENSES = [
  ["snacks", "Snacks", "#FFD23F", "buys drop crumbs into the tank"],
  ["salt", "Salt", "#9FB8FF", "sells and dips make the sand taste salty"],
  ["vibes", "Vibes", "#FF6FA3", "posts about Squirm tickle its vibe sensor"],
  ["sunshine", "Sunshine", "#7FE3CF", "a rising chart feels warm"]
];
const OUTS = [["appetite", "Appetite", "#FFD23F"], ["wiggle", "Wiggle", "#FF6FA3"], ["glow", "Glow", "#7FE3CF"], ["sulk", "Sulk", "#9FB8FF"]];
const row = (id, name, color) => `<div class="sense"><div class="row"><span>${name}</span><span class="hz" id="hz-${id}">0 Hz</span></div>
  <div class="bar"><i id="bar-${id}" style="background:${color};width:0"></i></div><div class="note" id="note-${id}"></div></div>`;
$("#senses").innerHTML = SENSES.map(([id, n, c]) => row(id, n, c)).join("");
$("#outputs").innerHTML = OUTS.map(([id, n, c]) => row(id, n, c)).join("");
function setRow(id, v, note) {
  $("#hz-" + id).textContent = Math.round(v * 180) + " Hz";
  $("#bar-" + id).style.width = (v * 100).toFixed(1) + "%";
  if (note !== undefined) $("#note-" + id).textContent = note;
}
const diary = [];
function log(msg) {
  const t = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  diary.unshift(`${t}  ${msg}`); diary.length = Math.min(diary.length, 40);
  $("#diary").innerHTML = diary.map(d => `<li>${d}</li>`).join("");
}
function moodName() {
  const m = Object.entries({ hungry: brain.appetite, dancing: brain.wiggle, glowing: brain.glow, sulking: brain.sulk }).sort((a, b) => b[1] - a[1])[0];
  return m[1] < 0.35 ? "sleepy" : m[0];
}

/* ======================================================================
   AQUARIUM SCENE
   The 3D scene lives in scene3d.js (three.js). If WebGL is missing we fall
   back to the 2D canvas below. Both expose the same tiny interface:
   { buys(n), sells(n), vibe() } and read the shared `brain` every frame.
   ====================================================================== */
let eaten = 0;
function snackEaten() {
  eaten++; brain.fullness = clamp(brain.fullness + 0.06); $("#eaten").textContent = eaten;
}

function createScene2D(stage) {
  const cv = document.createElement("canvas"); cv.width = 800; cv.height = 800; cv.className = "dish2d";
  stage.appendChild(cv);
  const ctx = cv.getContext("2d");
  const C = 400, R = 352, N = 26, GAP = 13;
  const worm = { x: C, y: C, a: 0, pts: [] };
  for (let i = 0; i < N; i++) worm.pts.push({ x: C - i * GAP, y: C });
  const crumbs = [], grains = [], hearts = [];
  const speckles = Array.from({ length: 40 }, () => { const a = Math.random() * 6.283, r = Math.random() * R * .95; return { x: C + Math.cos(a) * r, y: C + Math.sin(a) * r, s: 2 + Math.random() * 4 }; });
  const inDish = () => { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * R * 0.8; return { x: C + Math.cos(a) * r, y: C + Math.sin(a) * r }; };
  function step() {
    const sp = 1.2 + brain.wiggle * 3.2 - brain.sulk * 0.8;
    let target = null;
    if (crumbs.length && brain.appetite > 0.25) target = crumbs.reduce((b, c) => (Math.hypot(c.x - worm.x, c.y - worm.y) < Math.hypot(b.x - worm.x, b.y - worm.y) ? c : b));
    let want = worm.a + (Math.random() - 0.5) * 0.5 + Math.sin(performance.now() / 300) * 0.12 * brain.wiggle;
    if (target) want = Math.atan2(target.y - worm.y, target.x - worm.x);
    if (Math.hypot(worm.x - C, worm.y - C) > R - 70) want = Math.atan2(C - worm.y, C - worm.x);
    const d = ((want - worm.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    worm.a += clamp(d, -0.09, 0.09);
    worm.x += Math.cos(worm.a) * sp; worm.y += Math.sin(worm.a) * sp;
    worm.pts[0] = { x: worm.x, y: worm.y };
    for (let i = 1; i < N; i++) {
      const p = worm.pts[i], q = worm.pts[i - 1], ang = Math.atan2(p.y - q.y, p.x - q.x);
      p.x = q.x + Math.cos(ang) * GAP; p.y = q.y + Math.sin(ang) * GAP;
    }
    for (let i = crumbs.length - 1; i >= 0; i--) if (Math.hypot(crumbs[i].x - worm.x, crumbs[i].y - worm.y) < 26) { crumbs.splice(i, 1); snackEaten(); }
    grains.forEach(g => g.life -= 0.012); while (grains.length && grains[0].life <= 0) grains.shift();
    hearts.forEach(h => { h.y -= 0.8; h.life -= 0.01; }); while (hearts.length && hearts[0].life <= 0) hearts.shift();
  }
  function draw() {
    ctx.clearRect(0, 0, 800, 800);
    ctx.beginPath(); ctx.arc(C, C, R + 26, 0, 6.283); ctx.fillStyle = "#7FE3CF"; ctx.fill();
    const g = ctx.createRadialGradient(C - 80, C - 100, 40, C, C, R), warm = 0.5 + brain.glow * 0.5;
    g.addColorStop(0, "#FFF6E4"); g.addColorStop(1, `rgb(255,${Math.round(205 + 20 * warm)},${Math.round(150 + 20 * warm)})`);
    ctx.beginPath(); ctx.arc(C, C, R, 0, 6.283); ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = "rgba(230,180,110,.35)"; speckles.forEach(s => { ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, 6.283); ctx.fill(); });
    ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 14; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(C, C, R - 28, 3.5, 4.3); ctx.stroke();
    crumbs.forEach(c => { ctx.fillStyle = "#E9A93B"; ctx.beginPath(); ctx.arc(c.x, c.y, 9, 0, 6.283); ctx.fill(); ctx.fillStyle = "#FFD23F"; ctx.beginPath(); ctx.arc(c.x - 2, c.y - 2, 5, 0, 6.283); ctx.fill(); });
    grains.forEach(s => { ctx.fillStyle = `rgba(159,184,255,${s.life})`; ctx.fillRect(s.x, s.y, 6, 6); });
    const pts = worm.pts, sulk = brain.sulk, body = `rgb(${255 - sulk * 60},${111 + sulk * 40},${163 + sulk * 40})`;
    ctx.save(); ctx.shadowColor = "rgba(255,111,163,.9)"; ctx.shadowBlur = 10 + brain.glow * 50;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) { const w = (pass ? 22 : 26) * (0.65 + 0.35 * Math.sin(Math.PI * (i + 3) / (N + 3))); ctx.fillStyle = pass ? body : "#B5175A"; ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, w, 0, 6.283); ctx.fill(); }
      ctx.shadowBlur = 0;
    }
    ctx.restore();
    const h = pts[0], a = worm.a;
    ctx.fillStyle = "#B5175A"; ctx.beginPath(); ctx.arc(h.x, h.y, 34, 0, 6.283); ctx.fill();
    ctx.fillStyle = "#FF7FAE"; ctx.beginPath(); ctx.arc(h.x, h.y, 29, 0, 6.283); ctx.fill();
    const px = Math.cos(a + Math.PI / 2), py = Math.sin(a + Math.PI / 2), fx = Math.cos(a), fy = Math.sin(a);
    [-1, 1].forEach(sd => {
      const ex = h.x + fx * 8 + px * 12 * sd, ey = h.y + fy * 8 + py * 12 * sd;
      ctx.fillStyle = "#1B1B2F"; ctx.beginPath(); ctx.arc(ex, ey, 8, 0, 6.283); ctx.fill();
      if (sulk > 0.5) { ctx.fillStyle = "#FF7FAE"; ctx.beginPath(); ctx.arc(ex - fx * 4, ey - fy * 4, 8, 0, 6.283); ctx.fill(); }
      else { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ex + fx * 2 - px * 2, ey + fy * 2 - py * 2, 3, 0, 6.283); ctx.fill(); }
    });
    hearts.forEach(t => { ctx.globalAlpha = Math.max(0, t.life); ctx.fillStyle = "#FF3D7F"; ctx.font = "26px Fredoka"; ctx.fillText("♥", t.x, t.y); ctx.globalAlpha = 1; });
  }
  (function loop() { step(); draw(); requestAnimationFrame(loop); })();
  return {
    buys(n) { for (let i = 0; i < n && crumbs.length < 25; i++) crumbs.push(inDish()); },
    sells(n) { for (let i = 0; i < n * 6; i++) grains.push({ ...inDish(), life: 1 }); },
    vibe() { hearts.push({ x: worm.x + 20, y: worm.y - 30, life: 1 }); },
    setGrowth() {}, fastForward() {}
  };
}

/* ---------- tank growth: level 1 at START_MC, +1 level for every 3x ---------- */
const params = new URLSearchParams(location.search);
const FORCED_MC = parseFloat(params.get("mc")) || 0; // test helper: ?mc=45000
const levelFor = mc => mc >= START_MC ? 1 + Math.floor(Math.log(mc / START_MC) / Math.log(3) + 1e-9) : 1;
const nextAt = lv => START_MC * Math.pow(3, lv);
function money(v) {
  if (v >= 1e9) return "$" + (v / 1e9).toFixed(v >= 1e10 ? 0 : 1) + "B";
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(v >= 1e7 ? 0 : 2) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(v >= 1e5 ? 0 : 1) + "k";
  return "$" + Math.round(v);
}
let curLevel = 0, toastTimer = null;
function toast(msg) {
  let el = $("#toast"); if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; $("#stage").appendChild(el); }
  el.textContent = msg; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}
function updateGrowth(mc, first) {
  if (FORCED_MC) mc = FORCED_MC;
  const lv = levelFor(mc);
  $("#mcVal").textContent = mc ? money(mc) : "n/a";
  $("#lvVal").textContent = lv;
  $("#nextVal").textContent = money(nextAt(lv));
  $("#lvBar").style.width = (clamp(Math.log(mc / START_MC * 1) / Math.log(3) - (lv - 1)) * 100).toFixed(1) + "%";
  if (lv !== curLevel) {
    if (!first && lv > curLevel) { toast(`Tank upgraded! Level ${lv}`); log(`tank grew to level ${lv}`); }
    if (!first && lv < curLevel) log(`tank shrank to level ${lv}`);
    scene.setGrowth(lv, first); curLevel = lv; bump();
  }
  chart.mc = mc; chart.level = lv; chart.levelAt = START_MC * Math.pow(3, lv - 1); chart.nextAt = nextAt(lv);
}

const stage = $("#stage");
let scene = null;
try { if (window.createScene3D) scene = window.createScene3D(stage, brain, snackEaten); } catch (e) { console.warn("3D failed, using 2D", e); scene = null; stage.querySelectorAll("canvas").forEach(c => c.remove()); }
if (!scene) { scene = createScene2D(stage); $("#viewHint").textContent = "2D view"; }
if (FORCED_MC) sim.mc = FORCED_MC;
if (!CA) seedSimChart(sim.mc);
updateGrowth(FORCED_MC || START_MC, true);
let chartSent = -1;
function sendChart() { if (scene.setChart && chart.version !== chartSent) { chartSent = chart.version; scene.setChart(chart); } }
sendChart();

/* ======================================================================
   HOLDER GATE: "Enter the room"
   READ-ONLY: connects a wallet only to read its public address, then asks a
   public RPC for the token balance. Never requests signatures or transactions.
   (This is a fun gate in the browser, not a security system.)
   ====================================================================== */
const TEST_MODE = TEST_UNLOCK && !CA;
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && matchMedia("(pointer:coarse)").matches);
function wallets() {
  const list = [];
  const ph = (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) ? window.phantom.solana : (window.solana && window.solana.isPhantom ? window.solana : null);
  if (ph) list.push(["Phantom", ph]);
  if (window.solflare && window.solflare.isSolflare) list.push(["Solflare", window.solflare]);
  if (!list.length && window.solana && window.solana.connect) list.push(["Solana wallet", window.solana]);
  return list;
}
async function rpc(url, method, params) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const d = await r.json(); if (d.error) throw new Error(d.error.message || "rpc error"); return d.result;
}
const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"]; // SPL Token + Token-2022
async function holding(owner) {
  const sum = res => res.value.reduce((s, a) => { const i = a.account.data.parsed.info; return i.mint === CA ? s + (parseFloat(i.tokenAmount.uiAmountString) || 0) : s; }, 0);
  let lastErr;
  for (const url of [RPC_URL, RPC_FALLBACK]) {
    try { return sum(await rpc(url, "getTokenAccountsByOwner", [owner, { mint: CA }, { encoding: "jsonParsed" }])); } // works for both token programs
    catch (e) {
      lastErr = e;
      try { let s = 0; for (const programId of TOKEN_PROGRAMS) s += sum(await rpc(url, "getTokenAccountsByOwner", [owner, { programId }, { encoding: "jsonParsed" }])); return s; }
      catch (e2) { lastErr = e2; }
    }
  }
  throw lastErr;
}
const gate = $("#gate"), gBtns = $("#gateBtns"), gStatus = $("#gateStatus");
function btn(label, cls, on, href) {
  const b = document.createElement(href ? "a" : "button"); b.className = "btn " + cls; b.textContent = label;
  if (href) { b.href = href; b.target = "_blank"; b.rel = "noopener"; } else { b.type = "button"; b.addEventListener("click", on); }
  gBtns.appendChild(b); return b;
}
function enterRoom() { gate.hidden = true; if (scene.enterWalk) scene.enterWalk(); }
function openGate() {
  if (!scene.enterWalk) { toast("Walk mode needs 3D (WebGL)"); return; }
  if (sessionStorage.getItem("squirmRoom") === "ok" && !TEST_MODE) { enterRoom(); return; }
  gBtns.innerHTML = ""; gStatus.textContent = "";
  $("#gateTest").innerHTML = TEST_MODE ? '<span class="test">test mode: entry unlocked (no CA set yet)</span>' : "";
  if (TEST_MODE) btn("Enter (test mode)", "pink", enterRoom);
  const ws = wallets();
  ws.forEach(([name, prov]) => btn("Connect " + name, TEST_MODE ? "ghost" : "pink", () => connectAndCheck(name, prov)));
  if (!ws.length) {
    const here = encodeURIComponent(location.href), ref = encodeURIComponent(location.origin && location.origin !== "null" ? location.origin : location.href);
    if (isMobile) {
      btn("Open in Phantom", TEST_MODE ? "ghost" : "pink", null, `https://phantom.app/ul/browse/${here}?ref=${ref}`);
      btn("Open in Solflare", "ghost", null, `https://solflare.com/ul/v1/browse/${here}?ref=${ref}`);
      gStatus.textContent = "No wallet found in this browser. Open the site inside your wallet app.";
    } else {
      btn("Get Phantom", "ghost", null, "https://phantom.app/download");
      gStatus.textContent = "No Solana wallet extension found (Phantom or Solflare).";
    }
  }
  gate.hidden = false;
}
async function connectAndCheck(name, prov) {
  gStatus.textContent = `connecting ${name}...`;
  let owner;
  try { const r = await prov.connect(); owner = ((r && r.publicKey) || prov.publicKey).toString(); }
  catch (e) { gStatus.textContent = "Connection was cancelled."; return; }
  const short = owner.slice(0, 4) + "..." + owner.slice(-4);
  if (TEST_MODE) { gStatus.textContent = `connected ${short} · test mode: balance check skipped`; setTimeout(enterRoom, 700); return; }
  gStatus.textContent = `connected ${short} · checking balance...`;
  try {
    const amt = await holding(owner);
    if (amt > MIN_HOLD) { sessionStorage.setItem("squirmRoom", "ok"); gStatus.textContent = `${short} holds ${amt.toLocaleString()} SQUIRM. Welcome in!`; setTimeout(enterRoom, 700); }
    else {
      gBtns.innerHTML = ""; gStatus.textContent = `${short} doesn't hold SQUIRM yet.`;
      $("#gateTest").innerHTML = "<p><b>Hold SQUIRM to enter.</b> Grab a bag and come say hi to the worm.</p>";
      btn("Buy on pump.fun", "pink", null, "https://pump.fun/coin/" + CA);
    }
  } catch (e) { gStatus.textContent = "Couldn't check the balance right now (busy RPC). Please try again in a moment."; }
}
$("#enterBtn").addEventListener("click", openGate);
$("#gateClose").addEventListener("click", () => { gate.hidden = true; });
gate.addEventListener("click", e => { if (e.target === gate) gate.hidden = true; });
if (!scene.enterWalk) $("#enterBtn").hidden = true;
// test helpers (only while no CA is set): ?gate=1 opens the dialog, ?walk=1&px=&pz=&yaw=&pitch=&heading= starts walking
if (params.get("gate") === "1") openGate();
if (TEST_MODE && params.get("walk") === "1" && scene.enterWalk) {
  const n = k => params.get(k) != null ? parseFloat(params.get(k)) : undefined;
  scene.enterWalk({ x: n("px"), z: n("pz"), yaw: n("yaw"), pitch: n("pitch"), heading: n("heading"), dist: n("dist") });
}
if (parseFloat(params.get("t")) > 0 && scene.fastForward) scene.fastForward(parseFloat(params.get("t")));

/* ---------- 1 second heartbeat ---------- */
let ticks = 0, lastMood = "";
async function tick() {
  const s = await fetchSenses();
  think(s);
  SENSES.forEach(([id]) => setRow(id, s[id], s.notes[id]));
  const outNotes = { appetite: brain.fullness > 0.6 ? "pretty full, slowing down" : "looking for crumbs", wiggle: "how fast it moves", glow: "how bright it shines", sulk: brain.sulk > 0.5 ? "curled up, not amused" : "doing fine" };
  OUTS.forEach(([id]) => setRow(id, brain[id], outNotes[id]));
  if (s.buys) { scene.buys(s.buys); log(`${s.buys} snack${s.buys > 1 ? "s" : ""} dropped in`); }
  if (s.sells) { scene.sells(s.sells); log(`tasted salt (${s.sells} sell${s.sells > 1 ? "s" : ""})`); }
  brain.sunshine = s.sunshine;
  updateGrowth(s.marketCap || 0, false);
  sendChart();
  if (s.vibes > 0.6 && Math.random() < 0.5) scene.vibe();
  const m = moodName(); if (m !== lastMood) { log(`feeling ${m}`); lastMood = m; }
  $("#mood").textContent = m;
  $("#modeLabel").textContent = s.real ? "live market data" : "test data (simulated)";
  $("#liveDot").classList.toggle("real", !!s.real);
  ticks++; $("#day").textContent = Math.max(1, Math.ceil(ticks / 60));
}
log("Squirm woke up in the tank");
tick(); setInterval(tick, 1000);
