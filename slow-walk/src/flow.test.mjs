import assert from 'node:assert/strict';
import test from 'node:test';
import content from '../content/content.js';
import roadside from '../content/roadside.js';
import { createFlowState, createProgress, transitionFlow } from './flow.js';

function step(state, type, fields = {}) {
  const result = transitionFlow(state, { type, ...fields });
  assert.equal(result.effect, null, type);
  return result.state;
}

function walkToReply(state) {
  state = step(state, 'BEGIN');
  state = step(state, 'CARD_DONE');
  return step(state, 'MOVE', { delta: 400, stopAt: 960, next: 'chat' });
}

function finishGame(state, { index = 0, input = {}, correct = true } = {}) {
  state = step(state, 'REPLY', { index });
  state = finishQuiz(state);
  state = step(state, 'MOVE', { delta: 500, stopAt: 1400, next: 'game' });
  state = step(state, 'GAME_RESULT', { input, correct });
  return step(state, 'CONTINUE_REVEAL');
}

function finishQuiz(state) {
  state = step(state, 'MOVE', { delta: 500, stopAt: 1180, next: 'quiz' });
  state = step(state, 'QUIZ_RESULT', { index: roadside[state.chapter - 1].answer });
  return step(state, 'CONTINUE_QUIZ');
}

test('a chapter commits the result and advancement together on takeaway continue', () => {
  const progress = createProgress();
  let state = createFlowState(progress);
  assert.deepEqual(state, { phase: 'title', chapter: 1, x: 640, progress, pending: null, menuOpen: false, revision: 0 });

  state = walkToReply(state);
  assert.equal(state.phase, 'chat');
  state = finishGame(state, { index: 1, input: { choice: 2 } });
  assert.equal(state.phase, 'takeaway');
  assert.equal(state.progress, progress);
  assert.deepEqual(state.progress.results, {});
  assert.deepEqual(state.pending, { lean: 'perf', perf: 0.7, correct: true, input: { reply: 1, choice: 2 }, quiz: true });

  const committed = transitionFlow(state, { type: 'CONTINUE_TAKEAWAY' });
  assert.deepEqual(committed.effect, {
    type: 'persist',
    value: { ...progress, resume: 2, farthest: 2, results: { 1: state.pending } },
  });
  assert.equal(committed.state.progress, committed.effect.value);
  assert.equal(committed.state.phase, 'depart');
  assert.equal(committed.state.pending, null);
  assert.equal(step(committed.state, 'CONTINUE_TAKEAWAY'), committed.state);

  const next = step(committed.state, 'DEPART_DONE');
  assert.equal(next.phase, 'card');
  assert.equal(next.chapter, 2);
  assert.equal(next.x, 640);
});

test('refresh resumes the saved chapter from its beginning and discards pending results', () => {
  const first = finishGame(walkToReply(createFlowState()));
  const { effect, state: departed } = transitionFlow(first, { type: 'CONTINUE_TAKEAWAY' });
  let state = step(departed, 'DEPART_DONE');
  state = step(state, 'CARD_DONE');
  state = step(state, 'MOVE', { delta: 400, stopAt: 960, next: 'chat' });
  state = finishGame(state, { index: 2, input: { guess: 9 }, correct: false });
  assert.ok(state.pending);

  const restored = createFlowState(createProgress(JSON.stringify(effect.value)));
  assert.equal(restored.phase, 'title');
  assert.equal(restored.chapter, 2);
  assert.equal(restored.pending, null);
  assert.deepEqual(Object.keys(restored.progress.results), ['1']);
  assert.equal(step(restored, 'BEGIN').phase, 'card');
});

