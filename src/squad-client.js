import { applyAction, createRoom, tick } from './squad-logic.js';

const STORAGE_KEY = 'decision-squad-room';
const listeners = (fn, state) => { for (const callback of fn) callback(state); };
const safeStorage = (value) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* Storage is optional for local or private sessions. */ } };
export const isFreshRoomState = (current, next) => !current || !next || (next.revision ?? 0) >= (current.revision ?? 0);
export function readSquadSession() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } }
export function clearSquadSession() { try { localStorage.removeItem(STORAGE_KEY); } catch { /* Storage is optional. */ } }

export async function checkSquadServer(timeoutMs = 2000) {
  try {
    const response = await fetch('./api/health', { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
    if (!response.ok) return null;
    const result = await response.json();
    return result.ok ? result : null;
  } catch { return null; }
}

export async function createRemoteRoom({ name, duty, teamName, noTimer }) {
  const response = await fetch('./api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, duty, teamName, noTimer }) });
  if (!response.ok) throw new Error(`無法開啟會議室 (${response.status})`);
  return response.json();
}
export async function joinRemoteRoom(code, { name, duty }) {
  const response = await fetch(`./api/rooms/${encodeURIComponent(code)}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, duty }) });
  if (!response.ok) throw new Error(response.status === 409 ? '這間會議室已滿。' : `無法加入會議室 (${response.status})`);
  return response.json();
}

export function createSquadClient({ mode = 'local', room, code, token, seat = 0, initialState, onStatus = () => {} } = {}) {
  const callbacks = new Set();
  let state = initialState ?? room ?? null;
  let closed = false;
  let timer = null;
  let source = null;
  let pending = Promise.resolve();
  const publish = (value) => {
    if (closed || !value) return;
    // POST responses and SSE frames can arrive out of order. Keep the newest
    // reducer snapshot so a delayed frame cannot undo an accepted answer.
    if (!isFreshRoomState(state, value)) return;
    state = value;
    listeners(callbacks, state);
  };
  if (mode === 'local') {
    if (!state) state = createRoom({ code: 'LOCAL', seed: Math.floor(Math.random() * 0xffffffff), hostName: '你' });
    timer = setInterval(() => { const updated = tick(state, Date.now()); if (updated !== state) publish(updated); }, 500);
  } else if (mode === 'remote' && code && token) {
    safeStorage({ code, token, seat });
    source = new EventSource(`./api/rooms/${encodeURIComponent(code)}/events?token=${encodeURIComponent(token)}`);
    source.addEventListener('state', (event) => { try { publish(JSON.parse(event.data)); onStatus('online'); } catch { /* Ignore malformed server frames. */ } });
    source.onopen = () => {
      onStatus('online');
      fetch(`./api/rooms/${encodeURIComponent(code)}/actions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, action: { type: 'rejoin' } }) }).catch(() => {});
    };
    source.onerror = () => onStatus('reconnecting');
    onStatus('online');
  }
  return {
    get state() { return state; },
    seat,
    mode,
    send(action) {
      if (closed) return Promise.resolve(state);
      if (mode === 'local') {
        const updated = applyAction(state, { ...action, seat }, Date.now());
        if (updated !== state) publish(tick(updated, Date.now()));
        return Promise.resolve(state);
      }
      // One failed request must not poison every later one, so the queue restarts from a settled promise.
      pending = pending.catch(() => {}).then(async () => {
        const response = await fetch(`./api/rooms/${encodeURIComponent(code)}/actions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, action }) });
        if (!response.ok) throw new Error(`連線暫時無法送出 (${response.status})`);
        publish(await response.json());
        return state;
      }).catch((error) => { onStatus('reconnecting'); throw error; });
      return pending;
    },
    subscribe(fn) { callbacks.add(fn); if (state) fn(state); return () => callbacks.delete(fn); },
    close() { closed = true; if (timer) clearInterval(timer); source?.close(); callbacks.clear(); }
  };
}
