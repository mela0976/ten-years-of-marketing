import assert from 'node:assert/strict';
import test from 'node:test';
import content from '../content/content.js';
import {
  getRunTotals,
  multiIsCorrect,
  personaId,
  sliderIsCorrect,
  stopIsCorrect,
  swipeScoreIsCorrect,
} from './logic.js';

test('slider guesses include both tolerance edges and reject a step beyond', () => {
  const chapters = content.chapters.filter(({ game }) => game?.type === 'slider');
  assert.deepEqual(chapters.map(({ year }) => year), [2019, 2020, 2022]);

  for (const { year, game: { answer, tolerance, step } } of chapters) {
    const lowerEdge = answer - tolerance;
    const upperEdge = answer + tolerance;

    assert.equal(sliderIsCorrect(lowerEdge, answer, tolerance), true, `${year} lower edge`);
    assert.equal(sliderIsCorrect(upperEdge, answer, tolerance), true, `${year} upper edge`);
    assert.equal(sliderIsCorrect(lowerEdge - step, answer, tolerance), false, `${year} below tolerance`);
    assert.equal(sliderIsCorrect(upperEdge + step, answer, tolerance), false, `${year} above tolerance`);
  }
});

test('2022 slider accepts the outer playable ticks within tolerance', () => {
  const { game: { answer, tolerance } } = content.chapters.find(({ year }) => year === 2022);
  assert.equal(sliderIsCorrect(70, answer, tolerance), false);
  assert.equal(sliderIsCorrect(75, answer, tolerance), true);
  assert.equal(sliderIsCorrect(90, answer, tolerance), true);
  assert.equal(sliderIsCorrect(95, answer, tolerance), false);
});

test('2023 swipe requires at least three correct cards out of four', () => {
  const expected = [false, false, false, true, true];
  expected.forEach((correct, count) => assert.equal(swipeScoreIsCorrect(count), correct, `${count} cards`));
});

test('2024 multi accepts exactly one of the 16 possible selections', () => {
  const { game: { answers, options } } = content.chapters.find(({ year }) => year === 2024);
  assert.equal(options.length, 4);
  assert.deepEqual(answers, [0, 1, 2]);

  const indices = options.map((_, index) => index);
  const correctSelections = [];
  for (let mask = 0; mask < 2 ** options.length; mask += 1) {
    const selected = indices.filter((index) => mask & (1 << index));
    if (multiIsCorrect(selected, answers)) correctSelections.push(selected);
  }
  assert.deepEqual(correctSelections, [[0, 1, 2]]);
  assert.equal(multiIsCorrect(new Set([2, 1, 0]), answers), true);
  assert.equal(multiIsCorrect([2, 2, 1, 0], answers), true);
});

test('2025 stop accepts finite ticks only after movement and through the good-until tick', () => {
  const { game: { goodUntilTick, ticks } } = content.chapters.find(({ year }) => year === 2025);
  assert.equal(ticks, 12);
  assert.equal(goodUntilTick, 4);

  for (const [tick, expected] of [[0, false], [1, true], [4, true], [5, false], [12, false], [NaN, false], [Infinity, false]]) {
    assert.equal(stopIsCorrect(tick, goodUntilTick), expected, `tick ${tick}`);
  }
});

test('personas cover all 808 score and performance pairs in the specified priority order', () => {
  const personas = new Set();
  for (let score = 0; score <= 7; score += 1) {
    const expectedBands = score < 5
      ? [[0, 30, 'believer'], [31, 69, 'balance'], [70, 100, 'hunter']]
      : [[0, 29, 'believer'], [30, 70, 'judge'], [71, 100, 'hunter']];

    for (const [first, last, expected] of expectedBands) {
      for (let tenths = first; tenths <= last; tenths += 1) {
        const perf = tenths / 10;
        const actual = personaId(score, perf);
        assert.equal(actual, expected, `score ${score}, perf ${perf}`);
        personas.add(actual);
      }
    }
  }
  assert.deepEqual(personas, new Set(['judge', 'hunter', 'believer', 'balance']));
});

test('real chapter replies reach judge, hunter, and believer', () => {
  assert.equal(content.chapters.length, 10);
  const correctYears = new Set([2018, 2019, 2020, 2022, 2023]);

  for (const { lean, weight, perf, persona } of [
    { lean: 'perf', weight: 0.7, perf: 7, persona: 'judge' },
    { lean: 'perf', weight: 1, perf: 10, persona: 'hunter' },
    { lean: 'brand', weight: 0.3, perf: 0, persona: 'believer' },
  ]) {
    const results = content.chapters.map(({ year, chat, game }) => {
      const reply = chat.replies.find((option) => option.lean === lean && option.perf === weight);
      assert.ok(reply, `${year} ${lean} reply with weight ${weight}`);
      const scored = game?.scored ?? false;
      return { lean: reply.lean, perf: reply.perf, scored, correct: scored ? correctYears.has(year) : null };
    });

    const totals = getRunTotals(results);
    assert.deepEqual(totals, { score: 5, scored: 7, perf });
    assert.equal(personaId(totals.score, totals.perf), persona);
  }
});

test('run totals use only scored games and performance replies', () => {
  assert.deepEqual(getRunTotals([]), { score: 0, scored: 0, perf: 0 });
  assert.deepEqual(getRunTotals([
    { lean: 'perf', perf: 0.7, scored: true, correct: true },
    { lean: 'brand', perf: 0.3, scored: true, correct: false },
    { lean: 'perf', perf: 1, scored: false, correct: true },
  ]), { score: 1, scored: 2, perf: 1.7 });
});

test('performance weights default to one when not finite and round individually to tenths', () => {
  for (const perf of [undefined, NaN, Infinity, -Infinity]) {
    assert.equal(getRunTotals([{ lean: 'perf', perf }]).perf, 1);
  }
  assert.equal(getRunTotals([{ lean: 'perf', perf: 0 }]).perf, 0);
  assert.equal(getRunTotals([{ lean: 'perf', perf: 0.34 }, { lean: 'perf', perf: 0.34 }]).perf, 0.6);
});