test('replaying a chapter preserves saved progress until the replacement is committed', () => {
  const old = { lean: 'perf', perf: 1, correct: true, input: { reply: 0, choice: 2 } };
  const other = { lean: 'brand', perf: 0.3, correct: true, input: { reply: 2, guess: 4 } };
  const progress = createProgress({ ...createProgress(), resume: 3, farthest: 3, results: { 1: old, 2: other } });
  let state = walkToReply(createFlowState(progress));
  state = step(state, 'REPLY', { index: 0 });
  state = step(state, 'OPEN_MENU');
  state = step(state, 'SELECT_CHAPTER', { chapter: 1 });
  assert.equal(state.phase, 'card');
  assert.equal(state.chapter, 1);
  assert.equal(state.pending, null);
  assert.equal(state.menuOpen, false);
  assert.equal(state.progress, progress);

  state = step(state, 'CARD_DONE');
  state = step(state, 'MOVE', { delta: 400, stopAt: 960, next: 'chat' });
  state = finishGame(state, { index: 3, input: { choice: 0 }, correct: false });
  assert.deepEqual(state.progress.results[1], old);
  assert.deepEqual(state.progress.results[2], other);

  const { state: departed, effect } = transitionFlow(state, { type: 'CONTINUE_TAKEAWAY' });
  assert.deepEqual(effect.value.results, {
    1: { lean: 'brand', perf: 0, correct: false, input: { reply: 3, choice: 0 }, quiz: true },
    2: other,
  });
  assert.equal(effect.value.resume, 3);
  assert.equal(effect.value.farthest, 3);
  assert.equal(step(departed, 'DEPART_DONE').chapter, 3);
});

test('the finale reaches persona by way of the family doorstep and saves completion', () => {
  const progress = createProgress({ ...createProgress(), resume: 10, farthest: 10 });
  let state = createFlowState(progress);
  const phases = [];
  for (const [type, fields] of [
    ['BEGIN'],
    ['CARD_DONE'],
    ['MOVE', { delta: 400, stopAt: 960, next: 'chat' }],
    ['REPLY', { index: 1 }],
    ['MOVE', { delta: 400, stopAt: 1180, next: 'quiz' }],
    ['QUIZ_RESULT', { index: roadside[9].answer }],
    ['CONTINUE_QUIZ'],
    ['MOVE', { delta: 400, stopAt: 1200, next: 'takeaway' }],
  ]) {
    state = step(state, type, fields);
    phases.push(state.phase);
  }
  assert.equal(step(state, 'GAME_RESULT', { input: {}, correct: true }), state);
  assert.equal(step(state, 'CONTINUE_REVEAL'), state);

  const completed = transitionFlow(state, { type: 'CONTINUE_TAKEAWAY' });
  phases.push(completed.state.phase);
  assert.deepEqual(phases, ['card', 'walk1', 'chat', 'walk2', 'quiz', 'quiz', 'walk2', 'takeaway', 'persona']);
  assert.deepEqual(completed.effect, {
    type: 'persist',
    value: {
      ...progress, done: true,
      results: { 10: { lean: 'perf', perf: 0.7, correct: null, input: { reply: 1 }, quiz: true } },
    },
  });
  const restored = createFlowState(createProgress(JSON.stringify(completed.effect.value)));
  assert.equal(restored.phase, 'persona');
  assert.equal(restored.chapter, 10);
  assert.equal(step(restored, 'DEPART_DONE'), restored);

  const restarted = transitionFlow(completed.state, { type: 'RESTART' });
  assert.deepEqual(restarted.state, { ...createFlowState(), revision: completed.state.revision + 1 });
  assert.deepEqual(restarted.effect, { type: 'clear' });
});

test('menu selection rejects locked, out-of-range, and malformed chapter numbers', () => {
  let state = createFlowState(createProgress({ ...createProgress(), resume: 3, farthest: 4 }));
  assert.equal(step(state, 'SELECT_CHAPTER', { chapter: 1 }), state);
  state = step(state, 'OPEN_MENU');
  for (const chapter of [0, 5, 11, 1.5, '2', NaN]) {
    assert.equal(step(state, 'SELECT_CHAPTER', { chapter }), state);
  }
  assert.equal(step(state, 'BEGIN'), state);
  assert.equal(step(state, 'CLOSE_MENU').menuOpen, false);
  const selected = step(state, 'SELECT_CHAPTER', { chapter: 4 });
  assert.equal(selected.chapter, 4);
  assert.equal(selected.progress, state.progress);
});

