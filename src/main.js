import './style.css';
import content from './content.js';
import gamify from './gamify-content.js';
import roleConfig from './role-content.js';
import { AudioManager } from './audio.js';
import { GameScene } from './scene/game-scene.js';
import { createStageGuard } from './stage-guard.js';
import { applyRoleMultiplier, desktopCameraDistance, getRunTotals, hintMultiSelection, hintPickIndices, maxChapterScore, personaId, rankTeams, rivalChapterAward, rivalQuickAward, scoreMiniGame, scoreMultiGame, scoreQuick, scoreReply, sliderHintRange, sliderIsCorrect, stopIsCorrect, swipeScoreIsCorrect, timerSecondsForRole } from './logic.js';
import { button, element, setPanel, statusText, updateProgress } from './ui.js';
import squadContent from './squad-content.js';
import { createRoom as createSquadRoom, applyAction as applySquadAction } from './squad-logic.js';
import { checkSquadServer, clearSquadSession, createRemoteRoom, joinRemoteRoom, createSquadClient, readSquadSession } from './squad-client.js';
import { renderModeChoice, renderSquadScreen } from './squad-ui.js';

const STORAGE_KEY = 'decision-ten-years-progress';
const panel = document.querySelector('#panel');
const progress = document.querySelector('#progress');
const status = document.querySelector('#status');
const canvas = document.querySelector('#world');
const fallback = document.querySelector('#scene-fallback');
const audio = new AudioManager(document.querySelector('#sound-toggle'));
const teamScore = document.querySelector('#team-score');
const employeeBadge = element('div', { className: 'employee-badge', hidden: true });
const roleMultiplier = element('span', { className: 'role-multiplier', hidden: true });
teamScore.before(employeeBadge);
teamScore.after(roleMultiplier);
const shortcut = new URLSearchParams(window.location.search);
const shortcutChapter = Number(shortcut.get('c'));
const hasChapterShortcut = Number.isInteger(shortcutChapter) && shortcutChapter >= 1 && shortcutChapter <= 10;
const shortcutIndex = hasChapterShortcut ? shortcutChapter - 1 : null;
const shortcutToGame = !shortcut.get('room') && shortcut.get('squad') !== 'local' && hasChapterShortcut && shortcut.get('g') === '1' && shortcutIndex < 9;
const validRoleIds = roleConfig.roles.map((role) => role.id);
const queryRole = shortcut.get('role');
const initialRole = validRoleIds.includes(queryRole) ? queryRole : roleConfig.defaultRole;

function restoredProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!value || value.version !== 3 || !Number.isInteger(value.index) || !Array.isArray(value.results)
      || !gamify.teams.includes(value.team) || !Number.isFinite(value.score) || !Number.isFinite(value.seed)) {
      return { index: 0, results: [], started: false, role: initialRole, team: null, score: 0, seed: newSeed(), noTimer: window.matchMedia('(prefers-reduced-motion: reduce)').matches, rivalScores: {}, rivalAwarded: [], quickRivalsAwarded: false, hintsLeft: 0, hintsUsed: [] };
    }
    const index = Math.max(0, Math.min(9, value.index));
    const results = value.results.slice(0, index).filter((item) => item && ['perf', 'brand'].includes(item.lean));
    return {
      index: results.length === index ? index : 0,
      results: results.length === index ? results : [],
      started: results.length === index && value.started === true,
      role: validRoleIds.includes(value.role) ? value.role : initialRole,
      team: value.team,
      score: value.score,
      seed: value.seed,
      noTimer: Boolean(value.noTimer),
      rivalScores: value.rivalScores && typeof value.rivalScores === 'object' ? value.rivalScores : {},
      rivalAwarded: Array.isArray(value.rivalAwarded) ? value.rivalAwarded : [],
      quickRivalsAwarded: Boolean(value.quickRivalsAwarded),
      hintsLeft: Number.isInteger(value.hintsLeft) ? Math.max(0, value.hintsLeft) : 0,
      hintsUsed: Array.isArray(value.hintsUsed) ? value.hintsUsed.filter(Number.isInteger) : [],
    };
  } catch {
    return { index: 0, results: [], started: false, role: initialRole, team: null, score: 0, seed: newSeed(), noTimer: window.matchMedia('(prefers-reduced-motion: reduce)').matches, rivalScores: {}, rivalAwarded: [], quickRivalsAwarded: false, hintsLeft: 0, hintsUsed: [] };
  }
}

function newSeed() { return Math.floor(Math.random() * 0x100000000); }

function roleFor(id = state.role) {
  return roleConfig.roles.find((role) => role.id === id)
    ?? roleConfig.roles.find((role) => role.id === roleConfig.defaultRole);
}

const saved = restoredProgress();
const state = {
  index: shortcutIndex ?? saved.index,
  results: hasChapterShortcut ? [] : saved.results,
  phase: shortcutToGame ? 'game' : hasChapterShortcut ? 'chat' : shortcut.get('room') ? 'squad' : saved.started ? 'chat' : 'intro',
  currentResult: shortcutToGame ? { lean: 'brand', scored: Boolean(content.chapters[shortcutIndex].game?.scored), correct: null } : null,
  team: hasChapterShortcut ? gamify.teams[0] : saved.team,
  role: hasChapterShortcut ? initialRole : saved.role,
  roleSelection: hasChapterShortcut ? initialRole : saved.role,
  hintsLeft: hasChapterShortcut ? roleFor(initialRole).hints : saved.hintsLeft,
  hintsUsed: hasChapterShortcut ? [] : saved.hintsUsed,
  multiSelection: [],
  pickAllowed: null,
  score: hasChapterShortcut ? 0 : saved.score,
  seed: hasChapterShortcut ? newSeed() : saved.seed,
  noTimer: hasChapterShortcut ? false : saved.noTimer,
  rivalScores: hasChapterShortcut ? Object.fromEntries(gamify.rivals.map((rival) => [rival.name, 0])) : saved.rivalScores,
  rivalAwarded: hasChapterShortcut ? [] : saved.rivalAwarded,
  previousRanks: {},
  rankChanges: {},
  timerTotal: 0,
  timerRemaining: 0,
  timerInterval: null,
  miniAwarded: false,
  quickIndex: 0,
  quickCorrectCount: 0,
  quickRemaining: 0,
  quickInterval: null,
  quickAnswered: false,
  quickLastFeedback: '',
  quickRivalsAwarded: hasChapterShortcut ? false : saved.quickRivalsAwarded,
  scoreAnimating: false,
  replyText: '',
  gameValue: 0,
  optionFocus: 0,
  swipeIndex: 0,
  swipeCorrect: 0,
  swipeCount: 0,
  swipeFeedback: '',
  swipePending: false,
  stopTick: 0,
  stopStarted: false,
  stopTimer: null,
  revealText: '',
  revealCorrect: null,
  squadMode: Boolean(shortcut.get('room')),
};
const stageGuard = createStageGuard(state.phase);
state.stageCode = stageGuard.stageCode;

let scene;
let squadClient = null;
let squadRoom = null;
let squadSeat = 0;
let squadOffline = false;
let squadError = '';
let squadStatus = '';
let squadDefaults = { roomCode: shortcut.get('room') ?? '', roomInvite: Boolean(shortcut.get('room')) };

function currentChapter() { return content.chapters[state.index]; }

function chapterLabel(chapter, stage) {
  const tier = gamify.scoring.tierByChapter[content.chapters.indexOf(chapter)];
  return `${chapter.year}${tier ? `　×${tier}` : ''}　／　${stage}`;
}

function allResults() {
  return state.currentResult ? [...state.results, state.currentResult] : state.results;
}

function storeProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 3, index: state.index, results: state.results, started: state.phase !== 'intro', role: state.role,
      team: state.team, score: state.score, seed: state.seed, noTimer: state.noTimer,
      rivalScores: state.rivalScores,
      rivalAwarded: state.rivalAwarded, quickRivalsAwarded: state.quickRivalsAwarded,
      hintsLeft: state.hintsLeft, hintsUsed: state.hintsUsed,
    }));
  } catch {
    // The run remains playable when storage is unavailable.
  }
}

// Screens are often drawn straight from a callback, so the layout flags follow the phase itself, not render().
function syncLayout() {
  const game = document.querySelector('#game');
  if (!game) return;
  game.dataset.phase = state.phase;
  game.dataset.layout = ['role', 'persona'].includes(state.phase) ? 'review' : state.phase;
}

function beginStage(phase = state.phase) {
  state.phase = phase;
  state.stageCode = stageGuard.advance(phase);
  syncLayout();
}

function movePhase(phase) {
  if (state.phase === phase) return;
  const leavingMiniGame = state.phase === 'game' && phase !== 'game';
  const leavingQuick = state.phase === 'quick' && phase !== 'quick';
  state.phase = phase;
  state.stageCode = stageGuard.enter(phase);
  syncLayout();
  if (leavingMiniGame) {
    stopGameTimer();
    if (state.stopTimer !== null) window.clearInterval(state.stopTimer);
    state.stopTimer = null;
  }
  if (leavingQuick) stopQuickTimer();
}

