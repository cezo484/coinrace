// Terminal demo: plays a scripted Coin Race with the real game logic
// and prints the result. No browser needed.

import {
  COINS,
  COUNTDOWN_SECONDS,
  coinById,
  createGame,
  finalScore,
  finishPosition,
  laneCenter,
  playerPosition,
  raceTime,
  selectCoin,
  startRace,
  standings,
  step,
} from './game.js';

function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

// Simple driver: dodge a hazard in the current lane, chase a nearby
// reward, otherwise drift back toward the second lane.
function driveTarget(state) {
  const player = state.player;
  const ahead = state.entities.filter(
    (entity) => !entity.passed && entity.y < player.y && entity.y > player.y - 320,
  );
  const hazards = ahead.filter((entity) => entity.kind === 'red' || entity.kind === 'fud');
  if (hazards.some((entity) => entity.lane === player.lane)) {
    const options = [player.lane - 1, player.lane + 1].filter((lane) => lane >= 0 && lane < 4);
    const safe = options.find((lane) => !hazards.some((entity) => entity.lane === lane));
    if (safe !== undefined) return laneCenter(safe);
    return player.x;
  }
  const rewards = ahead.filter((entity) => entity.kind === 'green' || entity.kind === 'rocket');
  if (rewards.length > 0) {
    rewards.sort((a, b) => b.y - a.y);
    return rewards[0].x;
  }
  return laneCenter(1);
}

const state = createGame(seededRandom(42));
selectCoin(state, 'sol');
startRace(state);

console.log('Coin Race demo run');
console.log('  you race as ' + coinById(state.playerCoin).name + ' (' + state.playerCoin.toUpperCase() + ')');
console.log('  market (24h change):');
for (const coin of COINS) {
  const change = state.market[coin.id];
  const sign = change >= 0 ? '+' : '';
  console.log('    ' + coin.symbol.padEnd(5) + sign + change.toFixed(1) + '%');
}

const counts = { boost: 0, rocket: 0, hit: 0, surge: 0, overtake: 0, passed: 0 };
let frames = 0;
let lastShown = -1;
let lastCount = COUNTDOWN_SECONDS + 1;
while (state.status !== 'finished' && frames < 60 * 300) {
  const input = state.status === 'playing' ? { moveX: driveTarget(state) } : {};
  step(state, 1 / 60, input);
  frames++;
  if (state.status === 'countdown') {
    const whole = Math.ceil(state.countdown);
    if (whole !== lastCount) {
      lastCount = whole;
      console.log('  ' + whole + '...');
    }
  }
  for (const event of state.events) {
    if (counts[event.type] !== undefined) counts[event.type] += 1;
    if (event.type === 'go') console.log('  GO!');
  }
  const shown = Math.floor(raceTime(state) / 5);
  if (state.status === 'playing' && raceTime(state) > 0 && shown !== lastShown) {
    lastShown = shown;
    console.log(
      '  ' + raceTime(state).toFixed(0) + 's  ' +
      Math.floor(state.distance) + ' m  #' + playerPosition(state) +
      '  ' + Math.round(state.speed) + ' px/s' +
      '  pickups ' + state.pickups + '  hits ' + state.hits,
    );
  }
}

if (state.status !== 'finished') {
  console.log('  race did not finish in time');
  process.exit(1);
}

console.log('  finished in ' + raceTime(state).toFixed(1) + 's, position #' + finishPosition(state));
console.log('  standings:');
for (const entry of standings(state)) {
  const coin = coinById(entry.coinId);
  const mark = entry.isPlayer ? ' (you)' : '';
  const time = entry.finished
    ? entry.finishTime.toFixed(1) + 's'
    : Math.floor(entry.distance) + ' m';
  console.log('    ' + entry.position + '. ' + coin.symbol.padEnd(5) + time + mark);
}
const place = [1000, 700, 500, 350, 250, 150, 100, 50][finishPosition(state) - 1];
const timeBonus = Math.min(
  500,
  Math.max(0, Math.round((60 - state.player.finishTime) * 10)),
);
console.log(
  '  score: ' + finalScore(state) +
  ' (place ' + place + ' + time ' + timeBonus +
  ' + pickups ' + state.pickups * 25 + ')',
);
console.log(
  '  events: ' + counts.boost + ' boosts, ' + counts.rocket + ' rockets, ' +
  counts.hit + ' hits, ' + counts.surge + ' surges, ' +
  counts.overtake + ' overtakes, ' + counts.passed + ' passed',
);
