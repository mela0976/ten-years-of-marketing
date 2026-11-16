import test from 'node:test';
import assert from 'node:assert/strict';
import gamify from './gamify-content.js';
import { chapterTier, getRunTotals, maxChapterScore, maxRunScore, maxMiniGameScore, personaId, rankTeams, rivalChapterAward, rivalQuickAward, scoreMiniGame, scoreQuick, scoreReply, sliderIsCorrect, stopIsCorrect, swipeScoreIsCorrect } from './logic.js';
import * as THREE from 'three';
import content from './content.js';
import { GameScene } from './scene/game-scene.js';
import { createStageGuard } from './stage-guard.js';

test('stage guard ignores a second completion callback from the same interaction', () => {
  const guard = createStageGuard('mini-game');
  let score = 0;
  let phase = 'mini-game';
  const settle = guard.once(guard.stageCode, () => {
    score += 10;
    phase = 'reveal';
  });

  settle();
  settle();

  assert.equal(score, 10);
  assert.equal(phase, 'reveal');
});

test('stage guard ignores a callback scheduled before the chapter advances', () => {
  const guard = createStageGuard('mini-game');
  let score = 10;
  let phase = 'mini-game';
  const staleCompletion = guard.once(guard.stageCode, () => {
    score += 5;
    phase = 'reveal';
  });

  guard.advance('next-chapter-message');
  phase = 'next-chapter-message';
  staleCompletion();

  assert.equal(score, 10);
  assert.equal(phase, 'next-chapter-message');
  assert.equal(guard.isCurrent(guard.stageCode), true);
});

test('every built chapter object stays within the standard stage bounds with 0.2 tolerance', () => {
  globalThis.document = {
    createElement: () => ({
      width: 768,
      height: 420,
      getContext: () => ({ fillStyle: '', font: '', fillRect() {}, fillText() {} }),
    }),
  };
  for (let index = 0; index < content.chapters.length; index += 1) {
    const scene = Object.create(GameScene.prototype);
    Object.assign(scene, {
      renderer: {}, stageObjects: new THREE.Group(), interactive: [], tweens: [], models: new Map(),
      currentIndex: index, currentChapter: null, reducedMotion: false, stopTick: 0,
      moveToChapter() {},
    });
    scene.setChapter(content.chapters[index], index, false);
    scene.stageObjects.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(scene.stageObjects);
    assert.ok(!bounds.isEmpty(), `${content.chapters[index].year} stage has no objects`);
    assert.ok(bounds.min.x >= -3.7 && bounds.max.x <= 3.7, `${content.chapters[index].year} x: ${bounds.min.x}–${bounds.max.x}`);
    assert.ok(bounds.min.y >= -0.2 && bounds.max.y <= 4.2, `${content.chapters[index].year} y: ${bounds.min.y}–${bounds.max.y}`);
    const stageZ = -index * 24;
    assert.ok(bounds.min.z - stageZ >= -1.7 && bounds.max.z - stageZ <= 1.7, `${content.chapters[index].year} z: ${bounds.min.z - stageZ}–${bounds.max.z - stageZ}`);
  }
  delete globalThis.document;
});

test('personality classification covers every score and performance combination exactly once', () => {
  const appearances = new Set();
  for (let score = 0; score <= 7; score += 1) {
    for (let perf = 0; perf <= 10; perf += 1) {
      const id = personaId(score, perf);
      assert.ok(['judge', 'hunter', 'believer', 'balance'].includes(id));
      const expected = score >= 5 && perf >= 3 && perf <= 7
        ? 'judge'
        : perf >= 7
          ? 'hunter'
          : perf <= 3
            ? 'believer'
            : 'balance';
      assert.equal(id, expected);
      appearances.add(id);
    }
  }
  assert.deepEqual([...appearances].sort(), ['balance', 'believer', 'hunter', 'judge']);
});

test('slider tolerance includes both edges and rejects one step beyond', () => {
  for (const { answer, tolerance, step } of [
    { answer: 5, tolerance: 1, step: 1 },
    { answer: 65, tolerance: 10, step: 5 },
    { answer: 81, tolerance: 10, step: 5 },
  ]) {
    assert.equal(sliderIsCorrect(answer - tolerance, answer, tolerance), true);
    assert.equal(sliderIsCorrect(answer + tolerance, answer, tolerance), true);
    assert.equal(sliderIsCorrect(answer - tolerance - step, answer, tolerance), false);
    assert.equal(sliderIsCorrect(answer + tolerance + step, answer, tolerance), false);
  }
});

test('chapter six counts three correct swipes as a correct result', () => {
  assert.equal(swipeScoreIsCorrect(3), true);
  assert.equal(swipeScoreIsCorrect(4), true);
  assert.equal(swipeScoreIsCorrect(2), false);
});

test('chapter eight is correct through the good-until tick, inclusive', () => {
  assert.equal(stopIsCorrect(1, 4), true);
  assert.equal(stopIsCorrect(4, 4), true);
  assert.equal(stopIsCorrect(5, 4), false);
  assert.equal(stopIsCorrect(0, 4), false);
});

test('run totals count only scored games and performance replies', () => {
  assert.deepEqual(getRunTotals([
    { lean: 'perf', scored: true, correct: true },
    { lean: 'brand', scored: true, correct: false },
    { lean: 'perf', scored: false, correct: true },
  ]), { score: 1, scored: 2, perf: 2 });
});