function scheduleStageCallback(callback, delay, onStale = () => {}) {
  const code = state.stageCode;
  const guarded = stageGuard.once(code, callback);
  return window.setTimeout(() => {
    if (!stageGuard.isCurrent(code)) { onStale(); return; }
    guarded();
  }, delay);
}

function setPhase(phase) {
  movePhase(phase);
  updateProgress(progress, state.index, !['intro', 'role', 'team', 'warmup', 'warmup-result'].includes(phase));
  teamScore.hidden = !state.team || ['intro', 'role', 'team'].includes(phase);
  employeeBadge.hidden = !state.team || ['intro', 'team', 'role'].includes(phase);
  roleMultiplier.hidden = employeeBadge.hidden || roleFor().scoreMultiplier === 1;
  employeeBadge.textContent = `${'▮'.repeat(roleFor().level)}${'▯'.repeat(roleConfig.maxLevel - roleFor().level)}　${roleFor().name}・${state.team ?? ''}`;
  roleMultiplier.textContent = `身份 ×${roleFor().scoreMultiplier}`;
  if (!teamScore.hidden && !state.scoreAnimating) teamScore.textContent = `${state.score.toLocaleString('zh-TW')} 分`;
  render();
}

function action(label, callback, kind = 'secondary', attrs = {}) {
  return button(label, () => {
    audio.play('click');
    callback();
  }, kind, attrs);
}

function slowWalkLink() {
  return element('a', {
    className: 'slow-walk-link',
    text: roleConfig.labels.slowWalk,
    attrs: { href: './slow-walk/' },
  });
}

function showIntro() {
  updateProgress(progress, state.index, false);
  const best = readBestScore();
  const timerToggle = element('label', { className: 'timer-toggle' }, [
    element('input', { type: 'checkbox', checked: state.noTimer, attrs: { 'aria-label': gamify.noTimerLabel } }),
    element('span', { text: gamify.noTimerLabel }),
  ]);
  timerToggle.querySelector('input').addEventListener('change', (event) => {
    state.noTimer = event.currentTarget.checked;
    storeProgress();
  });
  const identity = element('section', { className: 'paper-card identity-notice' }, [
    element('div', { className: 'paper-kicker' }, [element('span', { text: roleConfig.labels.notice }), element('span', { text: roleConfig.labels.noticeNo })]),
    element('div', { className: 'paper-heading' }, [element('h2', { text: content.title }), element('p', { text: content.intro })]),
    element('div', { className: 'identity-fields' }, [
      element('div', {}, [element('span', { text: roleConfig.labels.joinYear }), element('strong', { text: '2018' })]),
      element('div', {}, [element('span', { text: roleConfig.labels.level }), element('strong', { text: roleConfig.labels.pending })]),
      element('div', {}, [element('span', {}, roleConfig.labels.dept), element('strong', { text: roleConfig.labels.pending })]),
    ]),
  ]);
  setPanel(panel, '', '', [
    identity,
    best === null ? null : element('p', { className: 'choice-hint best-score', text: `最佳 ${best.toLocaleString('zh-TW')}` }),
    element('ul', { className: 'rules-list' }, gamify.rules.map((rule) => element('li', { text: rule }))),
    element('div', { className: 'intro-actions' }, [
      action(roleConfig.labels.getBadge, () => { audio.start(); audio.play('flip'); movePhase('mode'); render(); }, 'primary'),
      slowWalkLink(),
      timerToggle,
    ]),
  ], 'open');
}

function readBestScore() {
  try {
    const stored = localStorage.getItem('decision-ten-years-best');
    if (stored === null) return null;
    const score = Number(stored);
    return Number.isFinite(score) && score >= 0 ? score : null;
  } catch { return null; }
}

function showTeamSelection() {
  setPanel(panel, roleConfig.labels.teamStep, gamify.teamPrompt, [
    renderIdentityCard(roleFor(state.roleSelection), true),
    element('div', { className: 'option-grid department-options' }, gamify.teams.map((team) => action(team, () => {
      state.team = team;
      state.score = 0;
      state.hintsLeft = roleFor(state.roleSelection).hints;
      state.hintsUsed = [];
      state.rivalScores = Object.fromEntries(gamify.rivals.map((rival) => [rival.name, 0]));
      state.rivalAwarded = [];
      movePhase('warmup');
      storeProgress();
      render();
    }, 'option'))),
  ], 'open');
}

function enterSoloMode() {
  state.squadMode = false;
  movePhase('role');
  render();
}

function closeSquadClient() {
  squadClient?.close();
  squadClient = null;
  squadRoom = null;
}

function installSquadClient(options) {
  closeSquadClient();
  squadSeat = options.seat ?? 0;
  squadClient = createSquadClient({ ...options, onStatus: (value) => { options.onStatus?.(value); squadStatus = value; if (value === 'reconnecting') statusText(status, squadContent.labels.reconnecting); render(); } });
  squadClient.subscribe((room) => {
    const previous = squadRoom;
    squadRoom = room;
    state.score = room.score;
    state.team = room.teamName;
    teamScore.hidden = false;
    teamScore.textContent = `${room.score.toLocaleString('zh-TW')} 分`;
    updateProgress(progress, Math.min(room.chapter, 9), room.phase !== 'lobby');
    if (!scene?.squadMode) scene?.setSquadMode(true, squadContent.duties);
    if (room.phase !== 'lobby' && (previous?.chapter !== room.chapter || scene?.currentIndex !== room.chapter)) scene?.setChapter(content.chapters[Math.min(room.chapter, 9)], Math.min(room.chapter, 9), false);
    if (previous && room.phase === 'discuss') {
      for (const index of Object.keys(room.votes)) if (previous.votes[index] !== room.votes[index]) scene?.bounceSquadPlayer(Number(index));
    }
    if (previous && room.phase === 'game') {
      for (const index of Object.keys(room.answers)) if (!Object.hasOwn(previous.answers, index)) scene?.bounceSquadPlayer(Number(index));
    }
    render();
  });
  render();
}

function squadCallbacks() {
  return {
    status: (message) => statusText(status, message),
    enter: async (input) => {
      squadError = '';
      try {
        if (input.mode === 'local' || squadOffline) {
          let room = createSquadRoom({ seed: newSeed(), teamName: input.teamName, noTimer: input.noTimer, hostName: input.name, hostDuty: input.duty });
          if (squadOffline || input.mode === 'local') room = applySquadAction(room, { type: 'start', seat: 0 }, Date.now());
          installSquadClient({ mode: 'local', room, seat: 0, onStatus: (value) => { squadStatus = value; } });
          if (squadOffline) statusText(status, squadContent.labels.offline);
          return;
        }
        const details = input.mode === 'create'
          ? await createRemoteRoom({ name: input.name, duty: input.duty, teamName: input.teamName, noTimer: input.noTimer })
          : await joinRemoteRoom(input.code, { name: input.name, duty: input.duty });
        installSquadClient({ mode: 'remote', code: details.code ?? input.code, token: details.token, seat: details.seat, initialState: details.state, onStatus: (value) => { squadStatus = value; if (value === 'reconnecting') statusText(status, squadContent.labels.reconnecting); } });
      } catch (error) { squadError = error.message; render(); }
    },
    restart: () => { if (squadClient) squadClient.send({ type: 'restart' }); },
    leave: () => { closeSquadClient(); clearSquadSession(); state.squadMode = false; scene?.setSquadMode(false); state.phase = 'mode'; render(); },
  };
}

async function enterSquadMode() {
  state.squadMode = true;
  state.phase = 'squad';
  squadError = '';
  const health = await checkSquadServer(2000);
  squadOffline = !health;
  if (!health) {
    let room = createSquadRoom({ seed: newSeed(), hostName: '你', hostDuty: 'data' });
    room = applySquadAction(room, { type: 'start', seat: 0 }, Date.now());
    installSquadClient({ mode: 'local', room, seat: 0 });
    statusText(status, squadContent.labels.offline);
    return;
  }
  const session = readSquadSession();
  const invited = shortcut.get('room');
  // A reload, or reopening the invite link, returns the player to the seat they already hold.
  if (session?.code && session?.token && (!invited || invited.toUpperCase() === session.code)) {
    squadDefaults.roomCode = session.code;
    installSquadClient({ mode: 'remote', code: session.code, token: session.token, seat: session.seat });
    squadClient?.send({ type: 'rejoin' }).catch(() => { closeSquadClient(); clearSquadSession(); squadError = '無法回到原座位，請重新加入。'; render(); });
    return;
  }
  render();
}

