// Coin Race game logic. Pure functions, no DOM access, so the whole
// game can run in tests and in the browser from the same code.
//
// Eight coins race 1000 meters. Each coin runs as fast as its 24h
// market move: a coin up 8 percent runs quicker than one down 6.
// You steer your coin across four lanes, dodge red candles and FUD
// clouds, grab green candles and rockets, and try to finish first.

export const WORLD_WIDTH = 480;
export const WORLD_HEIGHT = 720;
export const PLAYER_Y = 600;

export const LANES = 4;
export const TRACK_LEFT = 40;
export const LANE_WIDTH = 100;

export const RACE_DISTANCE = 1000;
export const COUNTDOWN_SECONDS = 3;

export const COINS = [
  { id: 'btc', symbol: 'BTC', name: 'Bitcoin', color: '#f7931a', glyph: '₿', apiId: 'bitcoin' },
  { id: 'eth', symbol: 'ETH', name: 'Ethereum', color: '#627eea', glyph: 'Ξ', apiId: 'ethereum' },
  { id: 'sol', symbol: 'SOL', name: 'Solana', color: '#9945ff', glyph: '◎', apiId: 'solana' },
  { id: 'avax', symbol: 'AVAX', name: 'Avalanche', color: '#e84142', glyph: '▲', apiId: 'avalanche-2' },
  { id: 'sui', symbol: 'SUI', name: 'Sui', color: '#4da2ff', glyph: 'S', apiId: 'sui' },
  { id: 'bnb', symbol: 'BNB', name: 'BNB', color: '#f0b90b', glyph: '◆', apiId: 'binancecoin' },
  { id: 'doge', symbol: 'DOGE', name: 'Dogecoin', color: '#c2a633', glyph: 'Ð', apiId: 'dogecoin' },
  { id: 'xrp', symbol: 'XRP', name: 'XRP', color: '#9aa5b1', glyph: '✕', apiId: 'ripple' },
];

export const BASE_PLAYER_SPEED = 260;
export const BASE_RACER_SPEED = 24;
export const LANE_COOLDOWN_SECONDS = 0.22;
export const LATERAL_SPEED = 520;

export const BOOST_GREEN_FACTOR = 1.35;
export const BOOST_GREEN_SECONDS = 2.5;
export const BOOST_ROCKET_FACTOR = 1.7;
export const BOOST_ROCKET_SECONDS = 3;

export const STUN_SECONDS = 0.8;
export const STUN_FACTOR = 0.35;
export const INVULN_SECONDS = 1.5;

export const SURGE_FACTOR = 1.25;
export const RUBBER_BAND_METERS = 80;
export const RUBBER_BAND_FACTOR = 0.08;

export const SAFE_OPENING_METERS = 50;
export const SPAWN_INTERVAL = 0.9;

export const POSITION_POINTS = [1000, 700, 500, 350, 250, 150, 100, 50];
export const TIME_BONUS_BASE_SECONDS = 60;
export const TIME_BONUS_PER_SECOND = 10;
export const TIME_BONUS_MAX = 500;
export const PICKUP_POINTS = 25;

export const ENTITY_SIZES = {
  red: { width: 44, height: 56 },
  fud: { width: 56, height: 44 },
  green: { width: 44, height: 56 },
  rocket: { width: 40, height: 56 },
};

export const PLAYER_SIZE = { width: 48, height: 48 };

const DEFAULT_LANE = 1;
const HAZARD_ROW_CHANCE = 0.68;
const TWO_HAZARD_CHANCE = 0.4;
const ROCKET_CHANCE = 0.25;
const OPENING_REWARD_CHANCE = 0.35;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function coinById(id) {
  return COINS.find((coin) => coin.id === id);
}

export function laneCenter(lane) {
  return TRACK_LEFT + LANE_WIDTH * lane + LANE_WIDTH / 2;
}

function nearestLane(x) {
  const raw = Math.round((x - TRACK_LEFT - LANE_WIDTH / 2) / LANE_WIDTH);
  return clamp(raw, 0, LANES - 1);
}

