# Coin Race

Pick your coin and race it. Built for CLAY Hackathon III on Sui Network.
Eight coins line up on the track, each one running on real market data:
a coin that is up on the day gets a faster start. You steer your coin
down a 1000 m track, dodge obstacles, grab bonuses, and fight for the
podium.

## How to play

Choose one of eight coins before the race starts. Your coin's starting
speed follows its real 24h market move, fetched from CoinGecko. On the
track, steer between lanes to dodge obstacles that slow you down and
collect bonuses that speed you up. The race is 1000 m long; the first
coin across the line wins, and the top three take the podium.

Controls:

- Arrow keys or A and D to change lanes
- Drag with mouse or finger to change lanes
- P to pause, Space or Enter to start

## Run it

Node 18 or newer, no packages to install.

```
npm test        # game logic tests
npm run demo    # scripted run in the terminal
npm run web     # serve the game at http://localhost:8080
```

Open `http://localhost:8080/?autoplay` for a self-playing run. It is
handy for screenshots and recordings.

## How it is built

The game rules live in `src/game.js` with no DOM access, so the same code
runs in the browser and in the tests. `web/app.js` renders the game on a
canvas and reads keyboard and pointer input. Market data comes from the
CoinGecko public API. The best score is stored in localStorage.

Layout:

- `src/game.js`: game state, movement, spawning, collisions, scoring
- `src/demo.js`: scripted terminal run
- `web/`: canvas game, page, styles
- `test/`: game logic tests (node:test, 56 tests)
- `sui-move/`: on-chain leaderboard module (Move)
- `scripts/build-standalone.js`: builds the single-file version
- `assets/logo.png`: project logo, 1:1

## On-chain leaderboard

`sui-move/` holds a Move module with a shared leaderboard object. It keeps
the ten best runs, one entry per player, and emits an event for each new
score. Build and test it with the Sui CLI:

```
cd sui-move
sui move build
sui move test
```

Publish to testnet with `sui client publish`. The package ID goes in the
hackathon submission form.

The module was verified with Sui CLI 1.84.1: it builds clean and all four
Move tests pass. Publishing was not done from this machine because the Sui
CLI cannot reach testnet endpoints from here; publish from any machine with
normal testnet access.

## License

MIT. See LICENSE.
