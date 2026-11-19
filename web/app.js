// Coin Race browser front end. Renders the game on canvas, reads input,
// fetches live market data, and keeps the best time and score in
// localStorage. The rules live in src/game.js.

import {
  COINS,
  LANES,
  LANE_WIDTH,
  RACE_DISTANCE,
  TRACK_LEFT,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  coinById,
  createGame,
  finishPosition,
  finalScore,
  laneCenter,
  pauseGame,
  playerPosition,
  raceTime,
  resetGame,
  resumeGame,
  selectCoin,
  simulatedMarket,
  speedFactorForChange,
  standings,
  startRace,
  step,
  switchLane,
} from '../src/game.js';

const BEST_TIME_KEY = 'coinrace-best-time';
const BEST_SCORE_KEY = 'coinrace-best-score';
const AUTOPLAY = new URLSearchParams(location.search).has('autoplay');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const hud = document.getElementById('hud');
const hudPos = document.getElementById('hud-pos');
const hudTime = document.getElementById('hud-time');
const hudSpeed = document.getElementById('hud-speed');
const hudProgressFill = document.getElementById('hud-progress-fill');
const hudDist = document.getElementById('hud-dist');
const standingsEl = document.getElementById('standings');
const notifyEl = document.getElementById('notify');
const countdownEl = document.getElementById('countdown');
const menu = document.getElementById('menu');
const pauseOverlay = document.getElementById('pause');
const podium = document.getElementById('podium');
const podiumRow = document.getElementById('podium-row');
const finalPos = document.getElementById('final-pos');
const finalStats = document.getElementById('final-stats');
const newBest = document.getElementById('new-best');
const marketStatus = document.getElementById('market-status');
const coinGrid = document.getElementById('coin-grid');
const menuBest = document.getElementById('menu-best');
const muteBtn = document.getElementById('mute-btn');

const state = createGame(Math.random);
let market = null;
let marketSimulated = false;
let selectedCoinId = COINS[0].id;
let lastTime = 0;
let shakeUntil = 0;
let particles = [];
let stripeOffset = 0;
let lastCount = null;
let goUntil = 0;
let notifyTimer = null;
let prevStatus = state.status;
let autoplayTimer = null;
let lastAutoSwitch = 0;

const OBSTACLES = new Set(['candle-red', 'fud']);
const PICKUPS = new Set(['candle-green', 'rocket']);

function loadBest(key) {
  try {
    const value = Number(localStorage.getItem(key) || 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function saveBest(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage is optional. The game still works without it.
  }
}

let bestTime = loadBest(BEST_TIME_KEY);
let bestScore = loadBest(BEST_SCORE_KEY);

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m + ':' + s.toFixed(1).padStart(4, '0');
}

function formatChange(change) {
  if (change === null || change === undefined) return '...';
  const sign = change >= 0 ? '+' : '';
  return sign + change.toFixed(1) + '%';
}

// Market data: one CoinGecko call at page load. On any failure the game
// falls back to simulated data and says so on screen.
async function fetchMarket() {
  const ids = COINS.map((c) => c.apiId).join(',');
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=' + ids +
    '&vs_currencies=usd&include_24hr_change=true';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error('bad status ' + res.status);
    const data = await res.json();
    const next = {};
    for (const coin of COINS) {
      const change = data[coin.apiId] && data[coin.apiId].usd_24h_change;
      if (typeof change !== 'number') throw new Error('missing ' + coin.apiId);
      next[coin.id] = change;
    }
    market = next;
    marketSimulated = false;
    marketStatus.textContent = 'Live market data (24h change drives speed)';
    marketStatus.classList.remove('simulated');
  } catch {
    market = simulatedMarket(Math.random);
    marketSimulated = true;
    marketStatus.textContent = 'Simulated market (live data unavailable)';
    marketStatus.classList.add('simulated');
  }
  renderCoinGrid();
}

function renderCoinGrid() {
  coinGrid.innerHTML = '';
  for (const coin of COINS) {
    const change = market ? market[coin.id] : null;
    const btn = document.createElement('button');
    btn.className = 'coin-btn' + (coin.id === selectedCoinId ? ' selected' : '');
    btn.style.setProperty('--coin-color', coin.color);
    btn.dataset.coin = coin.id;
    const changeClass = change === null ? 'flat' : change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'flat';
    const speed = change === null ? '' : 'x' + speedFactorForChange(change).toFixed(2) + ' speed';
    btn.innerHTML =
      '<span class="coin-disc" style="background:' + coin.color + '">' + coin.glyph + '</span>' +
      '<span class="coin-sym">' + coin.symbol + '</span>' +
      '<span class="coin-name">' + coin.name + '</span>' +
      '<span class="coin-change ' + changeClass + '">' + formatChange(change) + '</span>' +
      '<span class="coin-speed">' + speed + '</span>';
    btn.addEventListener('click', () => {
      ensureAudio();
      selectedCoinId = coin.id;
      selectCoin(state, coin.id);
      renderCoinGrid();
    });
    coinGrid.appendChild(btn);
  }
}

