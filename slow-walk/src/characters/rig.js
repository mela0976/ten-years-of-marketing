import * as THREE from 'three';
import playerRig from './player-rig.json' with { type: 'json' };
import companionRig from './companion-rig.json' with { type: 'json' };
import bystanderRig from './bystander-rig.json' with { type: 'json' };
import { TAU, createFeet, cycle, sampleStep, settleStep, smoothstep, solveLeg, startSettle } from './gait.js';

// 尺寸是舞台單位，角度是弧度。下腿長度量到鞋底／腳趾的接地軸。
const TRAVELER_GAIT = { pace: 80, footLift: 17, lowerLength: 55, bend: -1, drop: 6.5, bob: 1.6 };
const HERON_GAIT = { pace: 72, footLift: 8, lowerLength: 32, bend: 1, drop: 3.4, bob: 1.1 };
const TRAVELER_BOBS_PER_STRIDE = 4;
const HERON_STEPS_PER_STRIDE = 2;
const BODY_SETTLE_SECONDS = 0.22;
const TRAVELER_LEAN = 0.043;
const PELVIS_ROCK = 0.029;
const SHOULDER_ROCK = 0.035;
const HEAD_SWAY = 0.024;
const PACK_SWAY = 0.075;
const ARM_SWING = 0.28;
const FOREARM_SWING = 0.17;
// 頭、背包和前臂的跟隨動作分別落後於各自肩線或上臂。
const HEAD_DELAY = 0.43;
const PACK_DELAY = 0.75;
const FOREARM_DELAY = 0.52;
const BREATH_SECONDS = 3.6;
const TORSO_BREATH = 0.72;
const HEAD_BREATH = 0.52;
const GLANCE_SECONDS = 6.7;
const GLANCE_DURATION = 1.3;
const HEAD_GLANCE = 0.21;
const BIRD_LOOK_SECONDS = 5.4;
const BIRD_LOOK_DURATION = 1.0;
const BIRD_TURN = 0.27;
const BIRD_DIP = 0.14;
const BIRD_DIP_Y = 4;
const BIRD_HEAD_HOLD = 0.55;
const BIRD_NECK_REACH = 4;
const BIRD_NOD = 0.09;
const REDUCED_AMPLITUDE = 0.5;
const PEDAL_SECONDS = 0.95;
const PEDAL_BLEND_SECONDS = 0.2;
const PEDAL_THIGH = 0.16;
const PEDAL_SHIN = 0.21;
const RIDE_POSTURE = {
  legFar: 1.25, legNear: 1.15, shinFar: -1.3, shinNear: -1.2,
  armFar: 0.9, armNear: 0.8, forearmFar: 0.5, forearmNear: 0.5,
};
const WAVE_RATE = 5;
const WAVE_SWING = 0.55;
const WAVE_ANGLE = -0.75;

function idleGesture(seconds, period, duration) {
  const turn = Math.floor(seconds / period);
  const progress = (seconds % period - (period - duration)) / duration;
  const amount = progress > 0 ? Math.sin(Math.PI * progress) ** 2 : 0;
  return { amount, alternate: turn % 2 === 1 };
}

function geometryFor(shape, width, height) {
  if (shape === 'ellipse') return new THREE.CircleGeometry(0.5, 24);
  if (shape === 'triangle') {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
  if (shape === 'trapezoid') {
    const path = new THREE.Shape();
    path.moveTo(-width * 0.46, -height * 0.5);
    path.lineTo(width * 0.46, -height * 0.5);
    path.lineTo(width * 0.35, height * 0.5);
    path.lineTo(-width * 0.35, height * 0.5);
    path.closePath();
    return new THREE.ShapeGeometry(path);
  }
  if (shape === 'capsule' || shape === 'roundRect') {
    const radius = Math.min(width, height) * 0.46;
    const path = new THREE.Shape();
    path.moveTo(-width / 2 + radius, -height / 2);
    path.lineTo(width / 2 - radius, -height / 2);
    path.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + radius);
    path.lineTo(width / 2, height / 2 - radius);
    path.quadraticCurveTo(width / 2, height / 2, width / 2 - radius, height / 2);
    path.lineTo(-width / 2 + radius, height / 2);
    path.quadraticCurveTo(-width / 2, height / 2, -width / 2, height / 2 - radius);
    path.lineTo(-width / 2, -height / 2 + radius);
    path.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + radius, -height / 2);
    return new THREE.ShapeGeometry(path);
  }
  return new THREE.PlaneGeometry(width, height);
}