test('points follow tier, correctness, completion, timer, and unscored-game rules', () => {
  assert.equal(scoreReply(), 1000);
  assert.equal(chapterTier(0), 1);
  assert.equal(chapterTier(4), 2);
  assert.equal(chapterTier(8), 3);
  for (let index = 0; index < 9; index += 1) {
    const tier = gamify.scoring.tierByChapter[index];
    const scored = ![3, 8].includes(index);
    const stop = index === 7;
    const experience = scored ? 0 : gamify.scoring.experience * tier;
    const maxSpeed = stop ? 0 : gamify.scoring.speedMax * tier;
    const correctPoints = (gamify.scoring.participate + (scored ? gamify.scoring.correct : gamify.scoring.experience) + (stop ? 0 : gamify.scoring.speedMax)) * tier;
    const wrongPoints = (gamify.scoring.participate * tier) + experience + (!scored && !stop ? maxSpeed : 0);
    assert.equal(scoreMiniGame(index, { correct: true, remainingSeconds: 20, totalSeconds: 20 }), correctPoints, `chapter ${index + 1} correct`);
    assert.equal(scoreMiniGame(index, { correct: false, remainingSeconds: 20, totalSeconds: 20 }), wrongPoints, `chapter ${index + 1} wrong`);
    assert.equal(scoreMiniGame(index, { timeout: true, remainingSeconds: 0, totalSeconds: 20 }), gamify.scoring.participate * tier, `chapter ${index + 1} timeout`);
    assert.equal(scoreMiniGame(index, { correct: true, timed: false }), correctPoints - maxSpeed, `chapter ${index + 1} no timer`);
  }
  assert.equal(scoreMiniGame(2, { completed: false }), 0);
  assert.equal(scoreQuick(true), 5000);
  assert.equal(scoreQuick(false), 1000);
});

test('cumulative game points never decrease for any scoring outcome', () => {
  for (let seed = 0; seed < 500; seed += 1) {
    let score = gamify.warmup.points;
    let previous = score;
    for (let index = 0; index < 9; index += 1) {
      score += scoreReply();
      assert.ok(score >= previous);
      previous = score;
      for (const correct of [false, true]) {
        const points = scoreMiniGame(index, { correct, remainingSeconds: seed % 25, totalSeconds: 20 });
        assert.ok(points >= 0);
        score += points;
        assert.ok(score >= previous);
        previous = score;
      }
    }
    for (const correct of [false, true]) {
      score += scoreQuick(correct);
      assert.ok(score >= previous);
      previous = score;
    }
  }
});

test('late chapters and quick round contain more than half of the timed maximum', () => {
  const late = [6, 7, 8].reduce((sum, index) => sum + maxChapterScore(index, true), 0)
    + scoreQuick(true) * gamify.quick.questions.length;
  assert.ok(late / maxRunScore(true) > 0.5);
});

function runForSeed(seed, mode) {
  let player = gamify.warmup.points;
  const rivals = Object.fromEntries(gamify.rivals.map((rival) => [rival.name, 0]));
  const outcome = (index) => {
    let value = (Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(index + 7, 0x85ebca6b)) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
    return (value % 100) < 60;
  };
  for (let index = 0; index < 9; index += 1) {
    player += scoreReply();
    const correct = mode === 'perfect' || (mode === 'average' && outcome(index));
    player += scoreMiniGame(index, {
      correct,
      remainingSeconds: mode === 'perfect' ? 20 : mode === 'average' ? 10 : 0,
      totalSeconds: 20,
    });
    for (let rival = 0; rival < gamify.rivals.length; rival += 1) {
      const rivalAward = rivalChapterAward(rival, index, seed, true);
      rivals[gamify.rivals[rival].name] += rivalAward;
    }
  }
  player += scoreReply();
  const quickCorrect = mode === 'perfect' ? 6 : mode === 'average' ? gamify.quick.questions.filter((_, index) => outcome(index + 9)).length : 0;
  player += quickCorrect * scoreQuick(true) + (6 - quickCorrect) * scoreQuick(false);
  for (let rival = 0; rival < gamify.rivals.length; rival += 1) {
    rivals[gamify.rivals[rival].name] += rivalQuickAward(rival, seed);
  }
  return { player, rivals };
}

test('500 seeded perfect, average, and participation-only runs meet fairness targets', () => {
  let averageWinsAtLeastOne = 0;
  let averageFirst = 0;
  for (let seed = 0; seed < 500; seed += 1) {
    const perfect = runForSeed(seed, 'perfect');
    assert.equal(rankTeams({ '玩家隊伍': perfect.player, ...perfect.rivals })[0].name, '玩家隊伍');
    const average = runForSeed(seed, 'average');
    const ranks = rankTeams({ '玩家隊伍': average.player, ...average.rivals });
    if (ranks[0].name === '玩家隊伍') averageFirst += 1;
    if (average.player > Math.min(...Object.values(average.rivals))) averageWinsAtLeastOne += 1;
    const allWrong = runForSeed(seed, 'wrong');
    assert.ok(allWrong.player / maxRunScore(true) >= 0.25);
  }
  assert.ok(averageWinsAtLeastOne / 500 >= 0.6);
  assert.ok(averageFirst / 500 >= 0.1 && averageFirst / 500 <= 0.6);
});

test('performance leads after chapter three and brand leads at the finale for 500 seeds', () => {
  let earlyWins = 0;
  let finalWins = 0;
  for (let seed = 0; seed < 500; seed += 1) {
    let perf = 0;
    let brand = 0;
    for (let index = 0; index < 9; index += 1) {
      const perfAward = rivalChapterAward(0, index, seed, true);
      const brandAward = rivalChapterAward(1, index, seed, true);
      perf += perfAward;
      brand += brandAward;
      if (index === 2 && perf > brand) earlyWins += 1;
    }
    perf += rivalQuickAward(0, seed);
    brand += rivalQuickAward(1, seed);
    if (brand > perf) finalWins += 1;
  }
  assert.ok(earlyWins / 500 >= 0.95);
  assert.ok(finalWins / 500 >= 0.95);
});