function refreshMenuBest() {
  const parts = [];
  if (bestScore > 0) parts.push('Best score: ' + bestScore);
  if (bestTime > 0) parts.push('Best time: ' + formatTime(bestTime));
  if (parts.length) {
    menuBest.hidden = false;
    menuBest.textContent = parts.join('  |  ');
  } else {
    menuBest.hidden = true;
  }
}

// Sound: all effects are synthesized with the Web Audio API, no audio
// files. The AudioContext is created only on a user gesture (mobile
// autoplay policy), so in ?autoplay mode with no interaction every
// sound call is a silent no-op and nothing throws.

const SOUND_MUTED_KEY = 'coinrace-muted';
const sound = {
  ctx: null,
  master: null,
  musicGain: null,
  music: null,
  muted: false,
  beeped: false,
  oscCount: 0,
};

function loadMuted() {
  try {
    return localStorage.getItem(SOUND_MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(value) {
  try {
    localStorage.setItem(SOUND_MUTED_KEY, value ? '1' : '0');
  } catch {
    // Storage is optional.
  }
}

sound.muted = loadMuted();

function ensureAudio() {
  if (sound.ctx) {
    if (sound.ctx.state === 'suspended') sound.ctx.resume().catch(() => {});
    return;
  }
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    sound.ctx = new Ctor({ latencyHint: 'interactive' });
    // Count every oscillator the game creates, so a test can prove the
    // music engine is really scheduling notes, not just running a timer.
    const realCreateOsc = sound.ctx.createOscillator.bind(sound.ctx);
    sound.ctx.createOscillator = (...args) => {
      sound.oscCount += 1;
      return realCreateOsc(...args);
    };
    sound.master = sound.ctx.createGain();
    sound.master.gain.value = sound.muted ? 0 : 0.9;
    // A compressor keeps the louder mix from clipping on phone speakers.
    const comp = sound.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 20;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    sound.master.connect(comp);
    comp.connect(sound.ctx.destination);
    // Music gets its own bus so it sits under the sound effects.
    sound.musicGain = sound.ctx.createGain();
    sound.musicGain.gain.value = 1.0;
    sound.musicGain.connect(sound.master);
    // One short beep proves sound is on: the first touch should be heard.
    if (!sound.beeped) {
      sound.beeped = true;
      if (sound.ctx.state === 'running') playBeep();
      else sound.ctx.resume().then(playBeep).catch(() => {});
    }
  } catch {
    sound.ctx = null;
    sound.master = null;
  }
}

function playBeep() {
  tone({ freq: 880, dur: 0.15, vol: 0.3 });
}

function suspendAudio() {
  if (sound.ctx && sound.ctx.state === 'running') {
    sound.ctx.suspend().catch(() => {});
  }
}

function noiseBuffer(ctx, seconds) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function tone({ freq, endFreq, type = 'sine', dur = 0.1, vol = 0.3, when = 0 }) {
  if (!sound.ctx || sound.muted) return;
  const t0 = sound.ctx.currentTime + when;
  const osc = sound.ctx.createOscillator();
  const gain = sound.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain);
  gain.connect(sound.master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noiseBurst({ dur = 0.2, vol = 0.3, filterFreq = 800, type = 'lowpass', when = 0 }) {
  if (!sound.ctx || sound.muted) return;
  const t0 = sound.ctx.currentTime + when;
  const src = sound.ctx.createBufferSource();
  src.buffer = noiseBuffer(sound.ctx, Math.max(dur, 0.1));
  const filter = sound.ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const gain = sound.ctx.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(sound.master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

function playCountBeep() {
  tone({ freq: 660, dur: 0.12, vol: 0.4 });
}

function playGoBeep() {
  tone({ freq: 990, dur: 0.35, vol: 0.5 });
}

function playBoost() {
  tone({ freq: 300, endFreq: 1200, type: 'triangle', dur: 0.3, vol: 0.4 });
}

function playRocket() {
  if (!sound.ctx || sound.muted) return;
  const t0 = sound.ctx.currentTime;
  const src = sound.ctx.createBufferSource();
  src.buffer = noiseBuffer(sound.ctx, 0.6);
  const filter = sound.ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(400, t0);
  filter.frequency.exponentialRampToValueAtTime(2400, t0 + 0.5);
  filter.Q.value = 1.2;
  const gain = sound.ctx.createGain();
  gain.gain.setValueAtTime(0.001, t0);
  gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(sound.master);
  src.start(t0);
  src.stop(t0 + 0.6);
  tone({ freq: 200, endFreq: 1600, type: 'sawtooth', dur: 0.5, vol: 0.25 });
}

function playHit() {
  tone({ freq: 110, endFreq: 38, dur: 0.28, vol: 0.7 });
  noiseBurst({ dur: 0.18, vol: 0.4, filterFreq: 300 });
}

function playOvertake() {
  tone({ freq: 880, type: 'triangle', dur: 0.08, vol: 0.3 });
  tone({ freq: 1174.66, type: 'triangle', dur: 0.12, vol: 0.3, when: 0.09 });
}

function playSurge() {
  tone({ freq: 1200, type: 'triangle', dur: 0.08, vol: 0.2 });
}

function playFanfare() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    tone({ freq, type: 'triangle', dur: 0.3, vol: 0.4, when: i * 0.16 });
  });
}

// Background music: a procedural loop synthesized with the Web Audio API,
// no audio files. An upbeat major C-G-Am-F loop, two bars per chord:
// a flowing sixteenth-note arpeggio, a bass pulse and a kick on every beat.
// Tempo rises from 120 to 132 BPM as the race distance grows, so the
// music pushes harder toward the finish line. Everything runs through
// the music bus, under the sound effects, and the master mute silences
// it along with them.

const MUSIC_CHORDS = [
  { pad: [130.81, 164.81, 196.0, 261.63], arp: [261.63, 329.63, 392.0, 523.25], bass: 65.41 },
  { pad: [98.0, 123.47, 146.83, 196.0], arp: [196.0, 246.94, 293.66, 392.0], bass: 49.0 },
  { pad: [110.0, 130.81, 164.81, 220.0], arp: [220.0, 261.63, 329.63, 440.0], bass: 55.0 },
  { pad: [87.31, 110.0, 130.81, 174.61], arp: [174.61, 220.0, 261.63, 349.23], bass: 43.65 },
];
const MUSIC_ARP_PATTERN = [0, 1, 2, 3, 2, 3, 1, 2];
const MUSIC_BASE_BPM = 120;
const MUSIC_MAX_BPM = 132;
const MUSIC_STEPS_PER_CHORD = 32; // 2 bars of sixteenth notes

// Intensity comes only from the race distance and RACE_DISTANCE, both
// imported above, so the scheduler can never hit a missing constant.
function musicIntensity() {
  return Math.max(0, Math.min(1, state.distance / RACE_DISTANCE));
}

function musicBpm() {
  return MUSIC_BASE_BPM + musicIntensity() * (MUSIC_MAX_BPM - MUSIC_BASE_BPM);
}

function musicStepDur() {
  return 60 / musicBpm() / 4;
}

function musicNote({ freq, type = 'triangle', dur, vol, when }) {
  const osc = sound.ctx.createOscillator();
  const gain = sound.ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.001, when);
  gain.gain.exponentialRampToValueAtTime(vol, when + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
  osc.connect(gain);
  gain.connect(sound.musicGain);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}

function musicKick(when) {
  const osc = sound.ctx.createOscillator();
  const gain = sound.ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(130, when);
  osc.frequency.exponentialRampToValueAtTime(42, when + 0.16);
  gain.gain.setValueAtTime(0.5, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.18);
  osc.connect(gain);
  gain.connect(sound.musicGain);
  osc.start(when);
  osc.stop(when + 0.2);
}

function musicHat(when) {
  const src = sound.ctx.createBufferSource();
  src.buffer = noiseBuffer(sound.ctx, 0.05);
  const filter = sound.ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 6000;
  const gain = sound.ctx.createGain();
  gain.gain.setValueAtTime(0.05, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(sound.musicGain);
  src.start(when);
  src.stop(when + 0.06);
}

function startPad(chord, when, dur) {
  const nodes = [];
  for (const freq of chord.pad) {
    const osc = sound.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const gain = sound.ctx.createGain();
    gain.gain.setValueAtTime(0.001, when);
    gain.gain.linearRampToValueAtTime(0.09, when + 0.15);
    gain.gain.setValueAtTime(0.09, when + Math.max(0.15, dur - 0.5));
    gain.gain.linearRampToValueAtTime(0.001, when + dur);
    osc.connect(gain);
    gain.connect(sound.musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.05);
    nodes.push({ osc, gain });
  }
  // The previous chord's pad ends on its own schedule; only the newest
  // chord is tracked, so stopMusic can fade it out.
  if (sound.music) sound.music.pads = nodes;
}

function scheduleMusicStep(step, when) {
  const chord = MUSIC_CHORDS[Math.floor(step / MUSIC_STEPS_PER_CHORD) % MUSIC_CHORDS.length];
  const stepInChord = step % MUSIC_STEPS_PER_CHORD;
  const stepDur = musicStepDur();
  const intensity = musicIntensity();
  if (stepInChord === 0) {
    startPad(chord, when, stepDur * MUSIC_STEPS_PER_CHORD);
  }
  // Arpeggio on every sixteenth note, with a detuned twin for width.
  const arpFreq = chord.arp[MUSIC_ARP_PATTERN[stepInChord % 8]];
  musicNote({ freq: arpFreq, dur: stepDur * 0.9, vol: 0.16, when });
  musicNote({ freq: arpFreq * 1.003, dur: stepDur * 0.9, vol: 0.08, when });
  // Octave sparkle on beats 1 and 3 once the race heats up.
  if (intensity > 0.55 && (stepInChord % 16 === 0 || stepInChord % 16 === 8)) {
    musicNote({ freq: arpFreq * 2, dur: stepDur * 0.7, vol: 0.06, when });
  }
  // Bass pulse and kick on every beat.
  if (stepInChord % 4 === 0) {
    musicNote({ freq: chord.bass, type: 'sine', dur: 0.22, vol: 0.2, when });
    musicKick(when);
  }
  // Soft off-beat tick at higher intensity.
  if (intensity > 0.4 && stepInChord % 4 === 2) {
    musicHat(when);
  }
}

function musicTick() {
  const music = sound.music;
  if (!music || !sound.ctx || sound.ctx.state !== 'running') return;
  // If the clock jumped ahead (pause, background tab), restart the
  // schedule from now instead of firing a burst of catch-up notes.
  if (music.nextTime < sound.ctx.currentTime - 0.05) {
    music.nextTime = sound.ctx.currentTime + 0.05;
  }
  // Schedule ~0.1 s ahead; when muted the clock still advances so the
  // loop stays in time, it just stays silent.
  while (music.nextTime < sound.ctx.currentTime + 0.1) {
    if (!sound.muted) scheduleMusicStep(music.step, music.nextTime);
    music.nextTime += musicStepDur();
    music.step += 1;
  }
}

function startMusic() {
  if (!sound.ctx || sound.music) return;
  sound.music = {
    timer: setInterval(musicTick, 25),
    nextTime: sound.ctx.currentTime + 0.05,
    step: 0,
    pads: [],
  };
  musicTick();
}

function stopMusic() {
  const music = sound.music;
  if (!music) return;
  clearInterval(music.timer);
  if (sound.ctx) {
    const t = sound.ctx.currentTime;
    for (const node of music.pads) {
      try {
        node.gain.gain.cancelScheduledValues(t);
        node.gain.gain.setValueAtTime(Math.max(0.001, node.gain.gain.value), t);
        node.gain.gain.linearRampToValueAtTime(0.001, t + 0.15);
        node.osc.stop(t + 0.2);
      } catch {
        // Already stopped.
      }
    }
  }
  sound.music = null;
}

function setMuted(muted) {
  sound.muted = muted;
  saveMuted(muted);
  if (sound.master) sound.master.gain.value = muted ? 0 : 0.9;
  muteBtn.textContent = muted ? '🔇' : '🔊';
  muteBtn.classList.toggle('off', muted);
  muteBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
}

function showOverlay(which) {
  menu.hidden = which !== 'menu';
  pauseOverlay.hidden = which !== 'pause';
  podium.hidden = which !== 'podium';
  hud.hidden = which !== 'playing';
  if (which !== 'playing') countdownEl.hidden = true;
}

function showNotify(text, ms = 1600) {
  notifyEl.textContent = text;
  notifyEl.hidden = false;
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    notifyEl.hidden = true;
  }, ms);
}

// Standings rows are built once and reordered every frame.
const standRows = new Map();
for (const coin of COINS) {
  const row = document.createElement('div');
  row.className = 'stand-row';
  row.innerHTML =
    '<span class="stand-sym">' + coin.symbol + '</span>' +
    '<span class="stand-bar"><span class="stand-fill" style="background:' + coin.color + '"></span></span>' +
    '<span class="stand-pos"></span>';
  standRows.set(coin.id, row);
  standingsEl.appendChild(row);
}

function refreshHud() {
  const pos = playerPosition(state);
  hudPos.textContent = pos + '/' + COINS.length;
  hudTime.textContent = formatTime(raceTime(state));
  hudSpeed.textContent = Math.round(state.speed * 3.6) + ' km/h';
  const pct = Math.max(0, Math.min(100, (state.distance / RACE_DISTANCE) * 100));
  hudProgressFill.style.width = pct + '%';
  hudDist.textContent = Math.floor(state.distance) + ' / ' + RACE_DISTANCE + ' m';
  const list = standings(state);
  for (const row of list) {
    const el = standRows.get(row.coinId);
    if (!el) continue;
    el.classList.toggle('player', !!row.isPlayer);
    el.querySelector('.stand-fill').style.width =
      Math.max(0, Math.min(100, (row.distance / RACE_DISTANCE) * 100)) + '%';
    el.querySelector('.stand-pos').textContent = row.position;
    standingsEl.appendChild(el);
  }
}

function startRun() {
  particles = [];
  lastCount = null;
  goUntil = 0;
  if (!market) {
    market = simulatedMarket(Math.random);
    marketSimulated = true;
    marketStatus.textContent = 'Simulated market (live data unavailable)';
    marketStatus.classList.add('simulated');
  }
  startRace(state, market);
  startMusic();
  showOverlay('playing');
  refreshHud();
}

function endRun() {
  const pos = finishPosition(state);
  const score = finalScore(state);
  const time = raceTime(state);
  const list = standings(state).slice().sort((a, b) => a.position - b.position);
  const top = list.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const classes = ['second', 'first', 'third'];
  const labels = ['2', '1', '3'];
  podiumRow.innerHTML = '';
  order.forEach((row, i) => {
    const coin = coinById(row.coinId);
    const stepEl = document.createElement('div');
    stepEl.className = 'podium-step ' + classes[i];
    stepEl.innerHTML =
      '<span class="podium-disc" style="background:' + coin.color + '">' + coin.glyph + '</span>' +
      '<span class="podium-sym">' + coin.symbol + '</span>' +
      '<div class="podium-block">' + labels[i] + '</div>';
    podiumRow.appendChild(stepEl);
  });
  finalPos.textContent = 'You finished ' + pos + ' of ' + COINS.length;
  finalStats.textContent = 'Time ' + formatTime(time) + '  |  Score ' + score +
    '  |  Pickups ' + state.pickups + '  |  Hits ' + state.hits;
  let isBest = false;
  if (score > bestScore) {
    bestScore = score;
    saveBest(BEST_SCORE_KEY, score);
    isBest = true;
  }
  if (time > 0 && (bestTime === 0 || time < bestTime)) {
    bestTime = time;
    saveBest(BEST_TIME_KEY, time);
    isBest = true;
  }
  newBest.hidden = !isBest;
  confetti();
  stopMusic();
  playFanfare();
  showOverlay('podium');
}

function toMenu() {
  stopMusic();
  resetGame(state);
  selectCoin(state, selectedCoinId);
  refreshMenuBest();
  renderCoinGrid();
  showOverlay('menu');
}

function burst(x, y, color, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 120;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 40,
      life: 0.5 + Math.random() * 0.3,
      color,
      shape: 'dot',
    });
  }
}