export function speedFactorForChange(changePct) {
  return 1 + clamp(changePct, -10, 10) * 0.01;
}

// Fake market for offline play: every coin moves between -6 and +8
// percent, rounded to one decimal.
export function simulatedMarket(random = Math.random) {
  const market = {};
  for (const coin of COINS) {
    const value = Math.round((random() * 14 - 6) * 10) / 10;
    market[coin.id] = value === 0 ? 0 : value;
  }
  return market;
}

function marketChange(state, coinId) {
  return state.market?.[coinId] ?? 0;
}

// A racer with a big move, up or down, is more likely to surge.
export function surgeChance(changePct) {
  return Math.min(0.9, 0.2 + Math.abs(changePct) * 0.08);
}

export function createGame(random = Math.random) {
  return {
    status: 'menu',
    time: 0,
    countdown: 0,
    distance: 0,
    speed: 0,
    playerCoin: COINS[0].id,
    market: null,
    player: {
      lane: DEFAULT_LANE,
      x: laneCenter(DEFAULT_LANE),
      y: PLAYER_Y,
      boostUntil: 0,
      stunUntil: 0,
      invulnUntil: 0,
      laneCooldown: 0,
      boostFactor: 1,
      finishTime: null,
    },
    racers: [],
    entities: [],
    spawnTimer: 0,
    pickups: 0,
    hits: 0,
    events: [],
    random,
  };
}

export function selectCoin(state, coinId) {
  if (state.status !== 'menu') return state;
  const coin = coinById(coinId);
  if (coin) state.playerCoin = coin.id;
  return state;
}

export function startRace(state, market) {
  const coin = state.playerCoin;
  const random = state.random;
  Object.assign(state, createGame(random));
  state.playerCoin = coin;
  state.market = market || simulatedMarket(random);
  state.status = 'countdown';
  state.countdown = COUNTDOWN_SECONDS;
  state.spawnTimer = SPAWN_INTERVAL;
  state.racers = COINS.filter((c) => c.id !== coin).map((c) => ({
    coinId: c.id,
    distance: 0,
    finished: false,
    finishTime: null,
    surgeUntil: 0,
    nextSurgeIn: 5 + random() * 7,
    pace: 0.92 + random() * 0.16,
  }));
  return state;
}

export function pauseGame(state) {
  if (state.status === 'playing') state.status = 'paused';
  return state;
}

export function resumeGame(state) {
  if (state.status === 'paused') state.status = 'playing';
  return state;
}

export function resetGame(state) {
  const fresh = createGame(state.random);
  Object.assign(state, fresh);
  return state;
}

export function switchLane(state, dir) {
  if (state.status !== 'playing') return state;
  if (state.player.laneCooldown > 0) return state;
  const stepDir = dir > 0 ? 1 : dir < 0 ? -1 : 0;
  if (stepDir === 0) return state;
  const next = clamp(state.player.lane + stepDir, 0, LANES - 1);
  if (next === state.player.lane) return state;
  state.player.lane = next;
  state.player.laneCooldown = LANE_COOLDOWN_SECONDS;
  return state;
}

// Current pixel speed of the player coin, with boost and stun applied.
// Even stunned with the worst market move this stays above zero, so
// the player always creeps forward and the race always ends.
export function playerSpeed(state) {
  const factor = speedFactorForChange(marketChange(state, state.playerCoin));
  let speed = BASE_PLAYER_SPEED * factor;
  const player = state.player;
  if (state.time < player.boostUntil) speed *= player.boostFactor;
  if (state.time < player.stunUntil) speed *= STUN_FACTOR;
  return speed;
}

export function racerSpeed(state, racer) {
  const factor = speedFactorForChange(marketChange(state, racer.coinId));
  let speed = BASE_RACER_SPEED * factor * racer.pace;
  if (state.time < racer.surgeUntil) speed *= SURGE_FACTOR;
  const gap = racer.distance - state.distance;
  if (gap > RUBBER_BAND_METERS) speed *= 1 - RUBBER_BAND_FACTOR;
  else if (gap < -RUBBER_BAND_METERS) speed *= 1 + RUBBER_BAND_FACTOR;
  return speed;
}

