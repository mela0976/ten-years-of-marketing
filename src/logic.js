export function personaId(score, perf) {
  if (score >= 5 && perf >= 3 && perf <= 7) return 'judge';
  if (perf >= 7) return 'hunter';
  if (perf <= 3) return 'believer';
  return 'balance';
}

export function sliderIsCorrect(guess, answer, tolerance) {
  return Math.abs(guess - answer) <= tolerance;
}

export function swipeScoreIsCorrect(correctCount) {
  return correctCount >= 3;
}

export function stopIsCorrect(tick, goodUntilTick) {
  return Number.isFinite(tick) && tick > 0 && tick <= goodUntilTick;
}

export function getRunTotals(results) {
  return results.reduce((totals, result) => {
    if (result.lean === 'perf') totals.perf += Number.isFinite(result.perf) ? result.perf : 1;
    if (result.scored) {
      totals.scored += 1;
      if (result.correct) totals.score += 1;
    }
    return totals;
  }, { score: 0, scored: 0, perf: 0 });
}

export function timerSecondsForRole(tierSeconds, timerDelta, minSeconds) {
  return Math.max(minSeconds, tierSeconds + timerDelta);
}

export function applyRoleMultiplier(points, multiplier = 1) {
  return Math.max(0, Math.round(points * multiplier));
}

export function scoreMultiGame(chapterIndex, { correctCount = 0, answerCount = 0, fullCorrect = false, remainingSeconds = 0, totalSeconds = 0, timed = true, timeout = false } = {}) {
  const tier = chapterTier(chapterIndex);
  if (!tier) return 0;
  let points = scoring.participate * tier;
  if (!timeout && answerCount > 0) {
    points += Math.round(scoring.correct * tier * Math.max(0, Math.min(correctCount, answerCount)) / answerCount);
  }
  if (!timeout && fullCorrect && timed && totalSeconds > 0) {
    const remaining = Math.max(0, Math.min(totalSeconds, remainingSeconds));
    points += Math.round(scoring.speedMax * tier * remaining / totalSeconds);
  }
  return points;
}

export function hintPickIndices(answer, optionCount, seed = 0) {
  if (!Number.isInteger(answer) || answer < 0 || answer >= optionCount || optionCount < 2) return [];
  let other = Math.abs(Math.trunc(seed)) % optionCount;
  if (other === answer) other = (other + 1) % optionCount;
  return [answer, other].sort((a, b) => a - b);
}

export function hintMultiSelection(answers, selected = []) {
  const current = new Set(selected);
  return answers.find((answer) => !current.has(answer)) ?? null;
}

export function sliderHintRange(min, max, answer, tolerance) {
  return { low: Math.max(min, answer - 2 * tolerance), high: Math.min(max, answer + 2 * tolerance) };
}

export function desktopCameraDistance({ width, height, panelWidth = 440, headerHeight = 56, stageWidth = 7, stageHeight = 4, fov = 38 } = {}) {
  const safeWidth = Math.max(1, width - panelWidth);
  const safeHeight = Math.max(1, height - headerHeight);
  const visibleWidthRatio = safeWidth / Math.max(width, 1);
  const visibleHeightRatio = safeHeight / Math.max(height, 1);
  const halfVerticalFov = (fov * Math.PI) / 360;
  const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * (width / Math.max(height, 1)));
  const horizontal = (stageWidth / 2) / (Math.tan(halfHorizontalFov) * visibleWidthRatio * 0.9);
  const vertical = (stageHeight / 2) / (Math.tan(halfVerticalFov) * visibleHeightRatio * 0.84);
  return Math.max(15, horizontal, vertical);
}
import gamify from './gamify-content.js';


const scoring = gamify.scoring;

export function chapterTier(chapterIndex) {
  return scoring.tierByChapter[chapterIndex];
}

export function scoreReply() {
  return scoring.reply;
}

export function scoreMiniGame(chapterIndex, { correct = false, remainingSeconds = 0, totalSeconds = 0, timed = true, completed = true, timeout = false } = {}) {
  if (!completed) return 0;
  const chapter = chapterIndex + 1;
  const tier = chapterTier(chapterIndex);
  if (!tier) return 0;
  const isScored = chapter <= 9 && chapter !== 4 && chapter !== 9;
  const isStop = chapter === 8;
  let points = scoring.participate * tier;
  if (!timeout && isScored && correct) points += scoring.correct * tier;
  if (!timeout && !isScored) points += scoring.experience * tier;
  if (!timeout && timed && !isStop && (correct || !isScored) && totalSeconds > 0) {
    const remaining = Math.max(0, Math.min(totalSeconds, remainingSeconds));
    points += Math.round(scoring.speedMax * tier * remaining / totalSeconds);
  }
  return points;
}

export function scoreQuick(correct) {
  return correct ? scoring.quickCorrect : scoring.quickParticipate;
}

export function maxMiniGameScore(chapterIndex, timed = true) {
  return scoreMiniGame(chapterIndex, {
    correct: true,
    remainingSeconds: 1,
    totalSeconds: 1,
    timed,
  });
}

export function maxChapterScore(chapterIndex, timed = true) {
  return scoreReply() + maxMiniGameScore(chapterIndex, timed);
}

export function maxRunScore(timed = true) {
  return gamify.warmup.points
    + Array.from({ length: 9 }, (_, index) => maxChapterScore(index, timed)).reduce((sum, points) => sum + points, 0)
    + scoreReply()
    + gamify.scoring.quickCorrect * gamify.quick.questions.length;
}

function seededUnit(seed, chapterIndex, rivalIndex) {
  let value = (Number(seed) ^ Math.imul(chapterIndex + 1, 0x9e3779b1) ^ Math.imul(rivalIndex + 1, 0x85ebca6b)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  value = (value ^ (value >>> 16)) >>> 0;
  return value / 0x100000000;
}

export function rivalChapterAward(rivalIndex, chapterIndex, seed, timed = true) {
  const rival = gamify.rivals[rivalIndex];
  const tier = chapterTier(chapterIndex);
  const maxPoints = maxChapterScore(chapterIndex, timed);
  const share = rival.shareByTier[tier];
  return Math.round(maxPoints * share * (0.95 + seededUnit(seed, chapterIndex, rivalIndex) * 0.1));
}

export function rivalQuickAward(rivalIndex, seed) {
  const rival = gamify.rivals[rivalIndex];
  const maxPoints = scoreQuick(true) * gamify.quick.questions.length;
  return Math.round(maxPoints * rival.quickShare * (0.95 + seededUnit(seed, 9, rivalIndex) * 0.1));
}

export function rankTeams(scores) {
  return Object.entries(scores)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-Hant-TW'))
    .map((team, index) => ({ ...team, rank: index + 1 }));
}