function speedLines(x, y) {
  for (let i = 0; i < 3; i++) {
    particles.push({
      x: x + (Math.random() - 0.5) * 70,
      y: y + (Math.random() - 0.5) * 30,
      vx: 0,
      vy: 320 + Math.random() * 120,
      life: 0.25 + Math.random() * 0.15,
      color: '#7cff6b',
      shape: 'line',
    });
  }
}

function confetti() {
  const colors = COINS.map((c) => c.color);
  for (let i = 0; i < 120; i++) {
    particles.push({
      x: Math.random() * WORLD_WIDTH,
      y: -20 - Math.random() * 120,
      vx: (Math.random() - 0.5) * 80,
      vy: 120 + Math.random() * 160,
      life: 1.5 + Math.random() * 1.5,
      color: colors[i % colors.length],
      shape: 'dot',
    });
  }
}

function drawCoinDisc(x, y, radius, coin) {
  ctx.fillStyle = coin.color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#0a0d12';
  ctx.font = '900 ' + Math.round(radius * 1.1) + 'px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(coin.glyph, x, y + 1);
}

function drawBackground() {
  ctx.fillStyle = '#10141b';
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  // Asphalt.
  ctx.fillStyle = '#1c222c';
  ctx.fillRect(TRACK_LEFT - 10, 0, LANES * LANE_WIDTH + 20, WORLD_HEIGHT);
  // Neon edges.
  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(TRACK_LEFT - 10, 0);
  ctx.lineTo(TRACK_LEFT - 10, WORLD_HEIGHT);
  ctx.moveTo(TRACK_LEFT + LANES * LANE_WIDTH + 10, 0);
  ctx.lineTo(TRACK_LEFT + LANES * LANE_WIDTH + 10, WORLD_HEIGHT);
  ctx.stroke();
  // Scrolling lane dividers.
  ctx.strokeStyle = 'rgba(238, 242, 248, 0.55)';
  ctx.lineWidth = 4;
  ctx.setLineDash([26, 22]);
  ctx.lineDashOffset = -(stripeOffset % 48);
  for (let i = 1; i < LANES; i++) {
    const x = TRACK_LEFT + i * LANE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_HEIGHT);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Finish line: a checkered strip in the last 120 m.
  const remaining = RACE_DISTANCE - state.distance;
  if (state.status !== 'menu' && remaining <= 120 && remaining > -20) {
    const lineY = state.player.y - remaining * 1.5;
    if (lineY > -30 && lineY < WORLD_HEIGHT + 30) {
      const cell = 12;
      const left = TRACK_LEFT - 10;
      const width = LANES * LANE_WIDTH + 20;
      for (let x = left; x < left + width; x += cell) {
        for (let yy = 0; yy < 2; yy++) {
          const col = Math.floor((x - left) / cell);
          ctx.fillStyle = (col + yy) % 2 === 0 ? '#eef2f8' : '#0a0d12';
          ctx.fillRect(x, lineY + yy * cell, cell, cell);
        }
      }
    }
  }
}

