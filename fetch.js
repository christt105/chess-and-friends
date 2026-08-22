#!/usr/bin/env node
// Fetches chess.com games between the configured players and writes
// data/games.json. Uses only the built-in fetch, no npm dependencies.

const fs = await import("node:fs/promises");

async function getJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "chess-and-friends-tracker (personal use)" },
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

function resultFromPgn(pgn) {
  const m = pgn.match(/\[Result "([^"]+)"\]/);
  return m ? m[1] : "*";
}

async function fetchSiblingGames(username) {
  const { archives } = await getJson(
    `https://api.chess.com/pub/player/${username}/games/archives`
  );
  const games = [];
  for (const url of archives) {
    const { games: monthGames } = await getJson(url);
    games.push(...monthGames);
  }
  return games;
}

async function main() {
  const config = JSON.parse(await fs.readFile("config.json", "utf8"));
  const { owner, mode, friends = [] } = config;
  const usernames = mode === "whitelist" ? [owner, ...friends] : [owner];
  const allowedSet = new Set(usernames.map((u) => u.toLowerCase()));
  const ownerLower = owner.toLowerCase();

  const seen = new Map();
  for (const username of usernames) {
    const games = await fetchSiblingGames(username);
    for (const g of games) {
      const white = g.white.username.toLowerCase();
      const black = g.black.username.toLowerCase();
      if (mode === "whitelist") {
        if (!allowedSet.has(white) || !allowedSet.has(black)) continue;
      } else {
        if (white !== ownerLower && black !== ownerLower) continue;
      }
      seen.set(g.url, g);
    }
  }

  const games = [...seen.values()]
    .map((g) => ({
      id: g.uuid,
      url: g.url,
      date: new Date(g.end_time * 1000).toISOString(),
      white: g.white.username,
      black: g.black.username,
      whiteAccuracy: g.accuracies ? g.accuracies.white : null,
      blackAccuracy: g.accuracies ? g.accuracies.black : null,
      result: resultFromPgn(g.pgn),
      whiteResult: g.white.result,
      blackResult: g.black.result,
      timeClass: g.time_class,
      eco: g.eco ? g.eco.split("/").pop() : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  await fs.writeFile("data/games.json", JSON.stringify(games, null, 2));
  console.log(`Wrote ${games.length} games to data/games.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
