import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from './index.mjs';
import squad from '../src/squad-content.js';

function eventReader(stream) {
  const reader = stream.getReader();
  let buffer = '';
  const decoder = new TextDecoder();
  return {
    async next() {
      while (true) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary >= 0) {
          const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
          const data = frame.split('\n').find((line) => line.startsWith('data: '));
          if (data) return JSON.parse(data.slice(6));
          continue;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error('SSE closed before an event');
        buffer += decoder.decode(value, { stream: true });
      }
    },
    close: () => reader.cancel(),
  };
}

function withTimeout(promise, message, ms = 4000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(typeof message === 'function' ? message() : message)), ms); })]).finally(() => clearTimeout(timer));
}

test('HTTP room flow, shared SSE state, access control, advisor fallback and board', async (t) => {
  const server = createGameServer({ autoTick: true });
  const eventStreams = [];
  t.after(async () => {
    await Promise.all(eventStreams.map((stream) => stream.close().catch(() => {})));
    if (server.listening) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    else server.emit('close');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, token) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, ...(token ? { token } : {}) })
  });
  const health = await fetch(`${base}/api/health`).then((response) => response.json());
  assert.deepEqual(health, { ok: true });
  const createdResponse = await request('/api/rooms', { name: '一號', duty: 'data' });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.match(created.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  const clients = [{ ...created, name: '一號', duty: 'data' }];
  for (const [index, duty] of ['media', 'brand', 'insight'].entries()) {
    const response = await request(`/api/rooms/${created.code}/join`, { name: `玩家${index + 2}`, duty });
    assert.equal(response.status, 201);
    clients.push({ ...(await response.json()), name: `玩家${index + 2}`, duty });
  }
  assert.equal((await request(`/api/rooms/${created.code}/join`, { name: '第五人' })).status, 409);
  assert.equal((await request(`/api/rooms/${created.code}/actions`, { action: { type: 'start' } }, 'wrong-token')).status, 403);

  const streams = await Promise.all(clients.map(async (client) => {
    const response = await fetch(`${base}/api/rooms/${created.code}/events?token=${encodeURIComponent(client.token)}`);
    assert.equal(response.status, 200);
    const stream = eventReader(response.body); eventStreams.push(stream); return { client, stream };
  }));
  const initial = await Promise.all(streams.map(({ stream }) => stream.next()));
  assert.equal(new Set(initial.map((state) => JSON.stringify(state))).size, 1);
  const action = async (client, value) => request(`/api/rooms/${created.code}/actions`, { action: value }, client.token);
  await action(clients[0], { type: 'start' });
  await Promise.all(streams.map(({ stream }) => stream.next()));
  await action(clients[0], { type: 'say', text: '這則訊息應同步給四位玩家' });
  const said = await Promise.all(streams.map(({ stream }) => stream.next()));
  assert.ok(said.every((state) => state.chat.some((entry) => entry.from === 0 && entry.text === '這則訊息應同步給四位玩家')));
  assert.equal(new Set(said.map((state) => JSON.stringify(state))).size, 1);
  const advisorState = await action(clients[0], { type: 'askAdvisor' }).then((response) => response.json());
  assert.ok(advisorState.chat.some((entry) => entry.text === squad.advisorLines[0].algo));
  assert.ok(advisorState.chat.some((entry) => entry.text === squad.advisorLines[0].human));
  await Promise.all(clients.map((client) => action(client, { type: 'showClue' })));
  await Promise.all(clients.map((client, index) => action(client, { type: 'vote', reply: index % 4 })));
  let gameTimeout;
  const gameState = await Promise.race([
    (async () => { while (true) { const state = await streams[0].stream.next(); if (state.phase === 'game') return state; } })(),
    new Promise((_, reject) => { gameTimeout = setTimeout(() => reject(new Error('discuss did not end')), 6000); })
  ]).finally(() => clearTimeout(gameTimeout));
  assert.equal(gameState.phase, 'game');
  const answers = await Promise.all(clients.map((client) => action(client, { type: 'answer', answer: 1, remainingSeconds: 10, correct: true })));
  assert.ok(answers.every((response) => response.status === 200));
  const revealState = await withTimeout((async () => {
    for (let tries = 0; tries < 20; tries += 1) {
      const latest = await streams[0].stream.next();
      if (latest.phase === 'reveal') return latest;
    }
    return null;
  })(), 'SSE did not publish the reveal');
  assert.ok(revealState, 'game answers should resolve into the reveal');
  const finalState = await action(clients[0], { type: 'ready' }).then((response) => response.json());
  assert.equal(finalState.phase, 'takeaway');
  const shared = await withTimeout(Promise.all(streams.map(async ({ stream }, index) => {
    if (index === 0) return finalState;
    for (let tries = 0; tries < 20; tries += 1) { const state = await stream.next(); if (state.phase === 'takeaway') return state; }
    throw new Error('SSE state did not catch up');
  })), 'SSE clients did not converge');
  assert.equal(new Set(shared.map((state) => JSON.stringify(state))).size, 1);
  const board = await fetch(`${base}/api/board`).then((response) => response.json());
  assert.ok(board.some((row) => row.teamName === created.state.teamName));
});
