import assert from 'node:assert/strict';
import test from 'node:test';
import content from '../content/content.js';
import roadside from '../content/roadside.js';
import { chapters } from './chapters/index.js';
import { createFlowState, createProgress, getWalkTarget, transitionFlow } from './flow.js';
import { getRunTotals, personaId } from './logic.js';

const step = (state, type, fields = {}) => transitionFlow(state, { type, ...fields }).state;
const move = (state, delta = 5000) => step(state, 'MOVE', { delta, ...getWalkTarget(state, chapters[state.chapter - 1].stops) });

function afterChat(chapter = 1, progress = createProgress(), reply = 1) {
  let state = createFlowState(createProgress({ ...progress, resume: chapter, farthest: Math.max(chapter, progress.farthest) }));
  state = step(state, 'BEGIN');
  state = step(state, 'CARD_DONE');
  state = move(state);
  return step(state, 'REPLY', { index: reply });
}

function answerQuiz(state, correct) {
  const question = roadside[state.chapter - 1];
  state = move(state);
  state = step(state, 'QUIZ_RESULT', { index: correct ? question.answer : (question.answer + 1) % question.options.length });
  return step(state, 'CONTINUE_QUIZ');
}

function finishChapter(state, correct = true) {
  state = move(state);
  if (state.phase === 'game') {
    state = step(state, 'GAME_RESULT', { input: { choice: 0 }, correct });
    state = step(state, 'CONTINUE_REVEAL');
  }
  return transitionFlow(state, { type: 'CONTINUE_TAKEAWAY' });
}

test('路上小問有十題短題目、二到三個不同選項與範圍內的單一正解', () => {
  assert.equal(roadside.length, 10);
  roadside.forEach((question, index) => {
    assert.ok(question.prompt.length > 0 && question.prompt.length <= 28);
    assert.ok(question.reveal.length > 0 && question.reveal.length <= 40);
    assert.ok(question.options.length >= 2 && question.options.length <= 3);
    assert.equal(new Set(question.options).size, question.options.length);
    assert.ok(question.options.every((option) => typeof option === 'string' && option.trim() && option.length <= 12));
    assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length);
    assert.notEqual(question.prompt, content.chapters[index].game?.prompt);
  });
});

test('十章在對話後停靠一次小問，揭曉後回到原路，終章直接走向帶走句', () => {
  for (let chapter = 1; chapter <= 10; chapter += 1) {
    for (const correct of [true, false]) {
      let state = afterChat(chapter);
      const stops = chapters[chapter - 1].stops;
      assert.ok(stops.chat < stops.quiz && stops.quiz < stops.interaction);
      assert.equal(state.x, stops.chat);
      assert.equal(state.phase, 'walk2');
      assert.equal(step(state, 'MOVE', { delta: 5000, stopAt: stops.interaction, next: chapter === 10 ? 'takeaway' : 'game' }), state);
      state = move(state, 100);
      assert.equal(state.phase, 'walk2');
      assert.equal(state.x, stops.chat + 100);
      state = move(state);
      assert.equal(state.phase, 'quiz');
      assert.equal(state.x, stops.quiz);
      assert.equal(step(state, 'CONTINUE_QUIZ'), state);
      const question = roadside[chapter - 1];
      const before = state.pending;
      state = step(state, 'QUIZ_RESULT', { index: correct ? question.answer : (question.answer + 1) % question.options.length });
      assert.equal(state.phase, 'quiz');
      assert.deepEqual(state.pending, { ...before, quiz: correct });
      assert.deepEqual(state.progress.results, {});
      state = step(state, 'CONTINUE_QUIZ');
      assert.equal(state.phase, 'walk2');
      assert.equal(state.x, stops.quiz);
      assert.equal(step(state, 'MOVE', { delta: 1, stopAt: stops.quiz, next: 'quiz' }), state);
      state = move(state);
      assert.equal(state.phase, chapter === 10 ? 'takeaway' : 'game');
      assert.equal(state.x, stops.interaction);
    }
  }
});

