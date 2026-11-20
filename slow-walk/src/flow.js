import content from '../content/content.js';

const START_X = 640;
const LAST_CHAPTER = content.chapters.length;

function emptyProgress() {
  return { v: 1, resume: 1, farthest: 1, results: {}, done: false, muted: false };
}

function isRecord(value) {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isChapter(value) {
  return Number.isInteger(value) && value >= 1 && value <= LAST_CHAPTER;
}

function chapterContent(chapter) {
  return content.chapters[chapter - 1];
}

function validReply(index, chapter) {
  return Number.isInteger(index) && index >= 0 && index < chapterContent(chapter).chat.replies.length;
}

export function createProgress(raw) {
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return emptyProgress();
    }
  }
  if (!isRecord(raw) || raw.v !== 1 || !isChapter(raw.resume) || !isChapter(raw.farthest)
    || raw.resume > raw.farthest || !isRecord(raw.results)
    || typeof raw.done !== 'boolean' || typeof raw.muted !== 'boolean') {
    return emptyProgress();
  }

  const results = {};
  for (const [key, result] of Object.entries(raw.results)) {
    const chapter = Number(key);
    if (!isChapter(chapter) || key !== String(chapter) || !isRecord(result)) return emptyProgress();

    const { lean, perf, correct, input } = result;
    const scored = chapterContent(chapter).game?.scored === true;
    const validCorrect = scored ? typeof correct === 'boolean' : correct === null;
    if ((lean !== 'perf' && lean !== 'brand') || !Number.isFinite(perf) || !validCorrect
      || !isRecord(input) || !validReply(input.reply, chapter)) return emptyProgress();

    results[key] = { lean, perf, correct, input: { ...input } };
  }

  return { v: 1, resume: raw.resume, farthest: raw.farthest, results, done: raw.done, muted: raw.muted };
}

export function createFlowState(progress = createProgress()) {
  return {
    phase: progress.done ? 'persona' : 'title',
    chapter: progress.resume,
    x: START_X,
    progress,
    pending: null,
    menuOpen: false,
    revision: 0,
  };
}

function enter(state, phase, changes = {}, effect = null) {
  return { state: { ...state, ...changes, phase, revision: state.revision + 1 }, effect };
}

function enterChapter(state, chapter) {
  return enter(state, 'card', { chapter, x: START_X, pending: null, menuOpen: false });
}

export function transitionFlow(state, action) {
  const unchanged = { state, effect: null };
  if (!action || (action.revision !== undefined && action.revision !== state.revision)) return unchanged;

  switch (action.type) {
    case 'OPEN_MENU':
      return state.menuOpen ? unchanged : { state: { ...state, menuOpen: true, revision: state.revision + 1 }, effect: null };
    case 'CLOSE_MENU':
      return state.menuOpen ? { state: { ...state, menuOpen: false, revision: state.revision + 1 }, effect: null } : unchanged;
    case 'SELECT_CHAPTER':
      if (!state.menuOpen || !isChapter(action.chapter) || action.chapter > state.progress.farthest) return unchanged;
      return enterChapter(state, action.chapter);
    case 'SET_MUTED': {
      const muted = action.muted;
      if (typeof muted !== 'boolean' || muted === state.progress.muted) return unchanged;
      const progress = { ...state.progress, muted };
      return { state: { ...state, progress }, effect: { type: 'mute', value: muted } };
    }
    case 'RESTART':
      return enter(state, 'title', createFlowState(), { type: 'clear' });
  }

  if (state.menuOpen) return unchanged;

  const chapter = chapterContent(state.chapter);
  switch (action.type) {
    case 'BEGIN':
      if (state.phase !== 'title') return unchanged;
      if (state.progress.done) return enter(state, 'persona');
      return enterChapter(state, state.progress.resume);
    case 'CARD_DONE':
      return state.phase === 'card' ? enter(state, 'walk1') : unchanged;
    case 'MOVE': {
      const { delta, stopAt, next } = action;
      const afterWalk = chapter.game ? 'game' : 'takeaway';
      const validNext = (state.phase === 'walk1' && next === 'chat') || (state.phase === 'walk2' && next === afterWalk);
      if (!validNext || !Number.isFinite(delta) || delta <= 0 || !Number.isFinite(stopAt) || stopAt < state.x) return unchanged;

      const x = Math.min(state.x + delta, stopAt);
      return x === stopAt ? enter(state, next, { x }) : { state: { ...state, x }, effect: null };
    }
    case 'REPLY': {
      const index = action.index;
      if (state.phase !== 'chat' || !validReply(index, state.chapter)) return unchanged;
      const { lean, perf } = chapter.chat.replies[index];
      const pending = { lean, perf, correct: null, input: { reply: index } };
      return enter(state, 'walk2', { pending });
    }
    case 'GAME_RESULT': {
      if (state.phase !== 'game' || !chapter.game || !state.pending || !isRecord(action.input)) return unchanged;
      if (chapter.game.scored && typeof action.correct !== 'boolean') return unchanged;
      const correct = chapter.game.scored ? action.correct : null;
      const input = { ...action.input, reply: state.pending.input.reply };
      return enter(state, 'reveal', { pending: { ...state.pending, correct, input } });
    }
    case 'CONTINUE_REVEAL':
      return state.phase === 'reveal' ? enter(state, 'takeaway') : unchanged;
    case 'CONTINUE_TAKEAWAY': {
      if (state.phase !== 'takeaway' || !state.pending) return unchanged;
      const finalChapter = state.chapter === LAST_CHAPTER;
      const nextChapter = finalChapter ? LAST_CHAPTER : state.chapter + 1;
      const progress = {
        ...state.progress,
        resume: Math.max(state.progress.resume, nextChapter),
        farthest: Math.max(state.progress.farthest, nextChapter),
        results: { ...state.progress.results, [state.chapter]: state.pending },
        done: state.progress.done || finalChapter,
      };
      const effect = { type: 'persist', value: progress };
      const phase = finalChapter ? 'persona' : 'depart';
      return enter(state, phase, { progress, pending: null }, effect);
    }
    case 'DEPART_DONE':
      return state.phase === 'depart' ? enterChapter(state, state.progress.resume) : unchanged;
    default:
      return unchanged;
  }
}