function drawEntity(entity) {
  const { x, y } = entity;
  const w = entity.width || 46;
  const h = entity.height || 56;
  if (entity.kind === 'candle-red' || entity.kind === 'candle-green') {
    const green = entity.kind === 'candle-green';
    ctx.strokeStyle = green ? '#2ecc71' : '#e74c3c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - h / 2 - 10);
    ctx.lineTo(x, y + h / 2 + 10);
    ctx.stroke();
    ctx.fillStyle = green ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);
    if (green) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('^', x, y - h / 2 - 22);
    }
    return;
  }
  if (entity.kind === 'fud') {
    ctx.fillStyle = '#6b5b95';
    ctx.beginPath();
    ctx.arc(x - 14, y + 4, 14, 0, Math.PI * 2);
    ctx.arc(x, y - 8, 18, 0, Math.PI * 2);
    ctx.arc(x + 15, y + 4, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8d7fc0';
    ctx.beginPath();
    ctx.arc(x - 6, y - 4, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x, y + 2);
    return;
  }
  // Rocket.
  ctx.fillStyle = '#e8ecf2';
  ctx.beginPath();
  ctx.moveTo(x, y - 28);
  ctx.quadraticCurveTo(x + 14, y - 8, x + 12, y + 12);
  ctx.lineTo(x - 12, y + 12);
  ctx.quadraticCurveTo(x - 14, y - 8, x, y - 28);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e84142';
  ctx.beginPath();
  ctx.moveTo(x - 12, y + 4);
  ctx.lineTo(x - 22, y + 20);
  ctx.lineTo(x - 12, y + 14);
  ctx.closePath();
  ctx.moveTo(x + 12, y + 4);
  ctx.lineTo(x + 22, y + 20);
  ctx.lineTo(x + 12, y + 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#00e5ff';
  ctx.beginPath();
  ctx.arc(x, y - 4, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffb020';
  ctx.beginPath();
  ctx.moveTo(x - 7, y + 12);
  ctx.lineTo(x, y + 30 + Math.random() * 8);
  ctx.lineTo(x + 7, y + 12);
  ctx.closePath();
  ctx.fill();
}

function drawRacers() {
  const list = standings(state);
  for (const row of list) {
    if (row.isPlayer) continue;
    const rel = row.distance - state.distance;
    const y = state.player.y - rel * 0.6;
    if (y < -30 || y > WORLD_HEIGHT + 30) continue;
    const coin = coinById(row.coinId);
    let x = null;
    if (Array.isArray(state.racers)) {
      const racer = state.racers.find((r) => r && r.coinId === row.coinId);
      if (racer && typeof racer.x === 'number') x = racer.x;
      else if (racer && typeof racer.lane === 'number') x = laneCenter(racer.lane);
    }
    if (x === null) {
      const idx = COINS.findIndex((c) => c.id === row.coinId);
      x = laneCenter(Math.max(0, idx) % LANES);
    }
    ctx.globalAlpha = 0.85;
    drawCoinDisc(x, y, 16, coin);
    ctx.globalAlpha = 1;
  }
}

function drawPlayer() {
  const p = state.player;
  const coin = coinById(state.playerCoin) || COINS[0];
  const invulnerable = state.time < p.invulnUntil;
  const blink = invulnerable && Math.floor(state.time * 12) % 2 === 0;
  const boosting = state.time < p.boostUntil;
  ctx.save();
  if (blink) ctx.globalAlpha = 0.45;
  if (boosting) {
    ctx.shadowColor = '#7cff6b';
    ctx.shadowBlur = 24;
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 26, 24, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  drawCoinDisc(p.x, p.y, 26, coin);
  ctx.restore();
}

function drawParticles(dt) {
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.shape !== 'line') p.vy += 160 * dt;
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
    ctx.fillStyle = p.color;
    if (p.shape === 'line') {
      ctx.fillRect(p.x - 1, p.y - 14, 2, 28);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function draw(dt) {
  ctx.save();
  if (performance.now() < shakeUntil) {
    ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
  }
  drawBackground();
  if (state.status !== 'menu') {
    drawRacers();
    for (const entity of state.entities) drawEntity(entity);
    drawPlayer();
  }
  drawParticles(dt);
  ctx.restore();
}

function handleEvents() {
  const events = state.events ? state.events.splice(0) : [];
  for (const event of events) {
    if (event.type === 'boost') {
      playBoost();
      speedLines(state.player.x, state.player.y);
    } else if (event.type === 'rocket') {
      playRocket();
      speedLines(state.player.x, state.player.y);
    } else if (event.type === 'hit') {
      playHit();
      shakeUntil = performance.now() + 250;
      burst(state.player.x, state.player.y, '#ffb020', 14);
    } else if (event.type === 'surge') {
      playSurge();
    } else if (event.type === 'go') {
      playGoBeep();
      goUntil = performance.now() + 700;
    } else if (event.type === 'overtake') {
      const coin = coinById(event.coinId);
      playOvertake();
      showNotify('You passed ' + (coin ? coin.symbol : event.coinId) + '!');
    } else if (event.type === 'passed') {
      const coin = coinById(event.coinId);
      showNotify((coin ? coin.symbol : event.coinId) + ' passed you!');
    }
  }
}

// Autopilot: dodge obstacles ahead in the current lane, chase nearby
// pickups. Runs only in ?autoplay mode.
function autopilot(now) {
  const p = state.player;
  const ahead = state.entities.filter((e) => e.y < p.y + 10 && e.y > p.y - 220);
  const blocked = (lane) => ahead.some((e) => e.lane === lane && OBSTACLES.has(e.kind));
  if (blocked(p.lane)) {
    for (const dir of [-1, 1]) {
      const lane = p.lane + dir;
      if (lane >= 0 && lane < LANES && !blocked(lane)) {
        switchLane(state, dir);
        return;
      }
    }
    for (let lane = 0; lane < LANES; lane++) {
      if (!blocked(lane) && lane !== p.lane) {
        switchLane(state, Math.sign(lane - p.lane));
        return;
      }
    }
    return;
  }
  if (now - lastAutoSwitch < 150) return;
  const pickup = ahead.find((e) => PICKUPS.has(e.kind) && e.lane !== p.lane);
  if (pickup && !blocked(pickup.lane)) {
    switchLane(state, Math.sign(pickup.lane - p.lane));
    lastAutoSwitch = now;
  }
}

const keys = new Set();
let pointerX = null;

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
  lastTime = now;

  if (AUTOPLAY && state.status === 'menu' && !autoplayTimer) {
    selectedCoinId = COINS[Math.floor(Math.random() * COINS.length)].id;
    selectCoin(state, selectedCoinId);
    startRun();
  }

  if (state.status === 'countdown' || state.status === 'playing') {
    // Catches a tap mid-race (?autoplay): the AudioContext only exists
    // after a gesture, so music starts as soon as it can.
    startMusic();
    if (AUTOPLAY && state.status === 'playing') autopilot(now);
    const input = {
      left: keys.has('ArrowLeft') || keys.has('a') || keys.has('A'),
      right: keys.has('ArrowRight') || keys.has('d') || keys.has('D'),
      moveX: pointerX,
    };
    step(state, dt, input);
    stripeOffset += state.speed * dt;
    handleEvents();
    if (state.status === 'countdown') {
      const count = Math.max(1, Math.ceil(state.countdown));
      if (lastCount !== count) {
        lastCount = count;
        playCountBeep();
      }
      countdownEl.textContent = count;
      countdownEl.hidden = false;
    } else if (now < goUntil) {
      countdownEl.textContent = 'GO!';
      countdownEl.hidden = false;
    } else {
      countdownEl.hidden = true;
    }
    if (state.status === 'playing' && state.time < state.player.boostUntil) {
      speedLines(state.player.x, state.player.y);
    }
    refreshHud();
  }

  if (prevStatus !== 'finished' && state.status === 'finished') {
    countdownEl.hidden = true;
    endRun();
    if (AUTOPLAY && !autoplayTimer) {
      autoplayTimer = setTimeout(() => {
        autoplayTimer = null;
        if (state.status !== 'finished') return;
        selectedCoinId = COINS[Math.floor(Math.random() * COINS.length)].id;
        selectCoin(state, selectedCoinId);
        resetGame(state);
        selectCoin(state, selectedCoinId);
        startRun();
      }, 3000);
    }
  }
  prevStatus = state.status;

  draw(dt);
  requestAnimationFrame(frame);
}

function canvasX(clientX) {
  const rect = canvas.getBoundingClientRect();
  return ((clientX - rect.left) / rect.width) * WORLD_WIDTH;
}

// Any touch anywhere on the page unlocks audio (mobile autoplay policy):
// the AudioContext must start from a user gesture, wherever it lands,
// including a tap on empty space, the menu overlay, or the canvas.
document.addEventListener('pointerdown', ensureAudio, { capture: true });
document.addEventListener('touchstart', ensureAudio, { capture: true, passive: true });

canvas.addEventListener('pointerdown', (event) => {
  ensureAudio();
  pointerX = canvasX(event.clientX);
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (pointerX !== null) pointerX = canvasX(event.clientX);
});
canvas.addEventListener('pointerup', () => {
  pointerX = null;
});
canvas.addEventListener('pointercancel', () => {
  pointerX = null;
});

document.addEventListener('keydown', (event) => {
  ensureAudio();
  if (event.key === 'p' || event.key === 'P') {
    if (state.status === 'playing' || state.status === 'countdown') {
      pauseGame(state);
      suspendAudio();
      showOverlay('pause');
    } else if (state.status === 'paused') {
      resumeGame(state);
      if (sound.music && sound.ctx) {
        sound.music.nextTime = sound.ctx.currentTime + 0.05;
      }
      showOverlay('playing');
    }
    return;
  }
  if (event.key === ' ' || event.key === 'Enter') {
    if (state.status === 'menu') {
      event.preventDefault();
      startRun();
    } else if (state.status === 'finished') {
      event.preventDefault();
      resetGame(state);
      selectCoin(state, selectedCoinId);
      startRun();
    }
    return;
  }
  if (state.status === 'playing') {
    if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
      event.preventDefault();
      switchLane(state, -1);
    } else if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
      event.preventDefault();
      switchLane(state, 1);
    }
  }
});
document.addEventListener('keyup', (event) => keys.delete(event.key));

document.getElementById('start-btn').addEventListener('click', () => {
  ensureAudio();
  startRun();
});
document.getElementById('again-btn').addEventListener('click', () => {
  ensureAudio();
  resetGame(state);
  selectCoin(state, selectedCoinId);
  startRun();
});
document.getElementById('resume-btn').addEventListener('click', () => {
  ensureAudio();
  resumeGame(state);
  if (sound.music && sound.ctx) {
    sound.music.nextTime = sound.ctx.currentTime + 0.05;
  }
  showOverlay('playing');
});
document.getElementById('quit-btn').addEventListener('click', toMenu);
document.getElementById('menu-btn').addEventListener('click', toMenu);
muteBtn.addEventListener('click', () => {
  ensureAudio();
  setMuted(!sound.muted);
});

// Debug hook for automated verification: exposes the live state and the
// sound engine (AudioContext, master gain, oscillator counter) so a test
// can measure real output instead of guessing from the timer.
window.__coinrace = { state, sound };

selectCoin(state, selectedCoinId);
renderCoinGrid();
fetchMarket();
setMuted(sound.muted);
refreshMenuBest();
showOverlay('menu');
requestAnimationFrame(frame);
