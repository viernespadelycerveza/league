"use strict";
let leagueData = null;
let allPairs = [];
let enabledPairKeys = new Set();
let pairRanking = [];
let playerRanking = [];
const STORAGE_KEY = "padel-enabled-pairs-v31";

document.addEventListener("DOMContentLoaded", () => { configureMenu(); loadLeagueData(); });

function configureMenu() {
  const button = document.getElementById("menuButton");
  const menu = document.getElementById("mainMenu");
  button.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    button.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("menu-open", open);
  });
  menu.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
    menu.classList.remove("open");
    button.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
  }));
}

async function loadLeagueData() {
  try {
    const response = await fetch("data.json", { cache: "no-store" });
    if (!response.ok) throw new Error("No se pudo cargar data.json");
    leagueData = await response.json();
    validateData();
    allPairs = calculateAllPairStats();
    restoreEnabledPairs();
    renderFilters();
    renderPairSelector();
    recalculateAndRender();
    renderMatches();
    renderLatestMatch();
    renderPlayers();
  } catch (error) {
    console.error(error);
    document.body.innerHTML = `<main style="padding:40px;font-family:Arial"><h1>Error cargando la liga</h1><p>${escapeHtml(error.message)}</p><p>Tu data.json no ha sido modificado. Comprueba su sintaxis y abre la web mediante un servidor local.</p></main>`;
  }
}

function validateData() {
  if (!Array.isArray(leagueData.players) || !Array.isArray(leagueData.matches)) throw new Error("data.json debe contener players y matches");
  leagueData.settings = leagueData.settings || { pointsForWin: 3, pointsForLoss: 1 };
  leagueData.matches.forEach(match => {
    if (!Array.isArray(match.teamA) || match.teamA.length !== 2 || !Array.isArray(match.teamB) || match.teamB.length !== 2) throw new Error(`El partido ${match.id} debe tener dos jugadores por pareja`);
    if (!["A", "B"].includes(match.winner)) throw new Error(`El winner del partido ${match.id} debe ser A o B`);
  });
}

const getPlayer = id => leagueData.players.find(player => player.id === id);
const getPlayerName = id => getPlayer(id)?.name || id;
const getPlayerPhoto = id => getPlayer(id)?.photo || "images/placeholder.svg";
const normalisePair = ids => ids.slice().sort();
const getPairKey = ids => normalisePair(ids).join("__");
const getPairName = ids => normalisePair(ids).map(getPlayerName).join(" / ");

function pairAvatars(ids, large = false) {
  return `<div class="pair-avatars ${large ? "pair-avatars-large" : ""}">${normalisePair(ids).map(id => `<img class="pair-avatar" src="${escapeHtml(getPlayerPhoto(id))}" alt="Foto de ${escapeHtml(getPlayerName(id))}" onerror="this.src='images/placeholder.svg'">`).join("")}</div>`;
}

function matchScore(match) {
  return match.sets.reduce((score, set) => {
    score.gamesA += Number(set[0]); score.gamesB += Number(set[1]);
    if (set[0] > set[1]) score.setsA += 1; else if (set[1] > set[0]) score.setsB += 1;
    return score;
  }, { setsA: 0, setsB: 0, gamesA: 0, gamesB: 0 });
}
const formatSets = sets => sets.map(set => `${set[0]}-${set[1]}`).join(" · ");
const formatDate = value => new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
const winRate = item => item?.played ? Math.round(item.wins / item.played * 100) : 0;
const totalSets = () => leagueData.matches.reduce((total, match) => total + match.sets.length, 0);

function calculateAllPairStats() {
  const pairs = {};
  leagueData.matches.forEach(match => {
    const score = matchScore(match);
    updatePair(pairs, match.teamA, match.winner === "A", score.setsA, score.setsB, score.gamesA, score.gamesB);
    updatePair(pairs, match.teamB, match.winner === "B", score.setsB, score.setsA, score.gamesB, score.gamesA);
  });
  return Object.values(pairs).sort(compareStats);
}

