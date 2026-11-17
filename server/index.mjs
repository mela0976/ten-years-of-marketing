import { createServer as nodeServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { randomBytes, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { applyAction, createRoom, tick } from '../src/squad-logic.js';
import squad from '../src/squad-content.js';
import gamify from '../src/gamify-content.js';

const ROOT = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const ROOM_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const MAX_BODY = 4096;
const json = (res, status, value) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
const publicState = (room) => structuredClone(room);

export function createGameServer({ staticRoot = ROOT, now = Date.now, autoTick = true } = {}) {
  const rooms = new Map();
  const tokens = new Map();
  const clients = new Map();
  const roomTouched = new Map();
  const createCounts = new Map();
  let timer;
  const broadcast = (code) => {
    const room = rooms.get(code);
    if (!room) return;
    const body = `event: state\ndata: ${JSON.stringify(publicState(room))}\n\n`;
    for (const response of clients.get(code) ?? []) if (!response.destroyed && !response.writableEnded) response.write(body);
  };
  const save = (room, touched = true) => { rooms.set(room.code, room); if (touched) roomTouched.set(room.code, now()); broadcast(room.code); };
  const issueToken = (code, seat) => {
    const token = randomBytes(24).toString('base64url');
    tokens.set(token, { code, seat });
    return token;
  };
  const readBody = async (req) => {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw Object.assign(new Error('too large'), { status: 413 }); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw Object.assign(new Error('bad json'), { status: 400 }); }
  };
  const handle = async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = decodeURIComponent(url.pathname);
    if (req.method === 'GET' && path === '/api/health') return json(res, 200, { ok: true });
    if (req.method === 'GET' && path === '/api/board') return json(res, 200, [...rooms.values()].filter((room) => !['lobby', 'review'].includes(room.phase)).map((room) => ({ teamName: room.teamName, score: room.score, chapter: room.chapter })));
    if (req.method === 'POST' && path === '/api/rooms') {
      const ip = req.socket.remoteAddress ?? 'unknown';
      const times = (createCounts.get(ip) ?? []).filter((time) => now() - time < 60_000);
      if (times.length >= 10) return json(res, 429, { error: 'rate limit' });
      const body = await readBody(req);
      let code;
      do { code = Array.from({ length: 4 }, () => ROOM_CHARS[randomInt(ROOM_CHARS.length)]).join(''); } while (rooms.has(code));
      const room = createRoom({ code, seed: randomInt(0x100000000), noTimer: body.noTimer, teamName: body.teamName ?? gamify.teams[0]?.name, hostName: body.name ?? '', hostDuty: body.duty ?? squad.duties[0].id, now: now() });
      const seat = room.seats.findIndex((value) => value.host);
      rooms.set(code, room); roomTouched.set(code, now()); createCounts.set(ip, [...times, now()]);
      return json(res, 201, { code, token: issueToken(code, seat), seat, state: publicState(room) });
    }
    const roomMatch = path.match(/^\/api\/rooms\/([A-Z0-9]{4})(?:\/(join|actions|events))?$/);
    if (roomMatch) {
      const [, code, endpoint] = roomMatch;
      const room = rooms.get(code);
      if (!room) return json(res, 404, { error: 'room not found' });
      if (req.method === 'POST' && endpoint === 'join') {
        const body = await readBody(req);
        const matchingDuty = room.seats.findIndex((item) => item.kind === 'empty' && item.duty === body.duty);
        const seat = matchingDuty >= 0 ? matchingDuty : room.seats.findIndex((item) => item.kind === 'empty');
        if (seat < 0) return json(res, 409, { error: 'room full' });
        let updated = applyAction(room, { type: 'join', seat, id: randomBytes(8).toString('hex'), name: body.name, duty: body.duty }, now());
        if (updated === room) return json(res, 409, { error: 'room unavailable' });
        save(updated);
        return json(res, 201, { token: issueToken(code, seat), seat, state: publicState(updated) });
      }
      if (req.method === 'POST' && endpoint === 'actions') {
        const body = await readBody(req);
        const auth = tokens.get(body.token);
        if (!auth || auth.code !== code) return json(res, 403, { error: 'forbidden' });
        const currentRoom = rooms.get(code);
        const actorAction = { ...body.action, seat: auth.seat };
        const updated = applyAction(currentRoom, actorAction, now());
        if (updated !== currentRoom) save(updated);
        return json(res, 200, publicState(rooms.get(code)));
      }
      if (req.method === 'GET' && endpoint === 'events') {
        const auth = tokens.get(url.searchParams.get('token'));
        if (!auth || auth.code !== code) return json(res, 403, { error: 'forbidden' });
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        res.write(`event: state\ndata: ${JSON.stringify(publicState(room))}\n\n`);
        const set = clients.get(code) ?? new Set(); set.add(res); clients.set(code, set);
        const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15_000);
        res.on('close', () => {
          clearInterval(heartbeat); set.delete(res); if (!set.size) clients.delete(code);
          const current = rooms.get(code);
          const disconnected = applyAction(current, { type: 'disconnect', seat: auth.seat }, now());
          if (disconnected !== current) save(disconnected);
        });
        return;
      }
    }
    if (req.method === 'GET') {
      const decoded = normalize(path).replace(/^([/\\.]+)?/, '');
      const file = join(staticRoot, decoded || 'index.html');
      if (!file.startsWith(`${staticRoot}/`) && file !== join(staticRoot, 'index.html')) return json(res, 403, { error: 'forbidden' });
      const target = existsSync(file) && statSync(file).isFile() ? file : join(staticRoot, 'index.html');
      if (!existsSync(target)) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg' })[extname(target)] ?? 'application/octet-stream' });
      return createReadStream(target).pipe(res);
    }
    json(res, 404, { error: 'not found' });
  };
  const server = nodeServer((req, res) => { handle(req, res).catch((error) => json(res, error.status ?? 500, { error: error.status ? error.message : 'server error' })); });
  if (autoTick) timer = setInterval(() => {
    const currentTime = now();
    for (const [code, room] of rooms) {
      if (currentTime - (roomTouched.get(code) ?? currentTime) >= 2 * 60 * 60 * 1000) {
        rooms.delete(code); roomTouched.delete(code); for (const [token, item] of tokens) if (item.code === code) tokens.delete(token); continue;
      }
      const updated = tick(room, currentTime);
      if (updated !== room) save(updated, false);
    }
  }, 500);
  server.on('close', () => { clearInterval(timer); for (const set of clients.values()) for (const res of set) res.end(); });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8787;
  const server = createGameServer();
  server.listen(port, '0.0.0.0', () => console.log(`決策智慧 server listening on ${port}`));
}