function addEntity(state, kind, lane) {
  const size = ENTITY_SIZES[kind];
  const entity = {
    kind,
    lane,
    x: laneCenter(lane),
    y: -size.height,
    width: size.width,
    height: size.height,
    passed: false,
  };
  state.entities.push(entity);
  return entity;
}

// One row of the track. A hazard row blocks one or two lanes, never
// all four. Rewards get their own rows. The opening stretch has no
// hazards at all, only the odd reward.
export function spawnRow(state) {
  const spawned = [];
  const random = state.random;
  const opening = state.distance < SAFE_OPENING_METERS;
  const hazardRow = !opening && random() < HAZARD_ROW_CHANCE;
  if (hazardRow) {
    const count = random() < TWO_HAZARD_CHANCE ? 2 : 1;
    const lanes = [0, 1, 2, 3];
    for (let i = 0; i < count; i++) {
      const pick = Math.floor(random() * lanes.length);
      const lane = lanes.splice(pick, 1)[0];
      const kind = random() < 0.5 ? 'red' : 'fud';
      spawned.push(addEntity(state, kind, lane));
    }
  } else if (!opening || random() < OPENING_REWARD_CHANCE) {
    const lane = Math.floor(random() * LANES);
    const kind = random() < ROCKET_CHANCE ? 'rocket' : 'green';
    spawned.push(addEntity(state, kind, lane));
  }
  return spawned;
}

function overlaps(a, b, shrink = 0.75) {
  const aw = a.width * shrink;
  const ah = a.height * shrink;
  const bw = b.width * shrink;
  const bh = b.height * shrink;
  return (
    Math.abs(a.x - b.x) * 2 < aw + bw &&
    Math.abs(a.y - b.y) * 2 < ah + bh
  );
}

function movePlayer(state, dt, input) {
  const player = state.player;
  if (typeof input.moveX === 'number') {
    const diff = input.moveX - player.x;
    const maxStep = LATERAL_SPEED * dt;
    player.x += clamp(diff, -maxStep, maxStep);
    player.lane = nearestLane(player.x);
  } else {
    if (input.left) switchLane(state, -1);
    if (input.right) switchLane(state, 1);
    const target = laneCenter(player.lane);
    const diff = target - player.x;
    const maxStep = LATERAL_SPEED * dt;
    player.x += clamp(diff, -maxStep, maxStep);
  }
  player.x = clamp(player.x, TRACK_LEFT, TRACK_LEFT + LANES * LANE_WIDTH);
}

function updateRacers(state, dt) {
  for (const racer of state.racers) {
    if (racer.finished) continue;
    racer.nextSurgeIn -= dt;
    if (racer.nextSurgeIn <= 0) {
      const change = marketChange(state, racer.coinId);
      if (state.random() < surgeChance(change)) {
        racer.surgeUntil = state.time + 2 + state.random() * 1;
        state.events.push({ type: 'surge', coinId: racer.coinId });
      }
      racer.nextSurgeIn = 6 + state.random() * 6;
    }
    racer.distance += racerSpeed(state, racer) * dt;
    if (racer.distance >= RACE_DISTANCE) {
      racer.distance = RACE_DISTANCE;
      racer.finished = true;
      racer.finishTime = state.time;
    }
  }
}

function aheadOfPlayer(table) {
  const position = table.find((entry) => entry.isPlayer).position;
  return new Set(
    table.filter((entry) => entry.position < position).map((entry) => entry.coinId),
  );
}