test('progress resets when its version, fields, or result records are unrecognizable', () => {
  const blank = createProgress();
  for (const invalid of [
    null, '{broken', [], { ...blank, v: 2 }, { ...blank, resume: 11 },
    { ...blank, resume: 2, farthest: 1 }, { ...blank, muted: 'false' },
    { ...blank, results: [] }, { ...blank, results: { 1: null } },
    { ...blank, results: { '01': { lean: 'perf', perf: 1, correct: true, input: { reply: 0 } } } },
    { ...blank, results: { 1: { lean: 'perf', perf: 1, correct: null, input: { reply: 0 } } } },
  ]) {
    assert.deepEqual(createProgress(invalid), blank);
  }
});

test('mute is independent of committing an in-progress result', () => {
  const takeaway = finishGame(walkToReply(createFlowState()));
  const muted = transitionFlow(takeaway, { type: 'SET_MUTED', muted: true });
  assert.deepEqual(muted.effect, { type: 'mute', value: true });
  assert.equal(muted.state.progress.muted, true);
  assert.equal(muted.state.progress.results, takeaway.progress.results);
  assert.equal(muted.state.pending, takeaway.pending);
  assert.equal(muted.state.revision, takeaway.revision);
  assert.equal(step(muted.state, 'SET_MUTED', { muted: true }), muted.state);
  assert.equal(step(muted.state, 'SET_MUTED', { muted: 'false' }), muted.state);

  const committed = transitionFlow(muted.state, { type: 'CONTINUE_TAKEAWAY' });
  assert.equal(committed.effect.value.muted, true);
  assert.equal(committed.effect.value.results[1], takeaway.pending);
});

test('walking clamps to the target and stage revisions reject stale callbacks', () => {
  const card = step(createFlowState(), 'BEGIN');
  assert.equal(step(card, 'CARD_DONE', { revision: 0 }), card);
  const walk = step(card, 'CARD_DONE', { revision: card.revision });
  const progress = step(walk, 'MOVE', { delta: 100, stopAt: 960, next: 'chat' });
  assert.equal(progress.x, 740);
  assert.equal(progress.phase, 'walk1');
  assert.equal(progress.revision, walk.revision);
  assert.equal(step(progress, 'MOVE', { delta: -1, stopAt: 960, next: 'chat' }), progress);
  assert.equal(step(progress, 'MOVE', { delta: 500, stopAt: 960, next: 'game' }), progress);
  const chat = step(progress, 'MOVE', { delta: 500, stopAt: 960, next: 'chat' });
  assert.equal(chat.x, 960);
  assert.equal(chat.phase, 'chat');
  assert.equal(chat.revision, walk.revision + 1);
  assert.equal(step(chat, 'REPLY', { index: 5 }), chat);
  assert.equal(step(chat, 'UNKNOWN_ACTION'), chat);
});

test('opening and closing the chapter menu invalidates any already queued departure callback', () => {
  const progress = createProgress();
  let state = finishGame(walkToReply(createFlowState(progress)));
  state = transitionFlow(state, { type: 'CONTINUE_TAKEAWAY' }).state;
  const scheduledRevision = state.revision;
  state = step(state, 'OPEN_MENU');
  state = step(state, 'CLOSE_MENU');

  assert.notEqual(state.revision, scheduledRevision);
  assert.equal(step(state, 'DEPART_DONE', { revision: scheduledRevision }), state);
  assert.equal(step(state, 'DEPART_DONE', { revision: state.revision }).phase, 'card');
});

test('reply metadata comes from content and only scored games retain boolean correctness', () => {
  let state = step(walkToReply(createFlowState()), 'REPLY', { index: 2 });
  const { lean, perf } = content.chapters[0].chat.replies[2];
  assert.deepEqual(state.pending, { lean, perf, correct: null, input: { reply: 2 } });
  state = finishQuiz(state);
  state = step(state, 'MOVE', { delta: 500, stopAt: 1400, next: 'game' });
  assert.equal(step(state, 'GAME_RESULT', { input: { choice: 2 }, correct: null }), state);
  state = step(state, 'GAME_RESULT', { input: { choice: 2, reply: 3 }, correct: false });
  assert.deepEqual(state.pending.input, { choice: 2, reply: 2 });

  const unscored = createFlowState(createProgress({ ...createProgress(), resume: 4, farthest: 4 }));
  const takeaway = finishGame(walkToReply(unscored), { input: { count: 3 }, correct: true });
  assert.equal(takeaway.pending.correct, null);
  assert.deepEqual(takeaway.pending.input, { reply: 0, count: 3 });
});