function makePart(definition, order, assets, assetId) {
  const part = new THREE.Group();
  const [pivotX = 0, pivotY = 0] = definition.pivot ?? [0, 0];
  part.position.set(pivotX, pivotY, order * 0.01);
  part.userData.pivot = [pivotX, pivotY];
  const [offsetX = 0, offsetY = 0] = definition.offset ?? [0, 0];
  if (definition.shape !== 'group') {
    const [width, height] = definition.size;
    const image = assets?.get(assetId);
    const texture = image ? new THREE.Texture(image) : null;
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
    }
    // 有貼圖時一律用矩形平面，UV 才會完整對應整張部件圖；tint 用來壓暗遠側肢體。
    const mesh = new THREE.Mesh(image ? new THREE.PlaneGeometry(width, height) : geometryFor(definition.shape, width, height), new THREE.MeshBasicMaterial({
      color: image ? (definition.tint ?? '#ffffff') : definition.color,
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      depthTest: false,
    }));
    mesh.position.set(offsetX, offsetY, 0.01);
    if (!image && (definition.shape === 'ellipse' || definition.shape === 'triangle')) mesh.scale.set(width, height, 1);
    if (definition.rotation) mesh.rotation.z = definition.rotation;
    // 角色層介於主舞台（300 起）與前景（500 起）之間。
    mesh.renderOrder = 450 + order;
    part.add(mesh);
  }
  return part;
}

export class ArticulatedFigure {
  constructor(definition, { scale = 1, faceLeft = false, assets = null } = {}) {
    this.definition = definition;
    this.assets = assets;
    this.root = new THREE.Group();
    this.root.scale.setScalar(scale);
    if (faceLeft) this.root.scale.x *= -1;
    this.joints = new Map();
    const partById = new Map();
    definition.parts.forEach((part, index) => {
      const assetId = part.asset ?? `${definition.id}-${part.id}`.toLowerCase();
      const group = makePart(part, index, assets, assetId);
      this.joints.set(part.joint ?? part.id, group);
      partById.set(part.id, group);
      if (part.parent && partById.has(part.parent)) partById.get(part.parent).add(group);
      else this.root.add(group);
    });
    this.root.traverse((node) => {
      if (node.isMesh) node.material.side = THREE.DoubleSide;
    });
    this.baseY = 0;
    this.gait = definition.id === playerRig.id ? TRAVELER_GAIT : definition.id === companionRig.id ? HERON_GAIT : null;
    if (this.gait) {
      this.feet = createFeet();
      this.legs = ['Near', 'Far'].map((side) => ({
        thigh: this.joints.get(`leg${side}`),
        shin: this.joints.get(`shin${side}`),
      }));
    }
    this.walkStart = null;
    this.walkPhase = 0;
    this.walkWeight = 0;
    this.idleSince = null;
    this.rideStart = null;
  }

