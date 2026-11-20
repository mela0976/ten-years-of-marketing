// 相位以完整的左右步態循環為 1；支撐期稍長，換腳時會短暫雙腳著地。
const SUPPORT_FRACTION = 0.58;
const SWING_FRACTION = 1 - SUPPORT_FRACTION;
const FIRST_SUPPORT_PHASE = SUPPORT_FRACTION / 2;
const OPPOSITE_LEG_PHASE = 0.5;
const SETTLE_SECONDS = 0.19;
const SECOND_FOOT_DELAY = SETTLE_SECONDS;
const SETTLE_LIFT = 4;
const ENTRY_LIFT_FRACTION = 0.10;

export const TAU = 2 * Math.PI;

export function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

export function cycle(value) {
  return value - Math.floor(value);
}

export function createFeet() {
  return [0, OPPOSITE_LEG_PHASE].map((offset) => ({
    phaseOffset: FIRST_SUPPORT_PHASE + offset,
    x: 0,
    y: 0,
  }));
}

export function sampleStep(foot, phase, strideLength, lift, startPhase, starting) {
  const step = cycle(phase + foot.phaseOffset);
  const swing = (step - SUPPORT_FRACTION) / SWING_FRACTION;
  // 支撐腳的相對 x 每格扣掉角色位移；擺動期再把腳抬回下一個落點。
  const x = strideLength * (FIRST_SUPPORT_PHASE - step + smoothstep(swing));
  const y = swing > 0 ? Math.sin(Math.PI * swing) ** 2 * lift : 0;
  if (starting) {
    foot.entryX = foot.x - x;
    foot.entryY = foot.y;
    foot.touchdown = Math.floor(phase + foot.phaseOffset) + 1 - foot.phaseOffset;
    foot.entrySwing = Math.max(phase, foot.touchdown - SWING_FRACTION);
  }
  // 從靜止起步時沿用原本的支撐點，入場偏差留到第一次抬腳才消除。
  const correction = phase < foot.touchdown
    ? 1 - smoothstep((phase - foot.entrySwing) / (foot.touchdown - foot.entrySwing))
    : 0;
  foot.x = x + foot.entryX * correction;
  // 如果在收步中重新起步，抬起的腳要能接回新步態。
  const entryYBlend = smoothstep((phase - startPhase) / ENTRY_LIFT_FRACTION);
  foot.y = y * entryYBlend + foot.entryY * (1 - entryYBlend);
}

export function startSettle(feet) {
  const [near, far] = feet;
  const first = near.y === far.y ? (Math.abs(near.x) >= Math.abs(far.x) ? near : far) : (near.y > far.y ? near : far);
  for (const foot of feet) {
    foot.stopX = foot.x;
    foot.stopY = foot.y;
    foot.stopDelay = foot === first ? 0 : SECOND_FOOT_DELAY;
  }
}

export function settleStep(foot, seconds) {
  const t = (seconds - foot.stopDelay) / SETTLE_SECONDS;
  const blend = smoothstep(t);
  foot.x = foot.stopX * (1 - blend);
  const lift = Math.min(SETTLE_LIFT, Math.abs(foot.stopX) * 0.22);
  foot.y = foot.stopY * (1 - blend) + (t > 0 && t < 1 ? Math.sin(Math.PI * t) ** 2 * lift : 0);
}

export function solveLeg(x, y, upperLength, lowerLength, bendDirection) {
  // 用鞋底接地點與髖部反算兩段角度。伸直時可達距離有限，夾住餘弦避免 NaN。
  const distance = Math.hypot(x, y);
  const cosine = (distance ** 2 - upperLength ** 2 - lowerLength ** 2) / (2 * upperLength * lowerLength);
  const bend = bendDirection * Math.acos(Math.max(-1, Math.min(1, cosine)));
  const thigh = Math.atan2(x, -y) - Math.atan2(lowerLength * Math.sin(bend), upperLength + lowerLength * Math.cos(bend));
  return [thigh, bend];
}
