import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_PLAYER_SPEED,
  BOOST_GREEN_FACTOR,
  BOOST_ROCKET_FACTOR,
  COINS,
  COUNTDOWN_SECONDS,
  ENTITY_SIZES,
  LANES,
  LANE_WIDTH,
  PLAYER_Y,
  RACE_DISTANCE,
  STUN_FACTOR,
  TRACK_LEFT,
  WORLD_HEIGHT,
  coinById,
  createGame,
  finalScore,
  finishPosition,
  laneCenter,
  pauseGame,
  playerPosition,
  playerSpeed,
  raceTime,
  racerSpeed,
  resetGame,
  resumeGame,
  selectCoin,
  simulatedMarket,
  spawnRow,
  speedFactorForChange,
  standings,
  startRace,
  step,
  surgeChance,
  switchLane,
} from '../src/game.js';

function fixedRandom(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

function flatMarket() {
  return { btc: 0, eth: 0, sol: 0, avax: 0, sui: 0, bnb: 0, doge: 0, xrp: 0 };
}

function closeTo(actual, expected, epsilon = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${actual} to be close to ${expected}`,
  );
}

function skipCountdown(state) {
  while (state.status === 'countdown') step(state, 1);
}

function racingGame(random = fixedRandom([0.5]), market = flatMarket()) {
  const state = createGame(random);
  startRace(state, market);
  state.spawnTimer = 100;
  skipCountdown(state);
  return state;
}

function putEntity(state, kind, x, y) {
  const size = ENTITY_SIZES[kind];
  const entity = { kind, lane: 1, x, y, width: size.width, height: size.height, passed: false };
  state.entities.push(entity);
  return entity;
}

test('coin list has eight coins in fixed order with market ids', () => {
  assert.equal(COINS.length, 8);
  assert.deepEqual(
    COINS.map((c) => c.id),
    ['btc', 'eth', 'sol', 'avax', 'sui', 'bnb', 'doge', 'xrp'],
  );
  assert.deepEqual(
    COINS.map((c) => c.symbol),
    ['BTC', 'ETH', 'SOL', 'AVAX', 'SUI', 'BNB', 'DOGE', 'XRP'],
  );
  assert.equal(COINS[0].name, 'Bitcoin');
  assert.equal(COINS[0].color, '#f7931a');
  assert.equal(COINS[0].glyph, '₿');
  assert.equal(COINS[0].apiId, 'bitcoin');
  assert.equal(COINS[1].apiId, 'ethereum');
  assert.equal(COINS[2].apiId, 'solana');
  assert.equal(COINS[3].apiId, 'avalanche-2');
  assert.equal(COINS[4].apiId, 'sui');
  assert.equal(COINS[5].apiId, 'binancecoin');
  assert.equal(COINS[6].apiId, 'dogecoin');
  assert.equal(COINS[7].apiId, 'ripple');
  for (const coin of COINS) {
    assert.ok(coin.color.startsWith('#'));
    assert.ok(coin.glyph.length >= 1);
  }
});

test('coinById finds a coin or returns undefined', () => {
  assert.equal(coinById('sol').name, 'Solana');
  assert.equal(coinById('xrp').symbol, 'XRP');
  assert.equal(coinById('nope'), undefined);
  assert.equal(coinById(''), undefined);
});

test('lane centers sit 100 px apart starting at 90', () => {
  assert.equal(LANES, 4);
  assert.equal(TRACK_LEFT, 40);
  assert.equal(LANE_WIDTH, 100);
  assert.equal(laneCenter(0), 90);
  assert.equal(laneCenter(1), 190);
  assert.equal(laneCenter(2), 290);
  assert.equal(laneCenter(3), 390);
});

test('speed factor follows the 24h change and clamps at plus or minus 10', () => {
  assert.equal(speedFactorForChange(0), 1);
  closeTo(speedFactorForChange(5), 1.05);
  closeTo(speedFactorForChange(-5), 0.95);
  closeTo(speedFactorForChange(10), 1.1);
  closeTo(speedFactorForChange(-10), 0.9);
  closeTo(speedFactorForChange(25), 1.1);
  closeTo(speedFactorForChange(-40), 0.9);
  closeTo(speedFactorForChange(8), 1.08);
});

test('simulated market covers all coins inside minus 6 to plus 8 with one decimal', () => {
  const market = simulatedMarket(seededRandom(11));
  assert.deepEqual(Object.keys(market).sort(), COINS.map((c) => c.id).sort());
  for (const value of Object.values(market)) {
    assert.ok(value >= -6 && value <= 8);
    assert.equal(Math.round(value * 10) / 10, value);
  }
  const random = seededRandom(3);
  for (let i = 0; i < 200; i++) {
    const draw = simulatedMarket(random);
    for (const value of Object.values(draw)) {
      assert.ok(value >= -6 && value <= 8);
    }
  }
});

test('createGame starts on the menu with the default coin and an empty track', () => {
  const state = createGame();
  assert.equal(state.status, 'menu');
  assert.equal(state.time, 0);
  assert.equal(state.countdown, 0);
  assert.equal(state.distance, 0);
  assert.equal(state.speed, 0);
  assert.equal(state.playerCoin, 'btc');
  assert.equal(state.market, null);
  assert.equal(state.player.lane, 1);
  assert.equal(state.player.x, laneCenter(1));
  assert.equal(state.player.y, PLAYER_Y);
  assert.equal(state.player.boostUntil, 0);
  assert.equal(state.player.stunUntil, 0);
  assert.equal(state.player.invulnUntil, 0);
  assert.equal(state.player.laneCooldown, 0);
  assert.deepEqual(state.racers, []);
  assert.deepEqual(state.entities, []);
  assert.equal(state.pickups, 0);
  assert.equal(state.hits, 0);
  assert.deepEqual(state.events, []);
});

test('selectCoin changes the player coin on the menu', () => {
  const state = createGame();
  selectCoin(state, 'doge');
  assert.equal(state.playerCoin, 'doge');
  selectCoin(state, 'avax');
  assert.equal(state.playerCoin, 'avax');
});

test('selectCoin ignores unknown ids', () => {
  const state = createGame();
  selectCoin(state, 'pepe');
  assert.equal(state.playerCoin, 'btc');
  selectCoin(state, '');
  assert.equal(state.playerCoin, 'btc');
  selectCoin(state, undefined);
  assert.equal(state.playerCoin, 'btc');
});

test('selectCoin does nothing once the race has started', () => {
  const state = racingGame();
  selectCoin(state, 'eth');
  assert.equal(state.playerCoin, 'btc');
});

test('startRace sets up the countdown with seven rivals', () => {
  const state = createGame(fixedRandom([0.5]));
  selectCoin(state, 'sol');
  startRace(state, flatMarket());
  assert.equal(state.status, 'countdown');
  assert.equal(state.countdown, COUNTDOWN_SECONDS);
  assert.equal(state.countdown, 3);
  assert.equal(state.racers.length, 7);
  assert.ok(!state.racers.some((r) => r.coinId === 'sol'));
  assert.deepEqual(
    state.racers.map((r) => r.coinId).sort(),
    ['avax', 'bnb', 'btc', 'doge', 'eth', 'sui', 'xrp'],
  );
  for (const racer of state.racers) {
    assert.equal(racer.distance, 0);
    assert.equal(racer.finished, false);
    assert.equal(racer.finishTime, null);
    assert.equal(racer.surgeUntil, 0);
    assert.ok(racer.nextSurgeIn >= 5 && racer.nextSurgeIn <= 12);
    assert.ok(racer.pace >= 0.92 && racer.pace <= 1.08);
  }
  assert.equal(state.time, 0);
  assert.equal(state.distance, 0);
  assert.deepEqual(state.entities, []);
});

test('startRace uses the given market and falls back to a simulated one', () => {
  const market = { btc: 4.2, eth: -1.5, sol: 7.7, avax: 0, sui: -3.3, bnb: 2, doge: -6, xrp: 8 };
  const state = createGame();
  startRace(state, market);
  assert.equal(state.market, market);

  const simmed = createGame(seededRandom(9));
  startRace(simmed);
  assert.equal(Object.keys(simmed.market).length, 8);
  for (const value of Object.values(simmed.market)) {
    assert.ok(value >= -6 && value <= 8);
  }
});

test('startRace restarts cleanly after a finished race', () => {
  const state = racingGame();
  state.distance = 990;
  step(state, 0.5);
  assert.equal(state.status, 'finished');
  startRace(state, flatMarket());
  assert.equal(state.status, 'countdown');
  assert.equal(state.distance, 0);
  assert.equal(state.time, 0);
  assert.equal(state.racers.length, 7);
  assert.equal(state.player.finishTime, null);
});

test('countdown ticks down and the race starts with a go event', () => {
  const state = createGame(fixedRandom([0.5]));
  startRace(state, flatMarket());
  step(state, 1);
  assert.equal(state.status, 'countdown');
  assert.equal(state.countdown, 2);
  assert.equal(state.time, 0);
  assert.equal(state.distance, 0);
  step(state, 1);
  assert.equal(state.countdown, 1);
  step(state, 1);
  assert.equal(state.status, 'playing');
  assert.equal(state.countdown, 0);
  assert.ok(state.events.some((e) => e.type === 'go'));
  assert.equal(raceTime(state), 0);
});

test('step does nothing on the menu, while paused, or after the finish', () => {
  const menu = createGame();
  step(menu, 1);
  assert.equal(menu.time, 0);

  const paused = racingGame();
  pauseGame(paused);
  step(paused, 1);
  assert.equal(paused.time, 0);
  assert.equal(paused.distance, 0);

  const finished = racingGame();
  finished.distance = 999;
  step(finished, 1);
  assert.equal(finished.status, 'finished');
  const time = finished.time;
  step(finished, 1);
  assert.equal(finished.time, time);
});

test('switchLane moves one lane and stops at the track edges', () => {
  const state = racingGame();
  assert.equal(state.player.lane, 1);
  switchLane(state, 1);
  assert.equal(state.player.lane, 2);
  step(state, 0.3);
  switchLane(state, 1);
  assert.equal(state.player.lane, 3);
  step(state, 0.3);
  switchLane(state, 1);
  assert.equal(state.player.lane, 3);
  switchLane(state, -1);
  assert.equal(state.player.lane, 2);
});

test('lane changes wait out the cooldown', () => {
  const state = racingGame();
  switchLane(state, 1);
  assert.equal(state.player.lane, 2);
  switchLane(state, 1);
  assert.equal(state.player.lane, 2);
  step(state, 0.1);
  switchLane(state, 1);
  assert.equal(state.player.lane, 2);
  step(state, 0.2);
  switchLane(state, 1);
  assert.equal(state.player.lane, 3);
});

test('switchLane does nothing off the track', () => {
  const state = createGame();
  switchLane(state, 1);
  assert.equal(state.player.lane, 1);
});

test('step steers with left and right input', () => {
  const state = racingGame();
  step(state, 0.1, { left: true });
  assert.equal(state.player.lane, 0);
  step(state, 0.3, { right: true });
  assert.equal(state.player.lane, 1);
  step(state, 0.3, { right: true });
  assert.equal(state.player.lane, 2);
});

test('moveX drags the player and snaps the lane to the nearest one', () => {
  const state = racingGame();
  step(state, 1, { moveX: 390 });
  assert.ok(state.player.x > 350);
  assert.equal(state.player.lane, 3);
  step(state, 1, { moveX: 90 });
  assert.ok(state.player.x < 130);
  assert.equal(state.player.lane, 0);
});

test('player x eases toward the new lane center after a switch', () => {
  const state = racingGame();
  const start = state.player.x;
  switchLane(state, 1);
  assert.equal(state.player.x, start);
  step(state, 0.1);
  assert.ok(state.player.x > start);
  assert.ok(state.player.x < laneCenter(2));
  step(state, 1);
  assert.equal(state.player.x, laneCenter(2));
});

test('distance grows from the pixel speed', () => {
  const state = racingGame();
  step(state, 1);
  assert.equal(state.speed, BASE_PLAYER_SPEED);
  assert.equal(state.distance, 26);
  assert.equal(state.time, 1);
  step(state, 2);
  assert.equal(state.distance, 78);
});

test('a green coin runs faster than a red one', () => {
  const up = createGame(fixedRandom([0.5]));
  startRace(up, { ...flatMarket(), btc: 8 });
  skipCountdown(up);
  const down = createGame(fixedRandom([0.5]));
  startRace(down, { ...flatMarket(), btc: -6 });
  skipCountdown(down);
  step(up, 1);
  step(down, 1);
  assert.ok(up.distance > down.distance);
  closeTo(up.speed, BASE_PLAYER_SPEED * 1.08);
  closeTo(down.speed, BASE_PLAYER_SPEED * 0.94);
});

test('a green candle boosts speed by 35 percent for 2.5 seconds', () => {
  const state = racingGame();
  putEntity(state, 'green', state.player.x, state.player.y);
  step(state, 0.01);
  assert.equal(state.pickups, 1);
  assert.ok(state.events.some((e) => e.type === 'boost'));
  assert.ok(state.player.boostUntil > state.time);
  step(state, 0.1);
  closeTo(state.speed, BASE_PLAYER_SPEED * BOOST_GREEN_FACTOR);
  step(state, 2.5);
  closeTo(state.speed, BASE_PLAYER_SPEED);
});

test('a rocket boosts speed by 70 percent and grants a shield', () => {
  const state = racingGame();
  putEntity(state, 'rocket', state.player.x, state.player.y);
  step(state, 0.01);
  assert.equal(state.pickups, 1);
  assert.ok(state.events.some((e) => e.type === 'rocket'));
  assert.ok(state.player.invulnUntil > state.time);
  step(state, 0.1);
  closeTo(state.speed, BASE_PLAYER_SPEED * BOOST_ROCKET_FACTOR);
  putEntity(state, 'red', state.player.x, state.player.y);
  step(state, 0.01);
  assert.equal(state.hits, 0);
});

test('a red candle stuns the player and grants a shield window', () => {
  const state = racingGame();
  putEntity(state, 'red', state.player.x, state.player.y);
  step(state, 0.01);
  assert.equal(state.hits, 1);
  assert.ok(state.events.some((e) => e.type === 'hit' && e.kind === 'red'));
  assert.ok(state.player.stunUntil > state.time);
  assert.ok(state.player.invulnUntil > state.time);
  step(state, 0.1);
  closeTo(state.speed, BASE_PLAYER_SPEED * STUN_FACTOR);
});

test('no second hit lands during the shield window', () => {
  const state = racingGame();
  putEntity(state, 'red', state.player.x, state.player.y);
  step(state, 0.01);
  putEntity(state, 'fud', state.player.x, state.player.y);
  step(state, 0.01);
  assert.equal(state.hits, 1);
});

test('hits count again after the shield window ends', () => {
  const state = racingGame();
  putEntity(state, 'red', state.player.x, state.player.y);
  step(state, 0.01);
  step(state, 1.6);
  putEntity(state, 'red', state.player.x, state.player.y);
  step(state, 0.01);
  assert.equal(state.hits, 2);
});

test('the stun wears off after 0.8 seconds', () => {
  const state = racingGame();
  putEntity(state, 'fud', state.player.x, state.player.y);
  step(state, 0.01);
  step(state, 0.5);
  closeTo(state.speed, BASE_PLAYER_SPEED * STUN_FACTOR);
  step(state, 0.5);
  closeTo(state.speed, BASE_PLAYER_SPEED);
});

test('the player always moves forward, even stunned on a red day', () => {
  const state = createGame(fixedRandom([0.5]));
  startRace(state, { ...flatMarket(), btc: -10 });
  state.spawnTimer = 100;
  skipCountdown(state);
  state.player.stunUntil = 100;
  step(state, 1);
  assert.ok(state.speed > 0);
  assert.ok(state.distance > 0);
  closeTo(state.speed, BASE_PLAYER_SPEED * 0.9 * STUN_FACTOR);
});

test('crossing 1000 meters finishes the race', () => {
  const state = racingGame();
  state.distance = 990;
  step(state, 0.5);
  assert.equal(state.status, 'finished');
  assert.equal(state.distance, RACE_DISTANCE);
  assert.equal(state.player.finishTime, state.time);
  assert.ok(state.events.some((e) => e.type === 'finish'));
  assert.ok(finishPosition(state) !== null);
});

test('rivals record a finish time when they cross the line', () => {
  const state = racingGame();
  state.racers[0].distance = 999;
  state.racers[0].nextSurgeIn = 100;
  step(state, 1);
  assert.equal(state.racers[0].finished, true);
  assert.equal(state.racers[0].finishTime, 1);
  assert.equal(state.racers[0].distance, RACE_DISTANCE);
});

test('standings rank finishers by time and the rest by distance', () => {
  const state = racingGame();
  const [a, b, c] = state.racers;
  a.finished = true;
  a.finishTime = 30;
  a.distance = 1000;
  b.finished = true;
  b.finishTime = 25;
  b.distance = 1000;
  c.distance = 500;
  state.distance = 600;
  const table = standings(state);
  assert.equal(table[0].coinId, b.coinId);
  assert.equal(table[1].coinId, a.coinId);
  assert.equal(table[2].isPlayer, true);
  assert.equal(table[3].coinId, c.coinId);
  assert.equal(table.length, 8);
  assert.deepEqual(table.map((e) => e.position), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(table[0].finished, true);
  assert.equal(table[2].finished, false);
});

test('playerPosition follows the standings', () => {
  const state = racingGame();
  assert.equal(playerPosition(state), 1);
  state.racers[0].distance = 100;
  state.racers[1].distance = 50;
  assert.equal(playerPosition(state), 3);
  state.distance = 120;
  assert.equal(playerPosition(state), 1);
});

test('passing a rival fires an overtake event', () => {
  const state = racingGame();
  const rival = state.racers[0];
  rival.distance = 101;
  state.distance = 100;
  step(state, 1);
  assert.ok(state.events.some((e) => e.type === 'overtake' && e.coinId === rival.coinId));
  assert.equal(playerPosition(state), 1);
});

test('being passed fires a passed event', () => {
  const state = racingGame();
  const rival = state.racers[0];
  rival.distance = 99;
  rival.surgeUntil = 100;
  state.distance = 100;
  step(state, 1);
  assert.ok(state.events.some((e) => e.type === 'passed' && e.coinId === rival.coinId));
});

test('events clear at the start of every step', () => {
  const state = racingGame();
  putEntity(state, 'green', state.player.x, state.player.y);
  step(state, 0.01);
  assert.ok(state.events.length > 0);
  step(state, 0.01);
  assert.deepEqual(state.events, []);
});

test('surge chance grows with the size of the move', () => {
  assert.ok(surgeChance(8) > surgeChance(2));
  assert.ok(surgeChance(-8) > surgeChance(-2));
  assert.ok(surgeChance(0) < surgeChance(6));
  assert.ok(surgeChance(100) <= 0.9);
});

test('a volatility surge speeds a racer up and fires an event', () => {
  const state = createGame(fixedRandom([0.1]));
  startRace(state, { ...flatMarket(), eth: 8 });
  state.spawnTimer = 100;
  skipCountdown(state);
  const racer = state.racers.find((r) => r.coinId === 'eth');
  racer.nextSurgeIn = 0.01;
  step(state, 0.1);
  assert.ok(racer.surgeUntil > state.time);
  assert.ok(state.events.some((e) => e.type === 'surge' && e.coinId === 'eth'));
});

test('a surging racer covers more ground than a calm one', () => {
  const calm = racingGame();
  const surging = racingGame();
  surging.racers[0].surgeUntil = 100;
  surging.racers[0].nextSurgeIn = 100;
  calm.racers[0].nextSurgeIn = 100;
  step(calm, 1);
  step(surging, 1);
  assert.ok(surging.racers[0].distance > calm.racers[0].distance);
  assert.equal(surging.racers[0].distance, 30);
  assert.equal(calm.racers[0].distance, 24);
});

test('rivals run faster when their coin is green', () => {
  const state = racingGame(fixedRandom([0.5]), { ...flatMarket(), eth: 8, sol: -6 });
  step(state, 1);
  assert.ok(state.racers[0].distance > state.racers[1].distance);
  closeTo(state.racers[0].distance, 24 * 1.08);
  closeTo(state.racers[1].distance, 24 * 0.94);
});

test('the rubber band slows a runaway leader and helps a straggler', () => {
  const ahead = racingGame();
  ahead.racers[0].distance = 400;
  ahead.distance = 200;
  ahead.racers[0].nextSurgeIn = 100;
  step(ahead, 1);
  closeTo(ahead.racers[0].distance, 400 + 24 * 0.92);

  const behind = racingGame();
  behind.racers[0].distance = 100;
  behind.distance = 200;
  behind.racers[0].nextSurgeIn = 100;
  step(behind, 1);
  closeTo(behind.racers[0].distance, 100 + 24 * 1.08);
});

test('racer speed helper matches the step math', () => {
  const state = racingGame();
  const racer = state.racers[0];
  assert.equal(racerSpeed(state, racer), 24);
  racer.surgeUntil = 100;
  assert.equal(racerSpeed(state, racer), 30);
});

test('a spawn row never blocks all four lanes', () => {
  const state = racingGame(seededRandom(5));
  state.distance = 500;
  for (let i = 0; i < 300; i++) {
    const row = spawnRow(state);
    const hazardLanes = new Set(
      row.filter((e) => e.kind === 'red' || e.kind === 'fud').map((e) => e.lane),
    );
    assert.ok(hazardLanes.size <= 2);
    assert.ok(row.every((e) => e.lane >= 0 && e.lane < LANES));
    state.entities = [];
  }
});

test('spawned entities sit on lane centers above the screen', () => {
  const state = racingGame(seededRandom(5));
  state.distance = 500;
  const row = spawnRow(state);
  assert.ok(row.length >= 1);
  for (const entity of row) {
    assert.equal(entity.x, laneCenter(entity.lane));
    assert.ok(entity.y < 0);
    assert.equal(entity.passed, false);
  }
});

test('no hazards spawn during the opening 50 meters', () => {
  const state = racingGame(seededRandom(8));
  for (let i = 0; i < 200; i++) {
    state.distance = i % 50;
    const row = spawnRow(state);
    assert.ok(row.every((e) => e.kind === 'green' || e.kind === 'rocket'));
    state.entities = [];
  }
});

test('entities scroll down and leave the screen', () => {
  const state = racingGame();
  putEntity(state, 'red', 90, 100);
  step(state, 1);
  assert.ok(state.entities[0].y > 100);
  putEntity(state, 'red', 90, WORLD_HEIGHT + 100);
  step(state, 0.01);
  assert.ok(!state.entities.some((e) => e.y >= WORLD_HEIGHT + 80));
});

test('finalScore is zero before the finish', () => {
  const state = racingGame();
  assert.equal(finalScore(state), 0);
  step(state, 5);
  assert.equal(finalScore(state), 0);
});

test('finalScore adds place points, a time bonus and pickup points', () => {
  const state = racingGame();
  state.racers[0].finished = true;
  state.racers[0].finishTime = 30;
  state.racers[0].distance = 1000;
  state.racers[1].finished = true;
  state.racers[1].finishTime = 35;
  state.racers[1].distance = 1000;
  state.time = 40;
  state.distance = 990;
  state.pickups = 2;
  step(state, 0.5);
  assert.equal(state.status, 'finished');
  assert.equal(finishPosition(state), 3);
  // 3rd place 500 + (60 - 40.5) * 10 = 195 + 2 pickups * 25 = 50
  assert.equal(finalScore(state), 745);
});

test('first place with a fast finish scores the most', () => {
  const state = racingGame();
  state.time = 30;
  state.distance = 990;
  step(state, 0.5);
  assert.equal(finishPosition(state), 1);
  // 1000 + (60 - 30.5) * 10 = 295 + 0 pickups
  assert.equal(finalScore(state), 1295);
});

test('the time bonus caps at 500 and never goes below zero', () => {
  const fast = racingGame();
  fast.time = 5;
  fast.distance = 990;
  step(fast, 0.5);
  assert.equal(finalScore(fast), 1000 + 500);

  const slow = racingGame();
  slow.time = 70;
  slow.distance = 990;
  step(slow, 0.5);
  assert.equal(finalScore(slow), 1000);
});

test('finishPosition is null until the player crosses the line', () => {
  const state = racingGame();
  assert.equal(finishPosition(state), null);
  state.distance = 990;
  step(state, 0.5);
  assert.equal(finishPosition(state), 1);
});

test('raceTime counts seconds since the green light', () => {
  const state = createGame(fixedRandom([0.5]));
  startRace(state, flatMarket());
  assert.equal(raceTime(state), 0);
  step(state, 3);
  assert.equal(raceTime(state), 0);
  step(state, 2);
  assert.equal(raceTime(state), 2);
});

test('pause and resume only work from the matching status', () => {
  const state = createGame();
  pauseGame(state);
  assert.equal(state.status, 'menu');
  resumeGame(state);
  assert.equal(state.status, 'menu');

  startRace(state, flatMarket());
  pauseGame(state);
  assert.equal(state.status, 'countdown');
  skipCountdown(state);
  pauseGame(state);
  assert.equal(state.status, 'paused');
  pauseGame(state);
  assert.equal(state.status, 'paused');
  resumeGame(state);
  assert.equal(state.status, 'playing');
  resumeGame(state);
  assert.equal(state.status, 'playing');
});

test('resetGame returns to the menu state', () => {
  const state = racingGame();
  step(state, 2);
  state.pickups = 3;
  resetGame(state);
  assert.equal(state.status, 'menu');
  assert.equal(state.time, 0);
  assert.equal(state.distance, 0);
  assert.equal(state.playerCoin, 'btc');
  assert.equal(state.pickups, 0);
  assert.deepEqual(state.racers, []);
  assert.deepEqual(state.entities, []);
});

test('a full race always finishes, even with no steering', () => {
  const state = createGame(seededRandom(21));
  startRace(state);
  let frames = 0;
  while (state.status !== 'finished' && frames < 60 * 240) {
    step(state, 1 / 60);
    frames++;
  }
  assert.equal(state.status, 'finished');
  assert.equal(state.distance, RACE_DISTANCE);
  assert.ok(raceTime(state) > 0);
  assert.ok(raceTime(state) < 240);
  assert.ok(finalScore(state) > 0);
  assert.equal(standings(state).length, 8);
});

test('playerSpeed reports the live speed with boost and stun', () => {
  const state = racingGame();
  assert.equal(playerSpeed(state), BASE_PLAYER_SPEED);
  state.player.boostUntil = 100;
  state.player.boostFactor = BOOST_ROCKET_FACTOR;
  closeTo(playerSpeed(state), BASE_PLAYER_SPEED * BOOST_ROCKET_FACTOR);
  state.player.stunUntil = 100;
  closeTo(playerSpeed(state), BASE_PLAYER_SPEED * BOOST_ROCKET_FACTOR * STUN_FACTOR);
});