function updatePair(pairs, ids, won, setsFor, setsAgainst, gamesFor, gamesAgainst) {
  const sorted = normalisePair(ids);
  const key = getPairKey(sorted);
  if (!pairs[key]) pairs[key] = { key, playerIds: sorted, name: getPairName(sorted), played: 0, wins: 0, losses: 0, points: 0, setsFor: 0, setsAgainst: 0, gamesFor: 0, gamesAgainst: 0 };
  const pair = pairs[key];
  pair.played += 1; pair.setsFor += setsFor; pair.setsAgainst += setsAgainst; pair.gamesFor += gamesFor; pair.gamesAgainst += gamesAgainst;
  if (won) { pair.wins += 1; pair.points += Number(leagueData.settings.pointsForWin); }
  else { pair.losses += 1; pair.points += Number(leagueData.settings.pointsForLoss); }
}

function compareStats(a, b) {
  return b.points - a.points || b.wins - a.wins || (b.setsFor - b.setsAgainst) - (a.setsFor - a.setsAgainst) || (b.gamesFor - b.gamesAgainst) - (a.gamesFor - a.gamesAgainst) || a.name.localeCompare(b.name, "es");
}

function restoreEnabledPairs() {
  const allKeys = new Set(allPairs.map(pair => pair.key));
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) {
      enabledPairKeys = new Set(saved.filter(key => allKeys.has(key)));
      return;
    }
  } catch (error) { console.warn("No se pudo restaurar la selección", error); }
  enabledPairKeys = new Set(allKeys);
}

function saveEnabledPairs() { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(enabledPairKeys))); }

function renderPairSelector() {
  const container = document.getElementById("pairSelector");
  container.innerHTML = allPairs.map(pair => `
    <label class="pair-option ${enabledPairKeys.has(pair.key) ? "enabled" : ""}">
      <input type="checkbox" value="${escapeHtml(pair.key)}" ${enabledPairKeys.has(pair.key) ? "checked" : ""}>
      ${pairAvatars(pair.playerIds)}
      <span class="pair-option-text"><strong>${escapeHtml(pair.name)}</strong><small>${pair.played} PJ · ${pair.points} puntos históricos</small></span>
    </label>`).join("");
  container.querySelectorAll("input").forEach(input => input.addEventListener("change", event => {
    event.target.checked ? enabledPairKeys.add(event.target.value) : enabledPairKeys.delete(event.target.value);
    event.target.closest(".pair-option").classList.toggle("enabled", event.target.checked);
    saveEnabledPairs();
    recalculateAndRender();
  }));
  document.getElementById("enableAllPairs").onclick = () => { enabledPairKeys = new Set(allPairs.map(pair => pair.key)); saveEnabledPairs(); renderPairSelector(); recalculateAndRender(); };
  document.getElementById("disableAllPairs").onclick = () => { enabledPairKeys.clear(); saveEnabledPairs(); renderPairSelector(); recalculateAndRender(); };
  updateSelectionSummary();
}

function updateSelectionSummary() {
  document.getElementById("pairSelectionSummary").textContent = `${enabledPairKeys.size} de ${allPairs.length} parejas habilitadas`;
}