test('小問拒絕越界作答、重複作答、過期回呼及選單開啟時的操作', () => {
  const walk = afterChat();
  assert.equal(step(walk, 'QUIZ_RESULT', { index: 0 }), walk);
  const quiz = move(walk);
  for (const index of [-1, 2, 1.5, '1', NaN, Infinity, undefined]) {
    assert.equal(step(quiz, 'QUIZ_RESULT', { index }), quiz);
  }
  const paused = step(quiz, 'OPEN_MENU');
  assert.equal(step(paused, 'QUIZ_RESULT', { index: 0 }), paused);
  assert.equal(step(paused, 'CONTINUE_QUIZ'), paused);
  const resumed = step(paused, 'CLOSE_MENU');
  assert.equal(step(resumed, 'QUIZ_RESULT', { index: 0, revision: quiz.revision }), resumed);
  const answered = step(resumed, 'QUIZ_RESULT', { index: 0 });
  assert.equal(step(answered, 'QUIZ_RESULT', { index: 1 }), answered);
  assert.equal(step(answered, 'CONTINUE_QUIZ', { revision: resumed.revision }), answered);
  const continued = step(answered, 'CONTINUE_QUIZ');
  assert.equal(step(continued, 'CONTINUE_QUIZ'), continued);
});

test('正誤只在章末與其他結果一起寫入，序列化後兩種布林值均保留', () => {
  for (const correct of [true, false]) {
    const state = answerQuiz(afterChat(3), correct);
    assert.equal(state.pending.quiz, correct);
    assert.deepEqual(state.progress.results, {});
    const completed = finishChapter(state);
    assert.equal(completed.effect.type, 'persist');
    assert.equal(completed.effect.value.results[3].quiz, correct);
    assert.deepEqual(createProgress(JSON.stringify(completed.effect.value)), completed.effect.value);
    assert.equal(completed.effect.value.results[3].correct, true);
  }
});

test('舊存檔的已完成章節與人格卡仍能讀取，未作答不補成答錯', () => {
  const results = Object.fromEntries(content.chapters.map((chapter, index) => [index + 1, {
    ...chapter.chat.replies[1], correct: chapter.game?.scored ? true : null, input: { reply: 1 },
  }]));
  const raw = { ...createProgress(), resume: 10, farthest: 10, done: true, muted: true, results };
  const restored = createProgress(JSON.stringify(raw));
  assert.equal(restored.done, true);
  assert.equal(restored.muted, true);
  assert.equal(Object.keys(restored.results).length, 10);
  assert.ok(Object.values(restored.results).every((result) => !Object.hasOwn(result, 'quiz')));
  assert.equal(createFlowState(restored).phase, 'persona');
});

test('重玩舊章先保留舊小問成績，章末才覆寫，重新整理丟棄未完成作答', () => {
  const old = { lean: 'perf', perf: 1, correct: true, input: { reply: 0 }, quiz: true };
  const progress = createProgress({ ...createProgress(), resume: 3, farthest: 3, results: { 1: old, 2: old } });
  let state = step(createFlowState(progress), 'OPEN_MENU');
  state = step(state, 'SELECT_CHAPTER', { chapter: 1 });
  state = move(step(state, 'CARD_DONE'));
  state = answerQuiz(step(state, 'REPLY', { index: 2 }), false);
  assert.deepEqual(state.progress, progress);
  const refreshed = createFlowState(createProgress(JSON.stringify(state.progress)));
  assert.equal(refreshed.chapter, 3);
  assert.equal(refreshed.pending, null);
  assert.equal(refreshed.progress.results[1].quiz, true);
  const completed = finishChapter(state);
  assert.equal(completed.state.progress.results[1].quiz, false);
  assert.deepEqual(completed.state.progress.results[2], old);
  assert.equal(completed.state.progress.resume, 3);
});

test('同一組對話與小互動下，小問全對、全錯或缺值的人格與識破數相同', () => {
  for (const [replies, score, expected] of [
    [Array(10).fill(1), 5, 'judge'],
    [Array(10).fill(0), 5, 'hunter'],
    [Array(10).fill(2), 5, 'believer'],
    [[0, 0, 0, 0, 0, 2, 2, 2, 2, 2], 4, 'balance'],
  ]) {
    const totals = [];
    for (const quiz of [true, false, undefined]) {
      let remaining = score;
      const results = content.chapters.map((chapter, index) => {
        const played = answerQuiz(afterChat(index + 1, createProgress(), replies[index]), quiz === true);
        const correct = chapter.game?.scored ? remaining-- > 0 : null;
        const result = finishChapter(played, correct).state.progress.results[index + 1];
        if (quiz === undefined) delete result.quiz;
        return { ...result, scored: chapter.game?.scored === true };
      });
      totals.push(getRunTotals(results));
    }
    assert.deepEqual(totals[0], totals[1]);
    assert.deepEqual(totals[0], totals[2]);
    assert.equal(totals[0].score, score);
    assert.equal(personaId(totals[0].score, totals[0].perf), expected);
  }
});