  update(worldX, timeSeconds, moving = false, pose = 'walk', { phase = 0, speed = 0, reducedMotion = false, pedals = true } = {}) {
    this.root.position.x = worldX;
    this.root.position.y = this.baseY;
    if (!this.gait) {
      const wave = this.joints.get('wave');
      if (wave) wave.rotation.z = pose === 'wave' ? Math.sin(timeSeconds * WAVE_RATE) * WAVE_SWING + WAVE_ANGLE : 0;
      return;
    }

    const amplitude = reducedMotion ? REDUCED_AMPLITUDE : 1;
    if (pose === 'ride' && this.gait === TRAVELER_GAIT) {
      this.rideStart ??= timeSeconds;
      this.updateRide(timeSeconds - this.rideStart, amplitude, pedals);
      this.walkStart = null;
      this.walkWeight = 0;
      this.idleSince = null;
      return;
    }
    this.rideStart = null;

    const { strideLength } = this.definition;
    const { pace, footLift, drop, bob } = this.gait;
    if (moving) {
      const starting = this.walkStart === null;
      if (starting) this.walkStart = phase;
      this.walkPhase = phase;
      this.walkWeight = smoothstep(speed / pace);
      this.idleSince = null;
      for (const foot of this.feet) sampleStep(foot, phase, strideLength, footLift * this.walkWeight, this.walkStart, starting);
    } else {
      if (this.walkStart !== null) {
        startSettle(this.feet);
        this.walkStart = null;
      }
      this.idleSince ??= timeSeconds;
      for (const foot of this.feet) {
        if (foot.stopDelay !== undefined) settleStep(foot, timeSeconds - this.idleSince);
      }
    }

    const idleSeconds = timeSeconds - (this.idleSince ?? timeSeconds);
    // 收步時保留最後的行走相位，身體獨立回到中立位置。
    const weight = this.walkWeight * (1 - smoothstep(idleSeconds / BODY_SETTLE_SECONDS));
    const gaitAngle = this.walkPhase * TAU;
    const traveler = this.gait === TRAVELER_GAIT;
    // 主角每一步內有兩次輕微起伏，鳥每一步一次；腳的位置另外鎖在地面。
    const bobCycles = traveler ? TRAVELER_BOBS_PER_STRIDE : HERON_STEPS_PER_STRIDE;
    const rootLift = weight * (-drop + bob * amplitude * Math.sin(gaitAngle * bobCycles));
    const hipAngle = traveler ? PELVIS_ROCK * weight * Math.sin(gaitAngle) : 0;
    this.updateLegs(rootLift, hipAngle);
    if (traveler) this.updateTraveler(gaitAngle, weight, hipAngle, idleSeconds, timeSeconds, amplitude);
    else this.updateHeron(this.walkPhase, weight, idleSeconds, amplitude);
  }

  updateLegs(rootLift, hipAngle) {
    const pelvis = this.joints.get('pelvis');
    if (pelvis) pelvis.rotation.z = hipAngle;
    const hipY = pelvis?.position.y ?? 0;
    const { lowerLength, bend } = this.gait;
    const cos = Math.cos(hipAngle);
    const sin = Math.sin(hipAngle);
    // 若支撐腳離髖部較遠，限制骨盆高度，避免腳被拉離地面。
    const targets = this.legs.map(({ thigh, shin }, index) => {
      const foot = this.feet[index];
      const lateral = foot.x + thigh.position.x * (1 - cos);
      const vertical = foot.y - hipY - thigh.position.y * cos - thigh.position.x * sin;
      const upperLength = -shin.position.y;
      const reach = upperLength + lowerLength;
      rootLift = Math.min(rootLift, vertical + Math.sqrt(Math.max(0, reach ** 2 - lateral ** 2)));
      return { lateral, vertical, upperLength };
    });
    this.root.position.y += rootLift;
    this.legs.forEach(({ thigh, shin }, index) => {
      const { lateral, vertical, upperLength } = targets[index];
      const [thighAngle, shinAngle] = solveLeg(lateral, vertical - rootLift, upperLength, lowerLength, bend);
      thigh.rotation.z = thighAngle - hipAngle;
      shin.rotation.z = shinAngle;
    });
  }