function recalculateAndRender() {
  pairRanking =
    calculatePairRankingFromEnabledPairs();

  playerRanking =
    calculatePlayerRankingFromEnabledPairs();

  updateSelectionSummary();

  renderHeader();
  renderDashboard();
  renderPairPodium();
  renderPairRanking();
  renderPlayerRanking();
  renderPairCards();
  renderCharts();
}
function calculatePairRankingFromEnabledPairs() {
  const filteredPairs = {};

  leagueData.matches.forEach(function (match) {
    const teamAKey =
      getPairKey(match.teamA);

    const teamBKey =
      getPairKey(match.teamB);

    const teamAEnabled =
      enabledPairKeys.has(teamAKey);

    const teamBEnabled =
      enabledPairKeys.has(teamBKey);

    /*
      Un partido sólo cuenta en el ranking por parejas
      cuando las dos parejas están habilitadas.

      Si cualquiera de las dos está desactivada,
      se excluye el partido completo del ranking.
    */
    if (!teamAEnabled || !teamBEnabled) {
      return;
    }

    const score =
      matchScore(match);

    updatePair(
      filteredPairs,
      match.teamA,
      match.winner === "A",
      score.setsA,
      score.setsB,
      score.gamesA,
      score.gamesB
    );

    updatePair(
      filteredPairs,
      match.teamB,
      match.winner === "B",
      score.setsB,
      score.setsA,
      score.gamesB,
      score.gamesA
    );
  });

  /*
    Una pareja habilitada puede quedarse sin partidos
    válidos si todos sus rivales están desactivados.

    En ese caso seguirá apareciendo, pero con sus
    estadísticas a cero.
  */
  enabledPairKeys.forEach(function (pairKey) {
    if (filteredPairs[pairKey]) {
      return;
    }

    const historicalPair =
      allPairs.find(function (pair) {
        return pair.key === pairKey;
      });

    if (!historicalPair) {
      return;
    }

    filteredPairs[pairKey] = {
      key: historicalPair.key,

      playerIds:
        historicalPair.playerIds.slice(),

      name: historicalPair.name,

      played: 0,
      wins: 0,
      losses: 0,
      points: 0,

      setsFor: 0,
      setsAgainst: 0,

      gamesFor: 0,
      gamesAgainst: 0
    };
  });

  return Object
    .values(filteredPairs)
    .sort(compareStats);
}
function calculatePlayerRankingFromEnabledPairs() {
  const players = Object.fromEntries(leagueData.players.map(player => [player.id, { ...player, played: 0, wins: 0, losses: 0, points: 0, setsFor: 0, setsAgainst: 0, gamesFor: 0, gamesAgainst: 0 }]));
  leagueData.matches.forEach(match => {
    const score = matchScore(match);
    applyEnabledPairToPlayers(players, match.teamA, match.winner === "A", score.setsA, score.setsB, score.gamesA, score.gamesB);
    applyEnabledPairToPlayers(players, match.teamB, match.winner === "B", score.setsB, score.setsA, score.gamesB, score.gamesA);
  });
  return Object.values(players).sort(compareStats);
}

function applyEnabledPairToPlayers(players, ids, won, setsFor, setsAgainst, gamesFor, gamesAgainst) {
  if (!enabledPairKeys.has(getPairKey(ids))) return;
  ids.forEach(id => {
    const item = players[id]; if (!item) return;
    item.played += 1; item.setsFor += setsFor; item.setsAgainst += setsAgainst; item.gamesFor += gamesFor; item.gamesAgainst += gamesAgainst;
    if (won) { item.wins += 1; item.points += Number(leagueData.settings.pointsForWin); }
    else { item.losses += 1; item.points += Number(leagueData.settings.pointsForLoss); }
  });
}

function renderHeader() {
  const leader = pairRanking[0];
  document.getElementById("seasonTitle").textContent = leagueData.season || "Resumen";
  const avatars = document.getElementById("heroLeaderAvatars");
  if (!leader) { avatars.innerHTML = ""; document.getElementById("heroLeader").textContent = "Sin parejas habilitadas"; document.getElementById("heroLeaderInfo").textContent = "Selecciona al menos una pareja"; return; }
  avatars.innerHTML = normalisePair(leader.playerIds).map(id => `<img class="pair-avatar" src="${escapeHtml(getPlayerPhoto(id))}" alt="Foto de ${escapeHtml(getPlayerName(id))}" onerror="this.src='images/placeholder.svg'">`).join("");
  document.getElementById("heroLeader").textContent = leader.name;
  document.getElementById("heroLeaderInfo").textContent = `${leader.points} puntos · ${leader.wins} victorias · ${winRate(leader)}% win rate`;
}

function renderDashboard() {
  const leader = pairRanking[0];
  const data = [["Partidos", leagueData.matches.length, "Histórico completo"], ["Parejas activas", enabledPairKeys.size, `De ${allPairs.length} totales`], ["Jugadores", leagueData.players.length, "Perfiles informativos"], ["Sets", totalSets(), "Histórico completo"], ["Pareja líder", leader?.name || "-", leader ? `${leader.points} puntos` : "Sin selección"], ["Ranking individual", playerRanking.filter(player => player.played > 0).length, "Jugadores con resultados válidos"], ["Victoria", leagueData.settings.pointsForWin, "Puntos por componente"], ["Derrota", leagueData.settings.pointsForLoss, "Puntos por componente"]];
  document.getElementById("kpiGrid").innerHTML = data.map(item => `<article class="kpi-card"><span class="kpi-label">${escapeHtml(item[0])}</span><strong class="kpi-value">${escapeHtml(item[1])}</strong><span class="kpi-description">${escapeHtml(item[2])}</span></article>`).join("");
}

