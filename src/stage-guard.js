export function createStageGuard(initialPhase = null) {
  let stageCode = 0;
  let phase = initialPhase;

  return {
    get stageCode() { return stageCode; },
    advance(nextPhase = phase) {
      phase = nextPhase;
      stageCode += 1;
      return stageCode;
    },
    enter(nextPhase) {
      if (phase !== nextPhase) return this.advance(nextPhase);
      return stageCode;
    },
    isCurrent(code) { return code === stageCode; },
    once(code, callback) {
      let called = false;
      return (...args) => {
        if (called || !this.isCurrent(code)) return undefined;
        called = true;
        return callback(...args);
      };
    },
  };
}
