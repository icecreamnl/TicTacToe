import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import { Server } from "socket.io";
import helmet from "helmet";
import compression from "compression";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "script-src": ["'self'"],
      "img-src": ["'self' data:"],
      "connect-src": ["'self'"],
      "style-src": ["'self' 'unsafe-inline'"]
    }
  },
  crossOriginOpenerPolicy: { policy: "same-origin" }
}));
app.use(compression());
app.use(express.static("public", { etag: true, lastModified: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: false },
  connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 }
});

const PORT = process.env.PORT || 3000;

const rooms = Object.create(null);

function cleanName(name) {
  return String(name || "")
    .trim()
    .slice(0, 24)
    .replace(/[<>]/g, "");
}

function validRoomId(id) {
  return /^[a-zA-Z0-9_-]{3,20}$/.test(String(id || ""));
}

function newBoard() {
  return Array(9).fill(null);
}

function checkWinner(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  if (board.every(v => v)) return "draw";
  return null;
}

function safeRoomState(room) {
  return {
    players: Object.values(room.players).map(p => ({ name: p.name, symbol: p.symbol })),
    board: room.board,
    next: room.next,
    winner: room.winner,
    chat: room.chat.slice(-50)
  };
}

function assignSymbol(room) {
  const used = new Set(Object.values(room.players).map(p => p.symbol));
  if (!used.has("X")) return "X";
  if (!used.has("O")) return "O";
  return null;
}

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of Object.entries(rooms)) {
    const hasPlayers = Object.keys(room.players).length > 0;
    const tooOld = now - room.createdAt > 12 * 60 * 60 * 1000;
    if (!hasPlayers && tooOld) delete rooms[roomId];
  }
}, 10 * 60 * 1000);

io.on("connection", socket => {
  let currentRoomId = null;

  socket.on("room:create", ({ name, roomId }) => {
    name = cleanName(name);
    if (!name) return socket.emit("error:msg", "Naam is verplicht");
    roomId = String(roomId || "").trim() || uuidv4().slice(0, 6);
    if (!validRoomId(roomId)) return socket.emit("error:msg", "Ongeldige room code");

    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: {},
        board: newBoard(),
        next: "X",
        winner: null,
        createdAt: Date.now(),
        chat: []
      };
    }
    const room = rooms[roomId];
    const symbol = assignSymbol(room);
    if (!symbol) return socket.emit("error:msg", "Room zit vol");

    room.players[socket.id] = { name, symbol };
    currentRoomId = roomId;
    socket.join(roomId);
    io.to(roomId).emit("room:state", safeRoomState(room));
  });

  socket.on("room:join", ({ name, roomId }) => {
    name = cleanName(name);
    if (!name) return socket.emit("error:msg", "Naam is verplicht");
    if (!validRoomId(roomId)) return socket.emit("error:msg", "Ongeldige room code");
    const room = rooms[roomId];
    if (!room) return socket.emit("error:msg", "Room bestaat niet");

    const symbol = assignSymbol(room);
    if (!symbol) return socket.emit("error:msg", "Room zit vol");

    room.players[socket.id] = { name, symbol };
    currentRoomId = roomId;
    socket.join(roomId);
    io.to(roomId).emit("room:state", safeRoomState(room));
  });

  socket.on("game:move", ({ index }) => {
    const roomId = currentRoomId;
    if (roomId == null) return;
    const room = rooms[roomId];
    if (!room) return;
    if (room.winner) return;

    const player = room.players[socket.id];
    if (!player) return;

    if (typeof index !== "number" || index < 0 || index > 8) return;
    if (room.board[index]) return;
    if (player.symbol !== room.next) return;

    room.board[index] = player.symbol;
    room.next = room.next === "X" ? "O" : "X";
    room.winner = checkWinner(room.board);

    io.to(roomId).emit("room:state", safeRoomState(room));
  });

  socket.on("game:reset", () => {
    const roomId = currentRoomId;
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;
    room.board = newBoard();
    room.next = "X";
    room.winner = null;
    io.to(roomId).emit("room:state", safeRoomState(room));
  });

  socket.on("chat:msg", ({ name, msg }) => {
    const roomId = currentRoomId;
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;
    name = cleanName(name);
    const text = String(msg || "").trim().slice(0, 300);
    if (!text) return;
    const entry = { id: uuidv4(), name, msg: text, ts: Date.now() };
    room.chat.push(entry);
    io.to(roomId).emit("chat:push", entry);
  });

  socket.on("disconnect", () => {
    if (!currentRoomId) return;
    const room = rooms[currentRoomId];
    if (!room) return;
    delete room.players[socket.id];
    if (Object.keys(room.players).length < 2) {
      room.board = newBoard();
      room.next = "X";
      room.winner = null;
    }
    io.to(currentRoomId).emit("room:state", safeRoomState(room));
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: Object.keys(rooms).length });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`TicTacToe draait op http://localhost:${PORT}`);
});
