const OWNER_COLOR = "#d9ae4e";
const PALETTE = [
  "#5dade2", "#58d68d", "#e67e22", "#af7ac5", "#ec7063",
  "#48c9b0", "#f5b041", "#5499c7", "#82e0aa", "#d2b4de",
];

let colorMap = {};

function buildColorMap(owner, players) {
  const map = {};
  let i = 0;
  for (const p of players) {
    if (p.toLowerCase() === owner.toLowerCase()) {
      map[p.toLowerCase()] = OWNER_COLOR;
    } else {
      map[p.toLowerCase()] = PALETTE[i % PALETTE.length];
      i++;
    }
  }
  return map;
}

function colorFor(username) {
  return colorMap[username.toLowerCase()] || "#aaaaaa";
}

function outcomeFor(game, username) {
  const isWhite = game.white.toLowerCase() === username.toLowerCase();
  if (game.result === "1/2-1/2") return "draw";
  if (game.result === "1-0") return isWhite ? "win" : "loss";
  if (game.result === "0-1") return isWhite ? "loss" : "win";
  return null; // unfinished/aborted/unknown
}

function playersIn(games) {
  const names = new Set();
  for (const g of games) {
    names.add(g.white);
    names.add(g.black);
  }
  return [...names].sort();
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function filterByDate(games, from, to) {
  // `to` is inclusive of the whole day.
  const toEnd = new Date(to.getTime());
  toEnd.setHours(23, 59, 59, 999);
  return games.filter((g) => {
    const d = new Date(g.date);
    return d >= from && d <= toEnd;
  });
}

let chart = null;
let currentView = "individual";
let owner = null;
let allPlayers = [];

async function main() {
  const status = document.getElementById("status");
  let allGames;
  try {
    allGames = await (await fetch("data/games.json")).json();
  } catch (err) {
    status.textContent = "No se pudo cargar data/games.json: " + err;
    return;
  }

  let config = {};
  try {
    config = await (await fetch("config.json")).json();
  } catch (err) {
    console.warn("No se pudo cargar config.json:", err);
  }

  allPlayers = playersIn(allGames);
  owner =
    (config.owner && allPlayers.find((p) => p.toLowerCase() === config.owner.toLowerCase())) ||
    allPlayers[0];
  colorMap = buildColorMap(owner, allPlayers);

  const fromInput = document.getElementById("fromDate");
  const toInput = document.getElementById("toDate");
  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  fromInput.value = toDateInputValue(oneYearAgo);
  toInput.value = toDateInputValue(today);

  function renderAll() {
    const from = new Date(fromInput.value);
    const to = new Date(toInput.value);
    const games = filterByDate(allGames, from, to);
    status.textContent = `${games.length} de ${allGames.length} partidas en el rango seleccionado.`;

    const h2hCard = document.getElementById("h2hCard");
    if (currentView === "individual") {
      renderAccuracyChart(games, [owner]);
      renderStatCards(games, [owner]);
      h2hCard.style.display = "none";
    } else {
      renderAccuracyChart(games, allPlayers);
      renderStatCards(games, allPlayers);
      h2hCard.style.display = "";
      renderHeadToHead(games, allPlayers, owner);
    }
  }

  for (const btn of document.querySelectorAll(".view-btn")) {
    btn.addEventListener("click", () => {
      currentView = btn.dataset.view;
      for (const b of document.querySelectorAll(".view-btn")) b.classList.toggle("active", b === btn);
      renderAll();
    });
  }

  fromInput.addEventListener("change", renderAll);
  toInput.addEventListener("change", renderAll);
  renderAll();
}

function renderAccuracyChart(games, players) {
  const datasets = players.map((p) => {
    const points = games
      .map((g) => {
        const acc = g.white.toLowerCase() === p.toLowerCase() ? g.whiteAccuracy : g.black.toLowerCase() === p.toLowerCase() ? g.blackAccuracy : undefined;
        return acc == null ? null : { x: g.date, y: acc };
      })
      .filter((pt) => pt !== null && pt !== undefined);
    return {
      label: p,
      data: points,
      borderColor: colorFor(p),
      backgroundColor: colorFor(p),
      tension: 0.2,
      spanGaps: true,
    };
  });

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("accuracyChart"), {
    type: "line",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: "time",
          ticks: { color: "#aaa", maxRotation: 45, autoSkipPadding: 12 },
        },
        y: { min: 0, max: 100, ticks: { color: "#aaa" } },
      },
      plugins: { legend: { labels: { color: "#e8e8e8", boxWidth: 12 } } },
    },
  });
}

function renderStatCards(games, players) {
  const container = document.getElementById("statCards");
  container.innerHTML = "";
  for (const p of players) {
    const tally = { win: 0, draw: 0, loss: 0 };
    const accs = [];
    for (const g of games) {
      if (g.white.toLowerCase() !== p.toLowerCase() && g.black.toLowerCase() !== p.toLowerCase()) continue;
      const outcome = outcomeFor(g, p);
      if (outcome) tally[outcome]++;
      const acc = g.white.toLowerCase() === p.toLowerCase() ? g.whiteAccuracy : g.blackAccuracy;
      if (acc != null) accs.push(acc);
    }
    const avgAcc = accs.length ? (accs.reduce((a, b) => a + b, 0) / accs.length).toFixed(1) : "-";

    const card = document.createElement("div");
    card.className = "stat-card";
    card.innerHTML = `
      <h2 style="color:${colorFor(p)}">${p}</h2>
      <table>
        <tr><td>Victorias</td><td>${tally.win}</td></tr>
        <tr><td>Tablas</td><td>${tally.draw}</td></tr>
        <tr><td>Derrotas</td><td>${tally.loss}</td></tr>
        <tr><td>Precisión media</td><td>${avgAcc}</td></tr>
      </table>
    `;
    container.appendChild(card);
  }
}

function renderHeadToHead(games, players, anchor) {
  const table = document.getElementById("h2hTable");
  const others = players.filter((p) => p.toLowerCase() !== anchor.toLowerCase());
  const rows = others.map((friend) => {
    const a = anchor;
    const b = friend;
    const tally = { [a]: 0, [b]: 0, draw: 0 };
    let total = 0;
    for (const g of games) {
      const inGame = [g.white.toLowerCase(), g.black.toLowerCase()];
      if (!inGame.includes(a.toLowerCase()) || !inGame.includes(b.toLowerCase())) continue;
      total++;
      const outcomeA = outcomeFor(g, a);
      if (outcomeA === "win") tally[a]++;
      else if (outcomeA === "loss") tally[b]++;
      else if (outcomeA === "draw") tally.draw++;
    }
    return { a, b, tally, total };
  });

  table.innerHTML = `
    <tr><th>Enfrentamiento</th><th>Partidas</th><th>Victorias tú</th><th>Tablas</th><th>Victorias amigo</th></tr>
    ${rows
      .map(
        (r) => `
      <tr>
        <td>${r.a} vs ${r.b}</td>
        <td>${r.total}</td>
        <td>${r.tally[r.a]}</td>
        <td>${r.tally.draw}</td>
        <td>${r.tally[r.b]}</td>
      </tr>`
      )
      .join("")}
  `;
}

main();