function renderIdentityCard(role, compact = false) {
  const pips = Array.from({ length: roleConfig.maxLevel }, (_, index) => element('span', { className: index < role.level ? 'is-on' : '' }));
  return element('section', { className: `identity-card${compact ? ' is-compact' : ''}` }, [
    renderAvatarSilhouette('identity-avatar'),
    element('div', { className: 'identity-card-body' }, [
      element('strong', { className: 'identity-name', text: role.name }),
      element('span', { className: 'identity-code', text: role.code }),
      element('span', { className: 'identity-department' }, [roleConfig.labels.dept, element('b', { text: compact ? state.team ?? roleConfig.labels.pending : roleConfig.labels.pending })]),
    ]),
    element('span', { className: 'identity-level', attrs: { role: 'img', 'aria-label': `職級 ${role.level}／${roleConfig.maxLevel}` } }, pips),
  ]);
}

function renderAvatarSilhouette(className) {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 64 80');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const rect = document.createElementNS(namespace, 'rect');
  rect.setAttribute('width', '64');
  rect.setAttribute('height', '80');
  rect.setAttribute('fill', '#dcd6c6');
  const head = document.createElementNS(namespace, 'circle');
  head.setAttribute('cx', '32');
  head.setAttribute('cy', '30');
  head.setAttribute('r', '13');
  head.setAttribute('fill', '#b9b4a6');
  const body = document.createElementNS(namespace, 'path');
  body.setAttribute('d', 'M8 80 C8 58 20 50 32 50 C44 50 56 58 56 80 Z');
  body.setAttribute('fill', '#b9b4a6');
  svg.append(rect, head, body);
  return svg;
}

function renderRoleSelection() {
  const current = roleFor(state.roleSelection);
  const roleButtons = element('div', { className: 'role-choices' }, roleConfig.roles.map((role) => action('', () => {
    state.roleSelection = role.id;
    renderRoleSelection();
  }, 'role-option', { 'aria-pressed': String(role.id === state.roleSelection) })));
  roleButtons.querySelectorAll('button').forEach((node, index) => {
    const role = roleConfig.roles[index];
    node.replaceChildren(element('span', { className: 'role-choice-name', text: role.name }), element('span', { className: 'role-choice-job', text: role.job }), element('span', { className: 'role-choice-pace', text: role.pace }));
    node.classList.toggle('is-selected', role.id === state.roleSelection);
    const pips = element('span', { className: 'identity-level', attrs: { 'aria-hidden': 'true' } }, Array.from({ length: roleConfig.maxLevel }, (_, level) => element('span', { className: level < role.level ? 'is-on' : '' })));
    node.append(pips);
  });
  const details = element('div', { className: 'role-details' }, [
    element('dl', {}, [
      element('dt', { text: roleConfig.labels.who }), element('dd', { text: current.who }),
      element('dt', { text: roleConfig.labels.power }), element('dd', { text: current.power }),
      element('dt', { text: roleConfig.labels.pace }), element('dd', { text: current.pace }),
    ]),
    element('p', { text: current.line }),
  ]);
  setPanel(panel, roleConfig.labels.roleStep, roleConfig.prompt, [
    element('div', { className: 'role-layout' }, [roleButtons, element('div', { className: 'role-preview-column' }, [renderIdentityCard(current), details])]),
    action(roleConfig.labels.next, () => { state.role = state.roleSelection; movePhase('team'); storeProgress(); render(); }, 'primary'),
  ], 'open');
}

function showWarmup() {
  setPanel(panel, '熱身', gamify.warmup.prompt, [
    element('div', { className: 'option-grid' }, gamify.warmup.options.map((option) => action(option, () => {
      awardPoints(gamify.warmup.points);
      movePhase('warmup-result');
      render();
      scheduleStageCallback(() => {
        if (state.phase === 'warmup-result') enterChapter(false);
      }, 1000);
    }, 'option'))),
  ], 'open');
}

function showWarmupResult() {
  setPanel(panel, '熱身', '', [element('p', { className: 'result-note', text: gamify.warmup.after })]);
}

function awardPoints(points, { sound = true } = {}) {
  if (!Number.isFinite(points) || points <= 0) return;
  const before = state.score;
  state.score += points;
  teamScore.hidden = false;
  animateScore(before, state.score);
  showScoreFloat(points);
  if (sound) audio.play('correct');
  statusText(status, `加 ${points.toLocaleString('zh-TW')} 分。`);
  storeProgress();
}

function animateScore(from, to) {
  state.scoreAnimating = true;
  const stageCode = state.stageCode;
  const start = performance.now();
  const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 400;
  const frame = (now) => {
    if (!stageGuard.isCurrent(stageCode)) {
      state.scoreAnimating = false;
      teamScore.textContent = `${state.score.toLocaleString('zh-TW')} 分`;
      return;
    }
    const progress = Math.min(1, (now - start) / duration);
    const value = Math.round(from + (to - from) * progress);
    teamScore.textContent = `${value.toLocaleString('zh-TW')} 分`;
    if (progress < 1) requestAnimationFrame(frame);
    else state.scoreAnimating = false;
  };
  requestAnimationFrame(frame);
}

function showScoreFloat(points) {
  const rect = panel.getBoundingClientRect();
  const node = element('span', { className: 'score-float', text: `+${points.toLocaleString('zh-TW')}` });
  node.style.left = `${Math.round(rect.left + rect.width * 0.72)}px`;
  node.style.top = `${Math.round(Math.max(rect.top - 8, 72))}px`;
  document.querySelector('#game').append(node);
  scheduleStageCallback(() => node.remove(), 900, () => node.remove());
}

function awardMiniGame(correct, { timeout = false } = {}) {
  if (state.miniAwarded) return;
  state.miniAwarded = true;
  stopGameTimer();
  const game = currentChapter().game;
  const tier = gamify.scoring.tierByChapter[state.index];
  const totalSeconds = state.timerTotal;
  const points = scoreMiniGame(state.index, {
    correct: Boolean(correct),
    remainingSeconds: timeout ? 0 : state.timerRemaining,
    totalSeconds,
    timed: !state.noTimer && game.type !== 'stop',
    timeout,
  });
  const adjustedPoints = applyRoleMultiplier(points, roleFor().scoreMultiplier);
  awardPoints(adjustedPoints, { sound: false });
  state.lastAward = adjustedPoints;
  state.lastTier = tier;
}

function startGameTimer() {
  stopGameTimer();
  const game = currentChapter().game;
  if (state.noTimer || game.type === 'stop') return;
  const tier = gamify.scoring.tierByChapter[state.index];
  state.timerTotal = timerSecondsForRole(gamify.scoring.timerSecondsByTier[tier], roleFor().timerDelta, roleConfig.minTimerSeconds);
  state.timerRemaining = state.timerTotal;
  const startedAt = performance.now();
  const stageCode = state.stageCode;
  renderTimerIndicator();
  state.timerInterval = window.setInterval(() => {
    if (!stageGuard.isCurrent(stageCode)) { stopGameTimer(); return; }
    if (state.phase !== 'game') { stopGameTimer(); return; }
    const elapsed = (performance.now() - startedAt) / 1000;
    state.timerRemaining = Math.max(0, state.timerTotal - elapsed);
    renderTimerIndicator();
    if (state.timerRemaining <= 0) {
      stopGameTimer();
      state.currentResult.correct = false;
      state.revealCorrect = false;
      awardMiniGame(false, { timeout: true });
      setPhase('reveal');
    }
  }, 100);
}

function stopGameTimer() {
  if (state.timerInterval !== null) window.clearInterval(state.timerInterval);
  state.timerInterval = null;
}

function renderTimerIndicator() {
  const old = panel.querySelector('.timer-indicator');
  if (old) old.remove();
  if (state.noTimer || !state.timerTotal || currentChapter().game?.type === 'stop' || state.phase !== 'game') return;
  const ratio = Math.max(0, state.timerRemaining / state.timerTotal);
  const timer = element('div', { className: `timer-indicator${state.timerRemaining <= 3 ? ' is-warning' : ''}`, attrs: { role: 'timer', 'aria-label': `剩餘 ${Math.ceil(state.timerRemaining)} 秒` } }, [
    element('span', { className: 'timer-track' }, element('span', { className: 'timer-fill' })),
    element('strong', { text: `${Math.ceil(state.timerRemaining)} 秒` }),
  ]);
  timer.querySelector('.timer-fill').style.transform = `scaleX(${ratio})`;
  panel.insertBefore(timer, panel.querySelector('.panel-title')?.nextSibling ?? panel.firstChild);
}

function enterChapter(animate = true) {
  const chapter = currentChapter();
  stopGameTimer();
  state.timerTotal = 0;
  state.timerRemaining = 0;
  state.miniAwarded = false;
  state.currentResult = null;
  state.gameValue = chapter.game?.start ?? 0;
  state.optionFocus = 0;
  state.multiSelection = [];
  state.hintLockedIndex = null;
  state.sliderHint = '';
  state.multiFeedback = '';
  state.pickAllowed = null;
  state.swipeIndex = 0;
  state.swipeCorrect = 0;
  state.swipeCount = 0;
  state.swipeFeedback = '';
  state.swipePending = false;
  state.stopTick = 0;
  state.stopStarted = false;
  state.revealText = '';
  state.revealCorrect = null;
  scene?.setChapter(chapter, state.index, animate);
  setPhase('chat');
}

