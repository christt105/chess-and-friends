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

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function readCache(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return null;
  }
}

const cacheStats = { hits: 0, fetches: 0 };

function isRelevant(g, allowedSet, mode, ownerLower) {
  const white = g.white.username.toLowerCase();
  const black = g.black.username.toLowerCase();
  if (mode === "whitelist") return allowedSet.has(white) && allowedSet.has(black);
  return white === ownerLower || black === ownerLower;
}

// Only relevant games (per `mode`/`friends`) are cached, never a player's
// full history, so a friend's unrelated games never get committed to the repo.
async function fetchSiblingGames(username, allowedSet, mode, ownerLower) {
  const { archives } = await getJson(
    `https://api.chess.com/pub/player/${username}/games/archives`
  );
  const nowKey = currentMonthKey();
  const games = [];
  for (const url of archives) {
    const m = url.match(/\/(\d{4})\/(\d{2})$/);
    const monthKey = m ? `${m[1]}-${m[2]}` : null;
    const isClosedMonth = monthKey !== null && monthKey !== nowKey;
    const cachePath = `data/cache/${username}/${monthKey}.json`;

    let monthGames = isClosedMonth ? await readCache(cachePath) : null;
    if (monthGames) {
      cacheStats.hits++;
    } else {
      const data = await getJson(url);
      monthGames = data.games.filter((g) => isRelevant(g, allowedSet, mode, ownerLower));
      cacheStats.fetches++;
      if (isClosedMonth) {
        await fs.mkdir(`data/cache/${username}`, { recursive: true });
        await fs.writeFile(cachePath, JSON.stringify(monthGames, null, 2));
      }
    }
    games.push(...monthGames);
  }
  return games;
}

async function main() {
  const config = JSON.parse(await fs.readFile("config.json", "utf8"));
  const { owner, mode, friends = [], hiddenGameIds = [] } = config;
  const usernames = mode === "whitelist" ? [owner, ...friends] : [owner];
  const allowedSet = new Set(usernames.map((u) => u.toLowerCase()));
  const ownerLower = owner.toLowerCase();
  const hiddenSet = new Set(hiddenGameIds.map((id) => id.toLowerCase()));

  const seen = new Map();
  for (const username of usernames) {
    const games = await fetchSiblingGames(username, allowedSet, mode, ownerLower);
    for (const g of games) seen.set(g.url, g);
  }

  const games = [...seen.values()]
    .filter((g) => !hiddenSet.has(g.uuid.toLowerCase()))
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
  console.log(`Months from cache: ${cacheStats.hits}, fetched over network: ${cacheStats.fetches}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