export function step(state, dt, input = {}) {
  state.events = [];
  if (dt <= 0) return state;

  if (state.status === 'countdown') {
    state.countdown -= dt;
    if (state.countdown <= 0) {
      state.countdown = 0;
      state.status = 'playing';
      state.events.push({ type: 'go' });
    }
    return state;
  }

  if (state.status !== 'playing') return state;

  const aheadBefore = aheadOfPlayer(standings(state));

  state.time += dt;
  const player = state.player;
  if (player.laneCooldown > 0) player.laneCooldown -= dt;

  movePlayer(state, dt, input);

  state.speed = playerSpeed(state);
  state.distance += (state.speed * dt) / 10;

  updateRacers(state, dt);

  state.spawnTimer -= dt;
  while (state.spawnTimer <= 0) {
    spawnRow(state);
    state.spawnTimer += SPAWN_INTERVAL;
  }

  const box = {
    x: player.x,
    y: player.y,
    width: PLAYER_SIZE.width,
    height: PLAYER_SIZE.height,
  };
  for (const entity of state.entities) {
    entity.y += state.speed * dt;
    if (entity.passed) continue;
    if (!overlaps(box, entity)) continue;
    if (entity.kind === 'green' || entity.kind === 'rocket') {
      const factor = entity.kind === 'green' ? BOOST_GREEN_FACTOR : BOOST_ROCKET_FACTOR;
      const seconds = entity.kind === 'green' ? BOOST_GREEN_SECONDS : BOOST_ROCKET_SECONDS;
      if (state.time >= player.boostUntil || factor > player.boostFactor) {
        player.boostUntil = state.time + seconds;
        player.boostFactor = factor;
      }
      if (entity.kind === 'rocket') {
        player.invulnUntil = Math.max(player.invulnUntil, state.time + BOOST_ROCKET_SECONDS);
      }
      entity.passed = true;
      state.pickups += 1;
      state.events.push({ type: entity.kind === 'green' ? 'boost' : 'rocket' });
    } else if (state.time >= player.invulnUntil) {
      entity.passed = true;
      player.stunUntil = state.time + STUN_SECONDS;
      player.invulnUntil = state.time + INVULN_SECONDS;
      state.hits += 1;
      state.events.push({ type: 'hit', kind: entity.kind });
    }
  }
  state.entities = state.entities.filter(
    (entity) => entity.y < WORLD_HEIGHT + 80 && !entity.passed,
  );

  if (state.distance >= RACE_DISTANCE) {
    state.distance = RACE_DISTANCE;
    state.status = 'finished';
    player.finishTime = state.time;
    state.events.push({ type: 'finish' });
  }

  const aheadAfter = aheadOfPlayer(standings(state));
  for (const coinId of aheadBefore) {
    if (!aheadAfter.has(coinId)) state.events.push({ type: 'overtake', coinId });
  }
  for (const coinId of aheadAfter) {
    if (!aheadBefore.has(coinId)) state.events.push({ type: 'passed', coinId });
  }

  return state;
}

export function standings(state) {
  const entries = [
    {
      coinId: state.playerCoin,
      distance: state.distance,
      finished: state.player.finishTime !== null,
      finishTime: state.player.finishTime,
      isPlayer: true,
    },
    ...state.racers.map((racer) => ({
      coinId: racer.coinId,
      distance: racer.distance,
      finished: racer.finished,
      finishTime: racer.finishTime,
      isPlayer: false,
    })),
  ];
  entries.sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.distance - a.distance;
  });
  entries.forEach((entry, i) => {
    entry.position = i + 1;
  });
  return entries;
}

export function playerPosition(state) {
  return standings(state).find((entry) => entry.isPlayer).position;
}

export function raceTime(state) {
  return state.time;
}

export function finalScore(state) {
  if (state.player.finishTime === null) return 0;
  const position = playerPosition(state);
  const place = POSITION_POINTS[position - 1] || 0;
  const early = Math.max(0, TIME_BONUS_BASE_SECONDS - state.player.finishTime);
  const timeBonus = Math.min(
    TIME_BONUS_MAX,
    Math.round(early * TIME_BONUS_PER_SECOND),
  );
  return place + timeBonus + state.pickups * PICKUP_POINTS;
}

export function finishPosition(state) {
  if (state.player.finishTime === null) return null;
  return playerPosition(state);
}