function renderChat() {
  const chapter = currentChapter();
  const replies = element('div', { className: 'option-grid reply-options' }, chapter.chat.replies.map((reply, index) =>
    action(reply.text, () => selectReply(index), 'option')));
  const role = roleFor();
  const lead = element('div', { className: 'chat-bubble chat-lead' }, [
    element('span', { className: 'role-avatar', text: role.avatar, attrs: { 'aria-hidden': 'true' } }),
    element('div', {}, [element('p', { className: 'chat-speaker', text: role.contact }), element('p', { className: 'chat-text', text: role.lead.replace('{from}', chapter.chat.from) })]),
  ]);
  const message = element('p', { className: 'chat-text', text: '' });
  typeText(message, chapter.chat.text);
  const bubble = element('div', { className: 'chat-bubble' }, [
    element('p', { className: 'chat-speaker', text: chapter.chat.from }),
    message,
  ]);
  setPanel(panel, `${roleConfig.labels.tenureLine.replace('{n}', String(state.index + 1))}　・　${chapterLabel(chapter, String(state.index + 1).padStart(2, '0'))}`, chapter.title, [
    element('div', { className: 'chat-stack' }, [lead, bubble]),
    element('span', { className: 'your-reply-label', text: roleConfig.labels.yourReply }),
    replies,
  ]);
}

