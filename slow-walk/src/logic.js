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

export function multiIsCorrect(selected, answers) {
  const selectedSet = new Set(selected);
  const answerSet = new Set(answers);
  return selectedSet.size === answerSet.size && [...answerSet].every((index) => selectedSet.has(index));
}

export function getRunTotals(results) {
  let score = 0;
  let scored = 0;
  let perfTenths = 0;

  for (const result of results) {
    if (result.lean === 'perf') {
      const weight = Number.isFinite(result.perf) ? result.perf : 1;
      perfTenths += Math.round(weight * 10);
    }

    if (result.scored) {
      scored += 1;
      if (result.correct) score += 1;
    }
  }

  return { score, scored, perf: perfTenths / 10 };
}