function renderFilters() {
  const dateFilter = document.getElementById("dateFilter");
  const playerFilter = document.getElementById("playerFilter");
  const dates = [...new Set(leagueData.matches.map(match => match.date))].sort().reverse();
  dateFilter.innerHTML = '<option value="all">Todas</option>' + dates.map(date => `<option value="${date}">${formatDate(date)}</option>`).join("");
  playerFilter.innerHTML = '<option value="all">Todos</option>' + leagueData.players.map(player => `<option value="${escapeHtml(player.id)}">${escapeHtml(player.name)}</option>`).join("");
  [dateFilter, playerFilter].forEach(element => element.addEventListener("change", renderMatches));
  document.getElementById("textFilter").addEventListener("input", renderMatches);
  document.getElementById("clearFilters").onclick = () => { dateFilter.value = "all"; playerFilter.value = "all"; document.getElementById("textFilter").value = ""; renderMatches(); };
}

function renderMatches() {
  const date = document.getElementById("dateFilter").value;
  const player = document.getElementById("playerFilter").value;
  const text = document.getElementById("textFilter").value.trim().toLowerCase();
  const matches = leagueData.matches.filter(match => (date === "all" || match.date === date) && (player === "all" || match.teamA.includes(player) || match.teamB.includes(player)) && (!text || [match.title, match.court, getPairName(match.teamA), getPairName(match.teamB)].join(" ").toLowerCase().includes(text))).sort((a, b) => b.date.localeCompare(a.date));
  document.getElementById("matchesContainer").innerHTML = matches.length ? matches.map(createMatchCard).join("") : '<div class="empty-state">No hay partidos con esos filtros.</div>';
}

function createMatchCard(match) {
  const score = matchScore(match);
  return `<article class="match-card"><div class="match-header"><div><span class="match-date">${formatDate(match.date)}</span><h3 class="match-title">${escapeHtml(match.title)}</h3></div><span class="match-court">${escapeHtml(match.court)}</span></div><div class="match-teams"><div class="match-team ${match.winner === "A" ? "winner" : ""}"><span class="match-team-name">${escapeHtml(getPairName(match.teamA))}</span><span class="match-team-sets">${score.setsA}</span></div><div class="match-team ${match.winner === "B" ? "winner" : ""}"><span class="match-team-name">${escapeHtml(getPairName(match.teamB))}</span><span class="match-team-sets">${score.setsB}</span></div></div><div class="match-score">Sets: ${escapeHtml(formatSets(match.sets))}</div></article>`;
}

function renderLatestMatch() {
  const match = leagueData.matches.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!match) return;
  const score = matchScore(match);
  document.getElementById("lastMatchPanel").innerHTML = `<h3 class="latest-title">${escapeHtml(match.title)}</h3><div class="latest-team"><span>${escapeHtml(getPairName(match.teamA))}</span><strong>${score.setsA}</strong></div><div class="latest-team"><span>${escapeHtml(getPairName(match.teamB))}</span><strong>${score.setsB}</strong></div><p class="latest-score">${formatDate(match.date)}<br>${escapeHtml(formatSets(match.sets))}</p>`;
}

function renderPairPodium() {
  const medals = ["🥇", "🥈", "🥉"];
  document.getElementById("podium").innerHTML = pairRanking.slice(0, 3).map((pair, index) => `<article class="podium-card position-${index + 1}"><div class="podium-medal">${medals[index]}</div>${pairAvatars(pair.playerIds).replace('class="pair-avatars "', 'class="pair-avatars center"')}<h3 class="podium-pair">${escapeHtml(pair.name)}</h3><div class="podium-points">${pair.points} pts</div><p class="podium-detail">${pair.wins} victorias · ${winRate(pair)}% win rate</p></article>`).join("");
}

