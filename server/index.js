import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms.js';

const PORT = process.env.PORT || 3001;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
const manager = new RoomManager();

// NFR-7: simple per-IP sliding-window limits on room creation and joins.
const LIMITS = { create: { max: 10, windowMs: 60_000 }, join: { max: 30, windowMs: 60_000 } };
const hits = new Map();
const rateLimited = (ip, kind) => {
  const rule = LIMITS[kind];
  if (!rule) return false;
  const key = `${kind}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < rule.windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > rule.max;
};
setInterval(() => {
  const now = Date.now();
  hits.forEach((times, key) => {
    if (times.every((t) => now - t > 60_000)) hits.delete(key);
  });
}, 60_000).unref();

wss.on('connection', (socket, req) => {
  const conn = { socket, ip: req.socket.remoteAddress, deviceId: null, roomCode: null, seatId: null };
  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;
    if (rateLimited(conn.ip, msg.type)) {
      socket.send(JSON.stringify({ type: 'error', message: 'Too many attempts. Please wait a minute and try again.' }));
      return;
    }
    try {
      const err = manager.handle(conn, msg);
      if (err) socket.send(JSON.stringify({ type: 'error', message: err, action: msg.type }));
    } catch (e) {
      console.error('Error handling', msg.type, e);
      socket.send(JSON.stringify({ type: 'error', message: 'Something went wrong on the server.' }));
    }
  });

  socket.on('close', () => manager.disconnect(conn));
});

// Drop dead sockets so disconnect handling (FR-29) starts promptly.
setInterval(() => {
  wss.clients.forEach((socket) => {
    if (!socket.isAlive) {
      socket.terminate();
      return;
    }
    socket.isAlive = false;
    socket.ping();
  });
}, 15_000).unref();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: manager.rooms.size });
});

const dist = path.join(root, 'dist');
app.use(express.static(dist));
app.get('*', (_req, res, next) => {
  res.sendFile(path.join(dist, 'index.html'), (err) => err && next());
});

server.listen(PORT, () => {
  console.log(`Least Count server listening on http://localhost:${PORT}`);
});