function typeText(target, text) {
  const characters = Array.from(text);
  const start = performance.now();
  const duration = 500;
  const stageCode = state.stageCode;
  const frame = (time) => {
    if (!stageGuard.isCurrent(stageCode)) return;
    const count = Math.min(characters.length, Math.ceil((time - start) / duration * characters.length));
    target.textContent = characters.slice(0, count).join('');
    if (count < characters.length) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function selectReply(index) {
  const chapter = currentChapter();
  const reply = chapter.chat.replies[index];
  state.currentResult = { lean: reply.lean, perf: Number.isFinite(reply.perf) ? reply.perf : reply.lean === 'perf' ? 1 : 0, scored: Boolean(chapter.game?.scored), correct: false };
  state.replyText = String(reply?.text ?? '');
  awardPoints(scoreReply());
  state.optionFocus = 0;
  movePhase('reply');
  if (chapter.finale) {
    renderReply(chapter);
    scheduleStageCallback(async () => {
      if (state.phase !== 'reply') return;
      audio.play('flip');
      await scene?.flipFinale();
      if (state.phase !== 'reply') return;
      movePhase('persona');
      updateProgress(progress, state.index, true);
      renderPersona();
    }, 520);
    return;
  }
  renderReply(chapter);
  scheduleStageCallback(() => {
    if (state.phase !== 'reply') return;
    movePhase('game');
    updateProgress(progress, state.index, true);
    render();
    startGameTimer();
  }, 520);
}

function renderReply(chapter) {
  setPanel(panel, chapterLabel(chapter, String(state.index + 1).padStart(2, '0')), chapter.title, [
    element('div', { className: 'chat-stack' }, element('div', { className: 'chat-bubble' }, [
      element('p', { className: 'chat-speaker', text: chapter.chat.from }),
      element('p', { className: 'chat-text', text: chapter.chat.text }),
    ])),
    element('div', { className: 'chat-bubble chat-own' }, [
      element('p', { className: 'chat-speaker', text: '你' }),
      element('p', { className: 'chat-text', text: state.replyText }),
    ]),
    chapter.finale ? element('p', { className: 'choice-hint', text: '十年回顧即將翻開。' }) : null,
  ]);
}

function optionButton(option, index, onChoose, disabled = false) {
  const lines = (Array.isArray(option.lines) ? option.lines : []).filter((line) => typeof line === 'string' && line.trim().length > 0);
  const buttonNode = element('button', { className: `button button-option${lines.length ? ' option-paper-card' : ''}`, type: 'button', attrs: { 'aria-pressed': 'false' } }, [
    element('strong', { text: option.title }),
    ...lines.flatMap((line, lineIndex) => {
      if (lineIndex !== 0) return [element('span', { className: 'option-lines option-evidence', text: line })];
      const match = line.match(/(\d+(?:\.\d+)?\s*[^\d\s]+)/u);
      if (!match) return [element('span', { className: 'option-lines', text: line })];
      const label = `${line.slice(0, match.index).trim()} ${line.slice(match.index + match[0].length).trim()}`.trim();
      return [
        element('span', { className: 'option-metric', text: match[0] }),
        label ? element('span', { className: 'option-label', text: label }) : null,
      ];
    }),
  ]);
  buttonNode.disabled = disabled;
  if (disabled) buttonNode.classList.add('is-eliminated');
  buttonNode.addEventListener('click', () => {
    audio.play('click');
    state.optionFocus = index;
    buttonNode.setAttribute('aria-pressed', 'true');
    buttonNode.classList.add('is-selected');
    if (currentChapter().game?.type === 'pick') {
      buttonNode.classList.add(index === currentChapter().game.answer ? 'is-correct' : 'is-wrong');
    }
    onChoose(index);
  });
  return buttonNode;
}

function renderGame() {
  const chapter = currentChapter();
  const game = chapter.game;
  if (game.type === 'pick') return renderPick(game);
  if (game.type === 'multi') return renderMulti(game);
  if (game.type === 'slider') return renderSlider(chapter, game);
  if (game.type === 'swipe') return renderSwipe(game);
  if (game.type === 'stop') return renderStop(chapter, game);
  if (game.type === 'agent') return renderAgent(game);
}

function renderPick(game) {
  const options = element('div', { className: `option-grid pick-options count-${game.options.length}` }, game.options.map((option, index) =>
    optionButton(option, index, choosePick, Boolean(state.pickAllowed && !state.pickAllowed.includes(index)))));
  const children = [options, hintButton(), element('p', { className: 'choice-hint keyboard-note', text: '按 1–4 或方向鍵選擇，再按 Enter。' })];
  const numerals = ['二', '三', '四'];
  setPanel(panel, `${chapterLabel(currentChapter(), '小互動')}　・　${numerals[game.options.length - 2] ?? game.options.length}選一`, game.prompt, children);
}

function renderMulti(game) {
  const selected = new Set(state.multiSelection);
  const options = element('div', { className: 'multi-options' }, game.options.map((option, index) => {
    const chosen = selected.has(index);
    const locked = state.hintLockedIndex === index;
    const buttonNode = action('', () => { if (!locked) toggleMultiOption(index); }, 'multi-option', { 'aria-pressed': String(chosen), 'aria-label': option.title });
    buttonNode.append(element('span', { className: 'multi-check', text: chosen ? '✓' : '' }), element('span', { text: option.title }));
    // Node.append() would print a null child as the word "null".
    if (locked) buttonNode.append(element('span', { className: 'locked-hint', text: '前輩提示' }));
    return buttonNode;
  }));
  const countText = gamify.multi.countLabel.replace('{n}', String(state.multiSelection.length));
  setPanel(panel, `${chapterLabel(currentChapter(), '小互動')}　・　${gamify.multi.tag}`, game.prompt, [
    options,
    hintButton(),
    element('div', { className: 'multi-submit' }, [
      element('span', { text: countText, attrs: { 'aria-live': 'polite' } }),
      action(gamify.multi.confirm, submitMulti, 'primary', { disabled: state.multiSelection.length === 0 }),
    ]),
    element('p', { className: 'choice-hint', text: gamify.multi.note }),
  ]);
}

function toggleMultiOption(index) {
  if (state.phase !== 'game' || state.hintLockedIndex === index) return;
  state.multiSelection = state.multiSelection.includes(index)
    ? state.multiSelection.filter((item) => item !== index)
    : [...state.multiSelection, index];
  renderMulti(currentChapter().game);
}

function hintButton() {
  const role = roleFor();
  if (!role.hints || state.hintsLeft <= 0 || state.hintsUsed.includes(state.index)) return null;
  return action(gamify.hint.button.replace('{n}', String(state.hintsLeft)), useHint, 'hint');
}

function useHint() {
  if (state.phase !== 'game' || state.hintsLeft <= 0 || state.hintsUsed.includes(state.index)) return;
  const game = currentChapter().game;
  if (game.type === 'pick') {
    state.pickAllowed = hintPickIndices(game.answer, game.options.length, state.seed ^ state.index);
    state.hintsLeft -= 1;
    state.hintsUsed.push(state.index);
    storeProgress();
    renderPick(game);
  } else if (game.type === 'multi') {
    const answer = hintMultiSelection(game.answers, state.multiSelection);
    if (answer === null) return;
    state.multiSelection = [...state.multiSelection, answer];
    state.hintLockedIndex = answer;
    state.hintsLeft -= 1;
    state.hintsUsed.push(state.index);
    storeProgress();
    renderMulti(game);
  } else if (game.type === 'slider') {
    const range = sliderHintRange(game.min, game.max, game.answer, game.tolerance);
    state.sliderHint = gamify.hint.slider.replace('{low}', `${range.low}${game.unit}`).replace('{high}', `${range.high}${game.unit}`);
    state.hintsLeft -= 1;
    state.hintsUsed.push(state.index);
    storeProgress();
    renderSlider(currentChapter(), game);
  }
}

function choosePick(index) {
  if (state.phase !== 'game') return;
  if (state.pickAllowed && !state.pickAllowed.includes(index)) return;
  const game = currentChapter().game;
  const correct = index === game.answer;
  state.currentResult.correct = correct;
  awardMiniGame(correct);
  if (correct) scene?.celebrateCorrect();
  state.revealCorrect = correct;
  state.revealText = game.reveal;
  scene?.showPickResult(game.answer, index);
  audio.play(correct ? 'correct' : 'wrong');
  statusText(status, correct ? `${gamify.feedback.correct}。` : `${gamify.feedback.wrong}。${gamify.feedback.keepPoints}`);
  setPhase('reveal');
}

function renderSlider(chapter, game) {
  const output = element('p', { className: 'range-value', attrs: { 'aria-live': 'polite' } });
  const number = element('span', { text: String(state.gameValue) });
  output.append(number, element('small', { text: game.unit }));
  const range = element('input', {
    type: 'range', value: state.gameValue, min: game.min, max: game.max, step: game.step,
    attrs: { 'aria-label': game.prompt, 'aria-valuetext': `${state.gameValue}${game.unit}` },
  });
  range.addEventListener('input', () => {
    state.gameValue = Number(range.value);
    number.textContent = String(state.gameValue);
    range.setAttribute('aria-valuetext', `${state.gameValue}${game.unit}`);
    scene?.setSlider(state.gameValue, chapter);
  });
  setPanel(panel, chapterLabel(chapter, '小互動'), game.prompt, [
    element('div', { className: 'range-wrap' }, [output, range]),
    state.sliderHint ? element('p', { className: 'hint-note', text: state.sliderHint }) : null,
    hintButton(),
    action('就這個', submitSlider, 'primary'),
  ]);
}

function submitMulti() {
  if (state.phase !== 'game' || !state.multiSelection.length) return;
  const game = currentChapter().game;
  const answers = new Set(game.answers);
  const correctCount = state.multiSelection.filter((index) => answers.has(index)).length;
  const fullCorrect = correctCount === answers.size && state.multiSelection.length === answers.size;
  const points = applyRoleMultiplier(scoreMultiGame(state.index, {
    correctCount, answerCount: answers.size, fullCorrect,
    remainingSeconds: state.timerRemaining, totalSeconds: state.timerTotal,
    timed: !state.noTimer, timeout: false,
  }), roleFor().scoreMultiplier);
  state.miniAwarded = true;
  stopGameTimer();
  awardPoints(points, { sound: false });
  state.lastAward = points;
  state.currentResult.correct = fullCorrect;
  state.revealCorrect = fullCorrect;
  state.revealText = game.reveal;
  scene?.showMultiResult(game.answers, state.multiSelection);
  if (fullCorrect) scene?.celebrateCorrect(game.answers);
  audio.play(fullCorrect ? 'correct' : 'wrong');
  const feedback = fullCorrect ? gamify.feedback.correct
    : correctCount > 0 ? `${gamify.multi.partial.replace('{n}', String(correctCount))}。${gamify.feedback.keepPoints}`
      : `${gamify.feedback.wrong}。${gamify.feedback.keepPoints}`;
  statusText(status, feedback);
  state.multiFeedback = feedback;
  setPhase('reveal');
}

function submitSlider() {
  if (state.phase !== 'game') return;
  const game = currentChapter().game;
  const correct = sliderIsCorrect(state.gameValue, game.answer, game.tolerance);
  state.currentResult.correct = correct;
  awardMiniGame(correct);
  if (correct) scene?.celebrateCorrect();
  state.revealCorrect = correct;
  state.revealText = game.reveal;
  scene?.revealSlider(game.answer);
  audio.play(correct ? 'correct' : 'wrong');
  setPhase('reveal');
}

function renderSwipe(game) {
  const isScored = Array.isArray(game.answers);
  const cardText = game.cards[state.swipeIndex] ?? '';
  const card = element('div', { className: `swipe-card${state.swipeFeedback ? (state.swipeFeedback === gamify.feedback.correct ? ' is-correct' : ' is-wrong') : ''}`, text: cardText,
    attrs: { role: 'group', 'aria-label': `第 ${state.swipeIndex + 1} 張，共 ${game.cards.length} 張` } });
  const start = { x: 0, id: null };
  card.addEventListener('pointerdown', (event) => {
    start.x = event.clientX;
    start.id = event.pointerId;
    card.setPointerCapture(event.pointerId);
  });
  card.addEventListener('pointerup', (event) => {
    if (start.id !== event.pointerId) return;
    const delta = event.clientX - start.x;
    start.id = null;
    if (Math.abs(delta) > 48) answerSwipe(delta < 0 ? 'left' : 'right');
  });
  const counter = element('p', { className: 'choice-hint', text: `第 ${state.swipeIndex + 1} 張／${game.cards.length}` });
  const feedback = state.swipeFeedback ? element('p', { className: 'choice-hint', text: state.swipeFeedback }) : null;
  const actions = element('div', { className: 'swipe-actions' }, [
    action(game.left, () => answerSwipe('left'), 'secondary', { 'aria-label': `${game.left}，方向鍵左` }),
    action(game.right, () => answerSwipe('right'), 'secondary', { 'aria-label': `${game.right}，方向鍵右` }),
  ]);
  setPanel(panel, chapterLabel(currentChapter(), '小互動'), game.prompt, [
    card,
    counter,
    feedback,
    actions,
    element('p', { className: 'choice-hint', text: isScored ? '左右滑動，立即查看回饋。' : '左右滑動，或使用下方按鈕。' }),
  ]);
}

function answerSwipe(direction) {
  if (state.phase !== 'game' || state.swipePending) return;
  state.swipePending = true;
  const game = currentChapter().game;
  const answer = game.answers?.[state.swipeIndex];
  const correct = answer ? answer === direction : null;
  if (direction === game.countSide) state.swipeCount += 1;
  if (correct) state.swipeCorrect += 1;
  state.swipeFeedback = correct === null ? '' : correct ? gamify.feedback.correct : gamify.feedback.wrong;
  statusText(status, correct === null ? `${game[direction]}。` : correct ? `${gamify.feedback.correct}。` : `${gamify.feedback.wrong}。${gamify.feedback.keepPoints}`);
  audio.play(correct === null ? 'flip' : correct ? 'correct' : 'wrong');
  renderSwipe(game);
  const swipeStage = state.stageCode;
  const finishSwipe = stageGuard.once(swipeStage, () => {
    if (state.phase !== 'game') return;
    state.swipePending = false;
    state.swipeIndex += 1;
    state.swipeFeedback = '';
    if (state.swipeIndex < game.cards.length) {
      scene?.showSwipeCard(game.cards[state.swipeIndex], state.swipeIndex);
      renderSwipe(game);
      return;
    }
    if (game.answers) {
      const gameCorrect = swipeScoreIsCorrect(state.swipeCorrect);
      state.currentResult.correct = gameCorrect;
      awardMiniGame(gameCorrect);
      if (gameCorrect) scene?.celebrateCorrect();
      state.revealCorrect = gameCorrect;
      state.revealText = game.reveal;
    } else {
      state.currentResult.correct = null;
      awardMiniGame(null);
      state.revealCorrect = null;
      state.revealText = game.revealByCount.replace('{n}', String(state.swipeCount));
    }
    setPhase('reveal');
  });
  scene?.swipe(direction, finishSwipe);
}

function renderStop(chapter, game) {
  const report = game.report.start + state.stopTick * game.report.perTick;
  const fresh = game.fresh.start + state.stopTick * game.fresh.perTick;
  const reportBar = element('div', { className: 'meter-fill', attrs: { id: 'report-meter' } });
  const freshBar = element('div', { className: 'meter-fill warning', attrs: { id: 'fresh-meter' } });
  reportBar.style.width = `${Math.min(100, (report / 280) * 100)}%`;
  freshBar.style.width = `${Math.max(0, (fresh / game.fresh.start) * 100)}%`;
  const reportValue = element('span', { className: 'meter-number', text: String(report), attrs: { id: 'report-value' } });
  const freshValue = element('span', { className: 'meter-number', text: `${fresh}${game.fresh.unit}`, attrs: { id: 'fresh-value' } });
  const meters = element('div', { className: 'meters' }, [
    element('div', { className: 'meter-row' }, [element('span', { className: 'meter-label', text: game.report.label }), element('div', { className: 'meter-track' }, reportBar), reportValue]),
    element('div', { className: 'meter-row' }, [element('span', { className: 'meter-label', text: game.fresh.label }), element('div', { className: 'meter-track' }, freshBar), freshValue]),
  ]);
  const control = state.stopStarted
    ? action('停', () => finishStop(true), 'danger', { 'aria-label': '停止自動優化' })
    : action('開始', startStop, 'primary');
  control.classList.add('stop-control');
  const counter = element('p', { className: 'choice-hint', text: state.stopStarted ? `第 ${state.stopTick}／${game.ticks} 格` : '兩條數字一起往前走。' });
  setPanel(panel, chapterLabel(chapter, '小互動'), game.prompt, [meters, counter, control]);
}

function startStop() {
  if (state.stopStarted || state.phase !== 'game') return;
  state.stopStarted = true;
  state.stopTick = 0;
  const stageCode = state.stageCode;
  scene?.updateStop(0);
  renderStop(currentChapter(), currentChapter().game);
  state.stopTimer = window.setInterval(() => {
    if (!stageGuard.isCurrent(stageCode)) { if (state.stopTimer !== null) window.clearInterval(state.stopTimer); state.stopTimer = null; return; }
    if (state.phase !== 'game') { if (state.stopTimer !== null) window.clearInterval(state.stopTimer); state.stopTimer = null; return; }
    if (document.hidden) return;
    state.stopTick += 1;
    const game = currentChapter().game;
    scene?.updateStop(state.stopTick, game);
    updateStopValues(game);
    if (state.stopTick >= game.ticks) finishStop(false);
  }, currentChapter().game.intervalMs);
}

function updateStopValues(game) {
  const report = game.report.start + state.stopTick * game.report.perTick;
  const fresh = Math.max(0, game.fresh.start + state.stopTick * game.fresh.perTick);
  const reportBar = document.querySelector('#report-meter');
  const freshBar = document.querySelector('#fresh-meter');
  const reportValue = document.querySelector('#report-value');
  const freshValue = document.querySelector('#fresh-value');
  if (reportBar) reportBar.style.width = `${Math.min(100, (report / 280) * 100)}%`;
  if (freshBar) freshBar.style.width = `${Math.max(0, (fresh / game.fresh.start) * 100)}%`;
  if (reportValue) reportValue.textContent = String(report);
  if (freshValue) freshValue.textContent = `${fresh}${game.fresh.unit}`;
  const counter = panel.querySelector('.choice-hint');
  if (counter) counter.textContent = `第 ${state.stopTick}／${game.ticks} 格`;
}

function finishStop(stopped) {
  if (state.phase !== 'game' || state.miniAwarded) return;
  const chapter = currentChapter();
  if (state.stopTimer !== null) window.clearInterval(state.stopTimer);
  state.stopTimer = null;
  const game = chapter.game;
  const report = game.report.start + state.stopTick * game.report.perTick;
  const fresh = Math.max(0, game.fresh.start + state.stopTick * game.fresh.perTick);
  state.currentResult.correct = stopped && stopIsCorrect(state.stopTick, game.goodUntilTick);
  awardMiniGame(state.currentResult.correct);
  if (state.currentResult.correct) scene?.celebrateCorrect();
  state.revealCorrect = state.currentResult.correct;
  const template = stopped ? game.revealStopped : game.revealNever;
  state.revealText = `${template.replace('{report}', String(report)).replace('{fresh}', String(fresh))} ${game.reveal}`;
  audio.play(stopped && state.currentResult.correct ? 'correct' : 'wrong');
  setPhase('reveal');
}

function renderAgent(game) {
  const options = element('div', { className: `option-grid${game.options.length === 3 ? ' option-grid-compact' : ''}` }, game.options.map((option, index) => optionButton(option, index, chooseAgent)));
  setPanel(panel, chapterLabel(currentChapter(), '小互動'), game.prompt, [
    options,
    element('p', { className: 'choice-hint', text: '可用方向鍵選擇，再按 Enter。' }),
  ]);
}

function chooseAgent(index) {
  if (state.phase !== 'game') return;
  const game = currentChapter().game;
  state.currentResult.correct = null;
  state.currentResult.agentChoice = index;
  scene?.scanAgent(game.agentPick);
  setPanel(panel, chapterLabel(currentChapter(), '小互動'), game.prompt, [
    element('p', { className: 'result-note', text: 'AI 代理人正在比較…' }),
  ]);
  scheduleStageCallback(() => {
    if (state.phase !== 'game') return;
    scene?.revealAgent(index, game.agentPick);
    state.revealCorrect = null;
    awardMiniGame(null);
    state.revealText = index === game.agentPick ? game.revealSame : game.revealDiff;
    audio.play(index === game.agentPick ? 'correct' : 'flip');
    setPhase('reveal');
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 120 : 800);
}

function renderReveal() {
  const feedbackLine = state.multiFeedback || (state.revealCorrect === true ? gamify.feedback.correct : state.revealCorrect === false
    ? `${state.timerTotal > 0 && state.timerRemaining <= 0 ? gamify.feedback.timeout : gamify.feedback.wrong}。${gamify.feedback.keepPoints}` : '');
  const title = feedbackLine || '互動完成';
  const note = element('p', { className: `result-note${state.revealCorrect === false ? ' is-wrong' : ''}`, text: state.revealText });
  const children = [];
  if (state.currentResult.scored) children.push(element('p', { className: 'sr-only', text: `本次回饋：${feedbackLine || gamify.feedback.correct}` }));
  if (currentChapter().game?.type === 'slider') children.push(renderSliderComparison(currentChapter()));
  children.push(note, action('一句帶走', () => setPhase('takeaway'), 'primary'));
  setPanel(panel, chapterLabel(currentChapter(), '小互動'), title, children);
}

function renderSliderComparison(chapter) {
  const game = chapter.game;
  const percent = (value) => `${((value - game.min) / (game.max - game.min)) * 100}%`;
  const scale = element('div', { className: 'range-scale', attrs: { 'aria-label': `你的猜測 ${state.gameValue}${game.unit}，正解 ${game.answer}${game.unit}` } });
  const guess = element('span', { className: 'range-mark guess', attrs: { style: `left:${percent(state.gameValue)}`, 'data-label': `你 ${state.gameValue}${game.unit}` } });
  const answer = element('span', { className: 'range-mark answer', attrs: { style: `left:${percent(game.answer)}`, 'data-label': `正解 ${game.answer}${game.unit}` } });
  scale.append(guess, answer);
  return element('div', { className: 'range-reveal' }, [
    scale,
    element('div', { className: 'range-legend' }, [
      element('span', { text: `你的猜測　${state.gameValue}${game.unit}` }),
      element('span', { text: `正解　${game.answer}${game.unit}` }),
    ]),
  ]);
}

function renderTakeaway() {
  const chapter = currentChapter();
  ensureChapterRivals(state.index);
  setPanel(panel, chapterLabel(chapter, '一句帶走'), '', [
    element('section', { className: 'paper-card closing-card' }, [
      element('div', { className: 'paper-kicker' }, [element('span', { text: roleConfig.labels.closing.replace('{year}', String(chapter.year)) }), element('span', { className: 'closing-tag', text: roleConfig.labels.takeawayTag })]),
      element('p', { className: 'takeaway', text: chapter.takeaway }),
      element('div', { className: 'book-note' }, [
        element('strong', { text: '翻書' }),
        element('span', { text: chapter.book }),
        element('span', { text: chapter.source }),
      ]),
    ]),
    element('div', { className: 'tenure-progress' }, [
      element('span', { text: roleConfig.labels.tenure.replace('{n}', String(state.index + 1)) }),
      element('div', {}, Array.from({ length: 10 }, (_, index) => element('span', { className: index <= state.index ? 'is-done' : '' }))),
    ]),
    renderLeaderboard(),
    action(state.index === 8 ? roleConfig.labels.enterYear.replace('{year}', '快問快答') : roleConfig.labels.enterYear.replace('{year}', String(chapter.year + 1)), nextChapter, 'primary'),
  ]);
}

function currentRanks() {
  return rankTeams({ [state.team ?? gamify.teams[0]]: state.score, ...state.rivalScores });
}

function ensureChapterRivals(index) {
  if (state.rivalAwarded.includes(index)) return;
  const before = Object.fromEntries(currentRanks().map((team) => [team.name, team.rank]));
  for (let rival = 0; rival < gamify.rivals.length; rival += 1) {
    const name = gamify.rivals[rival].name;
    state.rivalScores[name] = (state.rivalScores[name] ?? 0) + rivalChapterAward(rival, index, state.seed, !state.noTimer);
  }
  state.rivalAwarded.push(index);
  state.previousRanks = before;
  state.rankChanges = Object.fromEntries(currentRanks().map((team) => [team.name, (before[team.name] ?? team.rank) - team.rank]));
  storeProgress();
}

function ensureQuickRivals() {
  if (state.quickRivalsAwarded) return;
  const before = Object.fromEntries(currentRanks().map((team) => [team.name, team.rank]));
  for (let rival = 0; rival < gamify.rivals.length; rival += 1) {
    const name = gamify.rivals[rival].name;
    state.rivalScores[name] = (state.rivalScores[name] ?? 0) + rivalQuickAward(rival, state.seed);
  }
  state.quickRivalsAwarded = true;
  state.previousRanks = before;
  state.rankChanges = Object.fromEntries(currentRanks().map((team) => [team.name, (before[team.name] ?? team.rank) - team.rank]));
  storeProgress();
}

function renderLeaderboard() {
  const rows = currentRanks();
  return element('section', { className: 'leaderboard', attrs: { 'aria-label': gamify.boardTitle } }, [
    element('h2', { className: 'leaderboard-title', text: gamify.boardTitle }),
    ...rows.map((team) => {
      const movement = state.rankChanges[team.name] ?? 0;
      const arrow = movement > 0 ? '▲' : movement < 0 ? '▼' : '→';
      return element('div', { className: `leaderboard-row${team.name === state.team ? ' is-player' : ''}`, attrs: { 'aria-label': `${team.rank} 名，${team.name}，${team.score} 分` } }, [
        element('strong', { className: 'leaderboard-rank', text: String(team.rank) }),
        element('span', { className: 'leaderboard-name', text: team.name }),
        element('span', { className: 'leaderboard-score', text: team.score.toLocaleString('zh-TW') }),
        element('span', { className: `rank-move${movement ? ' has-moved' : ''}`, text: arrow, attrs: { 'aria-label': movement ? `名次${movement > 0 ? '上升' : '下降'}` : '名次不變' } }),
      ]);
    }),
  ]);
}

function nextChapter() {
  if (state.currentResult) state.results.push(state.currentResult);
  if (state.index === 8) {
    movePhase('quick-intro');
    storeProgress();
    render();
  } else {
    if (state.index < content.chapters.length - 1) state.index += 1;
    storeProgress();
    audio.play('flip');
    enterChapter(true);
  }
}

function showQuickIntro() {
  setPanel(panel, '第九章之後', gamify.quick.title, [
    element('p', { className: 'panel-copy', text: gamify.quick.intro }),
    action('開始快問快答', startQuickRound, 'primary'),
  ], 'open');
}

function startQuickRound() {
  state.quickIndex = 0;
  state.quickCorrectCount = 0;
  state.quickAnswered = false;
  renderQuickQuestion();
  startQuickTimer();
}

function renderQuickQuestion() {
  const question = gamify.quick.questions[state.quickIndex];
  state.quickAnswered = false;
  beginStage('quick');
  scene?.scanQuickQuestion(state.quickIndex);
  setPanel(panel, `${gamify.quick.title}　${state.quickIndex + 1}／${gamify.quick.questions.length}`, question.q, [
    element('div', { className: `option-grid quick-options count-${question.options.length}` }, question.options.map((option, index) => action(`${index + 1}. ${option}`, () => answerQuick(index), 'option'))),
    element('p', { className: 'choice-hint', text: `按 1–${question.options.length} 或方向鍵作答。` }),
  ]);
  renderQuickTimer();
}

function startQuickTimer() {
  stopQuickTimer();
  if (state.noTimer) { state.quickRemaining = gamify.scoring.quickSeconds; return; }
  state.quickRemaining = gamify.scoring.quickSeconds;
  const startedAt = performance.now();
  const stageCode = state.stageCode;
  state.quickInterval = window.setInterval(() => {
    if (!stageGuard.isCurrent(stageCode)) { stopQuickTimer(); return; }
    if (state.phase !== 'quick' || state.quickAnswered) { stopQuickTimer(); return; }
    state.quickRemaining = Math.max(0, gamify.scoring.quickSeconds - (performance.now() - startedAt) / 1000);
    renderQuickTimer();
    if (state.quickRemaining <= 0) answerQuick(-1, true);
  }, 100);
  renderQuickTimer();
}

function renderQuickTimer() {
  const old = panel.querySelector('.timer-indicator');
  if (old) old.remove();
  if (state.noTimer || state.phase !== 'quick' || state.quickAnswered) return;
  const total = gamify.scoring.quickSeconds;
  const timer = element('div', { className: `timer-indicator${state.quickRemaining <= 3 ? ' is-warning' : ''}`, attrs: { role: 'timer', 'aria-label': `剩餘 ${Math.ceil(state.quickRemaining)} 秒` } }, [
    element('span', { className: 'timer-track' }, element('span', { className: 'timer-fill' })),
    element('strong', { text: `${Math.ceil(state.quickRemaining)} 秒` }),
  ]);
  timer.querySelector('.timer-fill').style.transform = `scaleX(${Math.max(0, state.quickRemaining / total)})`;
  panel.insertBefore(timer, panel.querySelector('.panel-title')?.nextSibling ?? panel.firstChild);
}

function stopQuickTimer() {
  if (state.quickInterval !== null) window.clearInterval(state.quickInterval);
  state.quickInterval = null;
}

function answerQuick(index, timeout = false) {
  if (state.phase !== 'quick' || state.quickAnswered) return;
  state.quickAnswered = true;
  stopQuickTimer();
  const question = gamify.quick.questions[state.quickIndex];
  const correct = !timeout && index === question.answer;
  if (correct) state.quickCorrectCount += 1;
  const points = scoreQuick(correct);
  awardPoints(points, { sound: false });
  audio.play(correct ? 'correct' : 'wrong');
  state.quickLastFeedback = timeout
    ? `${gamify.feedback.timeout}。${gamify.feedback.keepPoints}`
    : correct ? gamify.feedback.correct : `${gamify.feedback.wrong}。${gamify.feedback.keepPoints}`;
  movePhase('quick-feedback');
  setPanel(panel, `${gamify.quick.title}　${state.quickIndex + 1}／${gamify.quick.questions.length}`, '', [
    element('p', { className: `result-note${correct ? '' : ' is-wrong'}`, text: state.quickLastFeedback }),
    element('p', { className: 'choice-hint', text: `+${points.toLocaleString('zh-TW')} 分` }),
  ]);
  scheduleStageCallback(() => {
    if (state.phase !== 'quick-feedback') return;
    state.quickIndex += 1;
    if (state.quickIndex < gamify.quick.questions.length) {
      renderQuickQuestion();
      startQuickTimer();
    } else {
      ensureQuickRivals();
      movePhase('quick-board');
      render();
    }
  }, 900);
}

function showQuickBoard() {
  setPanel(panel, '終局快問快答', '', [
    element('p', { className: 'result-note', text: `六題完成，${gamify.feedback.correct} ${state.quickCorrectCount} 題。` }),
    renderLeaderboard(),
    action('進入終章', () => {
      state.index = 9;
      movePhase('chat');
      state.currentResult = null;
      state.replyText = '';
      state.miniAwarded = true;
      storeProgress();
      scene?.setChapter(content.chapters[9], 9, true);
      updateProgress(progress, 9, true);
      render();
    }, 'primary'),
  ]);
}

function renderPersona() {
  const results = allResults();
  const totals = getRunTotals(results);
  const finalRanks = currentRanks();
  const place = finalRanks.findIndex((team) => team.name === state.team) + 1;
  saveBestScore(state.score);
  const id = personaId(totals.score, totals.perf);
  const persona = content.personas.find((entry) => entry.id === id);
  const perfPosition = `${(1 - totals.perf / 10) * 100}%`;
  const axis = element('div', { className: 'axis', attrs: { 'aria-label': `十次回覆中有 ${totals.perf} 次偏績效` } });
  const marker = element('span', { className: 'axis-marker', attrs: { style: `--position:${perfPosition}` } });
  axis.append(marker);
  const reviewCells = content.chapters.map((chapter, index) => {
    const result = results[index];
    const tendency = result?.lean === 'perf' ? ['績', 'review-perf'] : result?.lean === 'brand' ? ['品', 'review-brand'] : ['·', ''];
    const outcome = result?.scored ? (result.correct ? '✓' : '×') : result ? '●' : '·';
    return element('div', { className: 'review-cell', attrs: { 'aria-label': `${chapter.year}，${result?.lean === 'perf' ? '績效傾向' : result?.lean === 'brand' ? '品牌傾向' : '無紀錄'}，互動${result?.scored ? result.correct ? gamify.feedback.correct : gamify.feedback.wrong : '體驗完成'}` } }, [
      element('strong', { text: String(chapter.year) }),
      element('span', { className: tendency[1], text: `${tendency[0]}　${outcome}` }),
    ]);
  });
  const card = element('section', { className: 'paper-card review-paper' }, [
    element('div', { className: 'paper-kicker' }, [element('span', { text: roleConfig.labels.review }), element('span', { text: roleConfig.labels.reviewNo })]),
    element('div', { className: 'review-identity' }, [
      renderAvatarSilhouette('identity-avatar review-avatar'),
      element('div', {}, [
        element('span', { className: 'review-role', text: `${roleFor().name}・${state.team}` }),
        element('h2', { text: persona.name }),
      ]),
    ]),
    element('div', { className: 'review-summary' }, [
      element('div', {}, [element('span', { text: roleConfig.labels.total }), element('strong', { text: state.score.toLocaleString('zh-TW') })]),
      element('div', {}, [element('span', { text: roleConfig.labels.rank }), element('strong', { text: `${place}／3` })]),
      element('div', {}, [element('span', { text: roleConfig.labels.tenureLabel }), element('strong', { text: roleConfig.labels.tenureValue })]),
    ]),
    element('dl', { className: 'review-traits' }, [
      element('dt', { text: roleConfig.labels.strength }), element('dd', { text: persona.strength }),
      element('dt', { text: roleConfig.labels.blind }), element('dd', { text: persona.blind }),
    ]),
    element('p', { className: 'read-note' }, [element('strong', { text: '先讀這篇' }), element('span', { text: persona.read })]),
  ]);
  const summary = element('div', { className: 'review-side' }, [
    element('p', { className: 'final-rank-line', text: `${gamify.rankLines[place - 1]}　${state.score.toLocaleString('zh-TW')} 分` }),
    slowWalkLink(),
    renderLeaderboard(),
    element('div', { className: 'persona-stats' }, [
      element('strong', { className: 'score', text: `互動正解 ${totals.score} 次` }),
      element('div', {}, [axis, element('div', { className: 'axis-labels' }, [element('span', { text: '績效' }), element('span', { text: '品牌' })])]),
    ]),
    element('div', { className: 'review-grid', attrs: { 'aria-label': '十年回顧' } }, reviewCells),
    element('div', { className: 'result-actions' }, [action(roleConfig.labels.replay, replay, 'primary'), action('複製結果', copyResult, 'secondary')]),
  ]);
  setPanel(panel, roleConfig.labels.reviewTitle, '', [element('div', { className: 'review-layout' }, [card, summary])], 'open');
  statusText(status, `你的結果是${persona.name}，識破 ${totals.score} / 7。`);
}

function saveBestScore(score) {
  try {
    const best = Number(localStorage.getItem('decision-ten-years-best'));
    if (!Number.isFinite(best) || score > best) localStorage.setItem('decision-ten-years-best', String(score));
  } catch { /* The final result remains visible without local storage. */ }
}

function replay() {
  stopQuickTimer();
  stopGameTimer();
  if (state.stopTimer !== null) window.clearInterval(state.stopTimer);
  state.stopTimer = null;
  state.index = 0;
  state.results = [];
  state.team = null;
  state.roleSelection = roleConfig.defaultRole;
  state.role = roleConfig.defaultRole;
  state.hintsLeft = roleFor(roleConfig.defaultRole).hints;
  state.hintsUsed = [];
  state.score = 0;
  state.seed = newSeed();
  state.noTimer = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  state.rivalScores = Object.fromEntries(gamify.rivals.map((rival) => [rival.name, 0]));
  state.rivalAwarded = [];
  state.quickRivalsAwarded = false;
  state.rankChanges = {};
  state.quickCorrectCount = 0;
  state.currentResult = null;
  movePhase('intro');
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* Game can restart without storage. */ }
  // A full reload is the only reset that also clears the finale objects left in the 3D scene.
  window.location.replace(window.location.pathname);
}

function copyResult() {
  const results = allResults();
  const totals = getRunTotals(results);
  const persona = content.personas.find((entry) => entry.id === personaId(totals.score, totals.perf));
  const place = currentRanks().findIndex((team) => team.name === state.team) + 1;
  navigator.clipboard?.writeText(`${roleFor().name}｜${state.team}｜${state.score.toLocaleString('zh-TW')} 分｜第 ${place} 名｜${persona.name}｜${persona.strength}`).catch(() => {});
}

function render() {
  teamScore.hidden = !state.team || ['intro', 'role', 'team'].includes(state.phase);
  employeeBadge.hidden = !state.team || ['intro', 'team', 'role'].includes(state.phase);
  roleMultiplier.hidden = employeeBadge.hidden || roleFor().scoreMultiplier === 1;
  employeeBadge.textContent = `${'▮'.repeat(roleFor().level)}${'▯'.repeat(roleConfig.maxLevel - roleFor().level)}　${roleFor().name}・${state.team ?? ''}`;
  if (!roleMultiplier.hidden) roleMultiplier.textContent = `身份 ×${roleFor().scoreMultiplier}`;
  if (!teamScore.hidden && !state.scoreAnimating) teamScore.textContent = `${state.score.toLocaleString('zh-TW')} 分`;
  syncLayout();
  if (state.phase === 'mode') return renderModeChoice(panel, enterSoloMode, enterSquadMode);
  if (state.squadMode) {
    teamScore.hidden = !squadRoom;
    employeeBadge.hidden = true;
    roleMultiplier.hidden = true;
    progress.hidden = !squadRoom || squadRoom.phase === 'lobby';
    return renderSquadScreen({ panel, room: squadRoom, seat: squadSeat, client: squadClient, callbacks: squadCallbacks(), error: squadError, entryDefaults: squadDefaults, status, connectionText: squadOffline ? squadContent.labels.offline : squadStatus === 'reconnecting' ? squadContent.labels.reconnecting : '' });
  }
  if (state.phase === 'intro') return showIntro();
  if (state.phase === 'role') return renderRoleSelection();
  if (state.phase === 'team') return showTeamSelection();
  if (state.phase === 'warmup') return showWarmup();
  if (state.phase === 'warmup-result') return showWarmupResult();
  if (state.phase === 'chat') return renderChat();
  if (state.phase === 'game') { renderGame(); renderTimerIndicator(); return; }
  if (state.phase === 'reveal') return renderReveal();
  if (state.phase === 'takeaway') return renderTakeaway();
  if (state.phase === 'quick-intro') return showQuickIntro();
  if (state.phase === 'quick-board') return showQuickBoard();
  if (state.phase === 'persona') return renderPersona();
}

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (state.phase === 'quick' && !state.quickAnswered) {
    const answer = event.key === 'ArrowLeft' ? 0 : event.key === 'ArrowRight' ? 1 : /^[1-3]$/.test(event.key) ? Number(event.key) - 1 : -1;
    if (answer >= 0) {
      event.preventDefault();
      answerQuick(answer);
    }
    return;
  }
  if (state.phase === 'chat' && /^[1-4]$/.test(event.key)) {
    event.preventDefault();
    selectReply(Number(event.key) - 1);
    return;
  }
  if (state.phase !== 'game') return;
  const game = currentChapter().game;
  if (game.type === 'multi' && /^[1-4]$/.test(event.key)) {
    const buttonNode = panel.querySelectorAll('.multi-option')[Number(event.key) - 1];
    if (buttonNode && !buttonNode.disabled) { event.preventDefault(); buttonNode.click(); }
  } else if ((game.type === 'pick' || game.type === 'agent') && /^[1-4]$/.test(event.key)) {
    event.preventDefault();
    const index = Number(event.key) - 1;
    if (game.type === 'pick') choosePick(index);
    else chooseAgent(index);
  } else if ((game.type === 'pick' || game.type === 'agent') && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    const options = panel.querySelectorAll('.button-option');
    if (!options.length) return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    state.optionFocus = (state.optionFocus + direction + options.length) % options.length;
    options[state.optionFocus].focus();
  } else if (game.type === 'swipe' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    answerSwipe(event.key === 'ArrowLeft' ? 'left' : 'right');
  } else if (game.type === 'stop' && event.code === 'Space' && state.stopStarted) {
    event.preventDefault();
    finishStop(true);
  } else if ((event.key === 'Enter' || event.code === 'Space') && document.activeElement === canvas) {
    event.preventDefault();
    if (game.type === 'pick') choosePick(state.optionFocus);
    else if (game.type === 'agent') chooseAgent(state.optionFocus);
    else if (game.type === 'slider') submitSlider();
    else if (game.type === 'stop' && state.stopStarted) finishStop(true);
  }
});

