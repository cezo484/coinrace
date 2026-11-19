# Demo video outline

Target length: 3 to 4 minutes. Record the game in the browser at
http://localhost:8080 (run `npm run web` first). Capture the screen and
narrate over it. Keep the narration short and plain.

## 0:00 - 0:30 Opening

Show the coin selection screen. Say what the game is in one sentence:
eight coins race down a 1000 m track, built for CLAY Hackathon III on
Sui. Mention the twist: each coin's starting speed comes from real
market data, so a coin that is up on the day gets a faster start.

## 0:30 - 2:00 Gameplay

Pick a coin and start the race. Change lanes with the arrow keys to
dodge an obstacle, then grab a bonus and point out the speed boost. Show
the live standings changing as coins pass each other. Finish the race
and show the podium with the top three coins and the final times.

## 2:00 - 2:50 How it works

Show the code briefly: `src/game.js` holds the rules, `web/app.js`
renders the canvas. Mention the market data (CoinGecko public API),
the tests (`npm test`) and the terminal demo (`npm run demo`). If time
allows, show the tuning: lane changes, obstacle and bonus spawn rates,
and how the 24h move feeds into starting speed.

## 2:50 - 3:30 On-chain leaderboard

Show `sui-move/sources/leaderboard.move`. Explain in one sentence: a
shared object keeps the ten best runs, one entry per player. If the
package is published, show the package ID and a testnet explorer link.

## 3:30 - 3:45 Close

One line: the game is free to play, the repo is public, and the
leaderboard lives on Sui testnet.

## Recording notes

- Record at 1080p if possible, game area only.
- The `?autoplay` address runs the game by itself, which helps when
  recording hands-free gameplay.
- Keep background music off or very low so the narration stays clear.
- Upload to YouTube as unlisted or public and paste the link in the
  submission form.