function positionText(index) { return index < 3 ? ["🥇 1", "🥈 2", "🥉 3"][index] : String(index + 1); }
function renderPairRanking() {
  document.getElementById("pairRankingBody").innerHTML = pairRanking.length ? pairRanking.map((pair, index) => `<tr><td>${positionText(index)}</td><td><div class="ranking-pair-cell">${pairAvatars(pair.playerIds)}<strong>${escapeHtml(pair.name)}</strong></div></td><td class="ranking-points">${pair.points}</td><td>${pair.played}</td><td>${pair.wins}</td><td>${pair.losses}</td><td>${pair.setsFor}-${pair.setsAgainst}</td><td>${pair.gamesFor}-${pair.gamesAgainst}</td><td>${winRate(pair)}%</td></tr>`).join("") : '<tr><td colspan="9">No hay parejas habilitadas.</td></tr>';
}

function renderPlayerRanking() {
  const ranked = playerRanking.filter(player => player.played > 0);
  document.getElementById("playerRankingBody").innerHTML = ranked.length ? ranked.map((player, index) => `<tr><td>${positionText(index)}</td><td><div class="player-ranking-cell"><img src="${escapeHtml(player.photo || "images/placeholder.svg")}" alt="Foto de ${escapeHtml(player.name)}" onerror="this.src='images/placeholder.svg'"><strong>${escapeHtml(player.name)}</strong></div></td><td class="light-points">${player.points}</td><td>${player.played}</td><td>${player.wins}</td><td>${player.losses}</td><td>${player.setsFor}-${player.setsAgainst}</td><td>${player.gamesFor}-${player.gamesAgainst}</td><td>${winRate(player)}%</td></tr>`).join("") : '<tr><td colspan="9">No hay resultados individuales con la selección actual.</td></tr>';
}

function renderPairCards() {
  document.getElementById("pairsContainer").innerHTML = pairRanking.length ? pairRanking.map((pair, index) => `<article class="pair-card ${index === 0 ? "leader" : ""}"><div class="pair-card-top"><div class="pair-title-wrap">${pairAvatars(pair.playerIds)}<h3>${escapeHtml(pair.name)}</h3></div><span class="pair-rank">${index + 1}</span></div><div class="pair-stats">${stat(pair.points, "Pts")}${stat(pair.played, "PJ")}${stat(pair.wins, "V")}${stat(winRate(pair) + "%", "Win")}</div></article>`).join("") : '<div class="empty-state">Selecciona alguna pareja.</div>';
}
function stat(value, label) { return `<div class="pair-stat"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`; }

function renderPlayers() {
  document.getElementById("playersContainer").innerHTML = leagueData.players.map(player => `<article class="player-card"><img class="player-photo" src="${escapeHtml(player.photo)}" alt="Foto de ${escapeHtml(player.name)}" loading="lazy" onerror="this.src='images/placeholder.svg'"><div class="player-details"><h3>${escapeHtml(player.name)}</h3><div class="player-role">${escapeHtml(player.role || "Jugador")}</div><p class="player-description">${escapeHtml(player.description || "")}</p></div></article>`).join("");
}

function renderCharts() {
  const topPairs = pairRanking.slice(0, 8);
  const pairMax = topPairs[0]?.points || 0;
  document.getElementById("pointsChart").innerHTML = topPairs.map(pair => bar(pair.name, `${pair.points} pts`, pairMax ? pair.points / pairMax * 100 : 0)).join("") || '<div class="empty-state">Sin parejas habilitadas.</div>';
  const topPlayers = playerRanking.filter(player => player.played > 0).slice(0, 8);
  const playerMax = topPlayers[0]?.points || 0;
  document.getElementById("playerPointsChart").innerHTML = topPlayers.map(player => bar(player.name, `${player.points} pts`, playerMax ? player.points / playerMax * 100 : 0)).join("") || '<div class="empty-state">Sin resultados individuales.</div>';
}
function bar(label, value, width) { return `<div><div class="bar-header"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, width))}%"></div></div></div>`; }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