  updateTraveler(phase, weight, hipAngle, idleSeconds, timeSeconds, amplitude) {
    const upperBody = this.joints.get('upperBody');
    const torso = this.joints.get('torso');
    const head = this.joints.get('head');
    const backpack = this.joints.get('backpack');
    const upperAngle = (-TRAVELER_LEAN - SHOULDER_ROCK * Math.sin(phase)) * weight;
    upperBody.rotation.z = upperAngle - hipAngle;
    const breath = (timeSeconds / BREATH_SECONDS) * TAU;
    torso.position.y = torso.userData.pivot[1] + Math.sin(breath) * TORSO_BREATH * amplitude * (1 - weight);
    head.position.y = head.userData.pivot[1] + Math.sin(breath - HEAD_DELAY) * HEAD_BREATH * amplitude * (1 - weight);
    const glance = idleGesture(idleSeconds, GLANCE_SECONDS, GLANCE_DURATION);
    head.rotation.y = HEAD_GLANCE * glance.amount * (glance.alternate ? -1 : 1) * amplitude * (1 - weight);
    head.rotation.z = (-HEAD_SWAY * Math.sin(phase - HEAD_DELAY) * weight) - upperAngle * weight;
    backpack.rotation.z = PACK_SWAY * Math.sin(phase - PACK_DELAY) * weight;
    // 同側的手腳交錯前後移動，前臂再稍晚跟上上臂。
    const arm = Math.sin(phase) * ARM_SWING * weight;
    const forearm = Math.sin(phase - FOREARM_DELAY) * FOREARM_SWING * weight;
    this.joints.get('armNear').rotation.z = arm;
    this.joints.get('armFar').rotation.z = -arm;
    this.joints.get('forearmNear').rotation.z = forearm;
    this.joints.get('forearmFar').rotation.z = -forearm;
  }

  updateHeron(phase, weight, idleSeconds, amplitude) {
    const head = this.joints.get('head');
    const step = cycle(phase * HERON_STEPS_PER_STRIDE);
    const thrust = smoothstep((step - BIRD_HEAD_HOLD) / (1 - BIRD_HEAD_HOLD));
    const stepLength = this.definition.strideLength / HERON_STEPS_PER_STRIDE;
    // 頭在前半步以同速反向移動，留在世界原位；後半步再快速伸頸。
    const [restX, restY] = head.userData.pivot;
    head.position.x = restX + weight * (BIRD_NECK_REACH + stepLength * (BIRD_HEAD_HOLD / 2 - step + thrust));
    const look = idleGesture(idleSeconds, BIRD_LOOK_SECONDS, BIRD_LOOK_DURATION);
    const dip = look.alternate ? 0 : look.amount * amplitude * (1 - weight);
    head.position.y = restY - BIRD_DIP_Y * dip;
    head.rotation.z = (-BIRD_NOD * Math.sin(step * TAU) * weight - BIRD_DIP * dip) * amplitude;
    head.rotation.y = look.alternate ? BIRD_TURN * look.amount * amplitude * (1 - weight) : 0;
  }

  updateRide(seconds, amplitude, pedals) {
    this.updateTraveler(0, 0, 0, 0, 0, 0);
    this.joints.get('pelvis').rotation.z = 0;
    for (const [name, angle] of Object.entries(RIDE_POSTURE)) this.joints.get(name).rotation.z = angle;
    if (!pedals) return;
    const pedal = Math.sin(TAU * seconds / PEDAL_SECONDS) * smoothstep(seconds / PEDAL_BLEND_SECONDS) * amplitude;
    this.joints.get('legNear').rotation.z += PEDAL_THIGH * pedal;
    this.joints.get('legFar').rotation.z -= PEDAL_THIGH * pedal;
    this.joints.get('shinNear').rotation.z -= PEDAL_SHIN * pedal;
    this.joints.get('shinFar').rotation.z += PEDAL_SHIN * pedal;
  }

  dispose() {
    this.root.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry.dispose();
      if (node.material.map) node.material.map.dispose();
      node.material.dispose();
    });
  }
}

export function createTraveler(assets) {
  return new ArticulatedFigure(playerRig, { scale: 1, assets });
}

export function createCompanion(assets) {
  return new ArticulatedFigure(companionRig, { scale: 1, assets });
}

export function createBystander(assets) {
  return new ArticulatedFigure(bystanderRig, { scale: 1, assets });
}
