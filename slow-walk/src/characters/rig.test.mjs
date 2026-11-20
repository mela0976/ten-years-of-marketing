import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { createCompanion, createTraveler } from './rig.js';

const FRAME = 1 / 60;

function assertFinitePose(figure) {
  figure.root.traverse(({ position, rotation }) => {
    assert.ok([position.x, position.y, position.z, rotation.x, rotation.y, rotation.z].every(Number.isFinite));
  });
}

for (const [name, create, lowerLength] of [
  ['主角', createTraveler, 55],
  ['黑冠麻鷺', createCompanion, 32],
]) {
  test(`${name}支撐腳的接地點固定，停止後逐步回到站姿`, () => {
    const figure = create();
    const { strideLength } = figure.definition;
    const calibration = 100;
    const step = 1 / calibration;
    let lastPlanted = null;
    let plantedFrames = 0;
    for (let frame = 0; frame < 235; frame += 1) {
      const phase = frame * step;
      figure.update(phase * strideLength, frame * FRAME, true, 'walk', { speed: 80, phase });
      assertFinitePose(figure);
      const point = figure.joints.get('shinNear').localToWorld(new Vector3(0, -lowerLength, 0));
      const planted = figure.feet[0].y < 1e-6;
      if (planted) {
        assert.ok(Math.abs(point.y) < 1e-5);
        if (lastPlanted) {
          assert.ok(Math.abs(point.x - lastPlanted.x) < 1e-5);
          plantedFrames += 1;
        }
      }
      lastPlanted = planted ? point : null;
    }
    assert.ok(plantedFrames > calibration);
    const beforeStop = figure.joints.get('legNear').rotation.z;
    const stoppedAt = figure.root.position.x;
    figure.update(stoppedAt, 235 * FRAME, false);
    assert.ok(Math.abs(figure.joints.get('legNear').rotation.z) > 0.02);
    assert.ok(Math.abs(figure.joints.get('legNear').rotation.z - beforeStop) < 0.25);
    for (let frame = 236; frame < 265; frame += 1) {
      figure.update(stoppedAt, frame * FRAME, false);
      assertFinitePose(figure);
    }
    for (const side of ['Near', 'Far']) {
      assert.ok(Math.abs(figure.joints.get(`leg${side}`).rotation.z) < 1e-6);
      assert.ok(Math.abs(figure.joints.get(`shin${side}`).rotation.z) < 1e-6);
    }
    assert.equal(figure.root.position.y, figure.baseY);
    figure.dispose();
  });
}

test('減少動態效果時，走路腳仍會抬起，身體起伏與呼吸幅度減半', () => {
  const normal = createTraveler();
  const reduced = createTraveler();
  normal.update(0, 0.9, false);
  reduced.update(0, 0.9, false, 'walk', { reducedMotion: true });
  const torsoY = normal.joints.get('torso').userData.pivot[1];
  assert.ok(Math.abs((reduced.joints.get('torso').position.y - torsoY) * 2 - (normal.joints.get('torso').position.y - torsoY)) < 1e-6);
  for (const phase of [0, 1 / 16, 3 / 16]) {
    normal.update(phase * 96, 1 + phase, true, 'walk', { phase, speed: 80 });
    reduced.update(phase * 96, 1 + phase, true, 'walk', { phase, speed: 80, reducedMotion: true });
    assert.equal(normal.feet[0].y, reduced.feet[0].y);
    if (phase === 1 / 16) assert.ok(reduced.feet[1].y > 0);
  }
  assert.ok(Math.abs(normal.root.position.y - reduced.root.position.y) > 0.5);
  normal.dispose();
  reduced.dispose();
});

test('騎乘姿勢可踩踏，自行車與機車可共用骨架', () => {
  const figure = createTraveler();
  const shin = figure.joints.get('shinNear');
  figure.update(100, 0, false, 'ride');
  const seated = shin.rotation.z;
  figure.update(100, 0.25, false, 'ride');
  assert.notEqual(shin.rotation.z, seated);
  assertFinitePose(figure);
  figure.update(100, 0.5, false, 'ride', { pedals: false });
  assert.equal(shin.rotation.z, seated);
  figure.dispose();
});