document.addEventListener('visibilitychange', () => audio.visibilityChanged());
scene = new GameScene(canvas, fallback, {
  panel,
  onPick: (index) => {
    if (state.phase !== 'game') return;
    if (currentChapter().game.type === 'agent') chooseAgent(index);
    else if (currentChapter().game.type === 'multi') toggleMultiOption(index);
    else choosePick(index);
  },
  onSwipe: (direction) => answerSwipe(direction),
  onStop: () => { if (state.phase === 'game' && state.stopStarted) finishStop(true); },
});
scene.setChapter(currentChapter(), state.index, false);
if (shortcut.get('debug') === '1') {
  window.__scene = scene;
  window.__scene.renderNow = () => scene.renderer?.render(scene.scene, scene.camera);
}
render();
if (shortcutToGame) startGameTimer();
if (shortcut.get('room') || (!hasChapterShortcut && shortcut.get('squad') !== 'local' && readSquadSession()?.token)) enterSquadMode();
if (shortcut.get('squad') === 'local') {
  state.squadMode = true;
  state.phase = 'squad';
  const requestedChapter = Number(shortcut.get('c'));
  const chapterIndex = Number.isInteger(requestedChapter) ? Math.max(0, Math.min(9, requestedChapter - 1)) : 0;
  let room = createSquadRoom({ seed: newSeed(), hostName: '你', hostDuty: 'data' });
  room = applySquadAction(room, { type: 'start', seat: 0 }, Date.now());
  room.chapter = chapterIndex;
  room.captainSeat = chapterIndex % 4;
  installSquadClient({ mode: 'local', room, seat: 0 });
}
