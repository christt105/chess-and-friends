# chess-and-friends

Tracks precision and results for chess.com games played between christt105,
esponjaseca and Frankl65, and shows their evolution over time.

## Usage

```sh
node fetch.js       # refresh data/games.json from the chess.com public API
./deploy.sh up       # serve on the LAN at http://192.168.1.15:8099
```

Then open `index.html` directly, or the LAN URL above. Chess.com's own
accuracy is used where available (most games since ~2023); a handful of
older games have no accuracy on record and are shown without one.

## Data source

`fetch.js` reads `https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}`
for each configured username and keeps only games where both players are
in the tracked group. No API key needed, no local engine analysis —
chess.com's public API already returns per-game accuracy for free.
