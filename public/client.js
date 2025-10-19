import "/socket.io/socket.io.js";

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const socket = io();

const joinCard = $(".join");
const gameView = $(".game");
const nameInput = $("#name");
const roomInput = $("#room");
const createBtn = $("#createBtn");
const joinBtn = $("#joinBtn");
const errorBox = $("#error");

const roomLabel = $("#roomLabel");
const playersLabel = $("#playersLabel");
const statusBox = $("#status");
const boardEl = $("#board");
const resetBtn = $("#resetBtn");

const chatList = $("#chatList");
const chatForm = $("#chatForm");
const chatInput = $("#chatInput");
const youAre = $("#youAre");

let me = { name: "", roomId: "", symbol: null };
let state = { board: Array(9).fill(null), next: "X", winner: null, players: [] };

// Bouw 9 cellen
for (let i = 0; i < 9; i++) {
  const c = document.createElement("button");
  c.className = "cell";
  c.dataset.index = i;
  boardEl.appendChild(c);
}

function render() {
  // board
  $$(".cell").forEach(cell => {
    const idx = Number(cell.dataset.index);
    cell.textContent = state.board[idx] || "";
    const canPlay = !state.winner && me.symbol === state.next && !state.board[idx];
    cell.classList.toggle("disabled", !canPlay);
  });

  // spelers
  playersLabel.textContent = state.players.map(p => `${p.name} ${p.symbol}`).join("  ");

  // status
  if (state.winner === "draw") {
    statusBox.textContent = "Gelijkspel";
    statusBox.className = "draw";
  } else if (state.winner === "X" || state.winner === "O") {
    const winName = state.players.find(p => p.symbol === state.winner)?.name || state.winner;
    statusBox.textContent = `Winst voor ${winName}`;
    statusBox.className = "win";
  } else {
    const nextName = state.players.find(p => p.symbol === state.next)?.name || state.next;
    statusBox.textContent = `Beurt voor ${nextName}`;
    statusBox.className = "";
  }

  youAre.textContent = me.symbol ? `Jij bent ${me.symbol}` : "";
}

function enterGame() {
  joinCard.classList.add("hidden");
  gameView.classList.remove("hidden");
  roomLabel.textContent = me.roomId;
  render();
}

function showError(msg) {
  errorBox.textContent = msg || "";
}

createBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  const roomId = roomInput.value.trim();
  if (!name) return showError("Vul je naam in");
  showError("");
  me.name = name;
  me.roomId = roomId;
  socket.emit("room:create", { name, roomId });
  enterGame();
});

joinBtn.addEventListener("click", () => {
  const name = nameInput.value.trim();
  const roomId = roomInput.value.trim();
  if (!name) return showError("Vul je naam in");
  if (!roomId) return showError("Vul een room code in");
  showError("");
  me.name = name;
  me.roomId = roomId;
  socket.emit("room:join", { name, roomId });
  enterGame();
});

boardEl.addEventListener("click", e => {
  const btn = e.target.closest(".cell");
  if (!btn) return;
  const idx = Number(btn.dataset.index);
  socket.emit("game:move", { index: idx });
});

resetBtn.addEventListener("click", () => {
  socket.emit("game:reset");
});

chatForm.addEventListener("submit", e => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (!msg) return;
  socket.emit("chat:msg", { name: me.name, msg });
  chatInput.value = "";
});

socket.on("room:state", payload => {
  state = payload;
  // update mijn symbool uit de playerslijst
  const mine = state.players.find(p => p.name === me.name);
  me.symbol = mine ? mine.symbol : me.symbol;
  render();
});

socket.on("chat:push", entry => {
  pushChat(entry);
});

socket.on("error:msg", msg => {
  showError(msg);
});

function pushChat({ name, msg, ts }) {
  const div = document.createElement("div");
  div.className = "chat-item";
  const time = new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  div.innerHTML = `<span class="name">${escapeHtml(name)}</span><span class="time">${time}</span><div>${escapeHtml(msg)}</div>`;
  chatList.appendChild(div);
  chatList.scrollTop = chatList.scrollHeight;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[s]));
}
