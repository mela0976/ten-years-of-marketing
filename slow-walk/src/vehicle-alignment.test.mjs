import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene, Vector3 } from 'three';
import { chapters } from './chapters/index.js';
import { StageRenderer } from './stage.js';

// 使用正式的場景、骨架與離場更新；座標測試不需要 DOM 或 WebGL。
function stageAtStop(id) {
  const stage = Object.create(StageRenderer.prototype);
  stage.scene = new Scene();
  stage.viewWidth = 1280;
  stage.chapter = chapters[id - 1];
  stage.buildStage(stage.chapter, new Map());
  stage.update({ x: stage.chapter.stops.interaction, timeSeconds: 0 });
  stage.startDeparture();
  return stage;
}

function freeze(stage, t) {
  stage.departFreeze = t;
  stage.update({ timeSeconds: t * 3.4 });
}

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.02, `${actual} ≠ ${expected}`);
}

test('捷運與巴士離場時，三位乘客與影子和車廂保持相對位置', () => {
  for (const [id, floor] of [[3, 140.886], [8, 89.086]]) {
    const stage = stageAtStop(id);
    const car = stage.stageMeshes.get(stage.chapter.departure.sprite)[0];
    const riders = [stage.traveler.root, stage.companion.root, stage.bystander.root, ...stage.shadows.children];
    const offsets = riders.map(({ position }) => position.x - car.position.x);
    freeze(stage, 0.75);
    assert.ok(car.position.x > car.userData.baseX);
    assert.equal(stage.shadows.visible, true);
    riders.forEach(({ position }, i) => {
      close(position.y, floor);
      close(position.x - car.position.x, offsets[i]);
    });
    stage.disposeStage();
  }
});

test('上車時主角與麻鷺依序踩在原圖門檻', () => {
  for (const [id, x, y] of [[1, 3352.576, 183.476], [5, 3372.256, 211.012], [7, 3494.928, 237.657]]) {
    const stage = stageAtStop(id);
    for (const [t, figure] of [[0.45, stage.traveler], [0.48, stage.companion]]) {
      freeze(stage, t);
      close(figure.root.position.x, x);
      const soles = figure.legs.map(({ shin }) => shin.localToWorld(new Vector3(0, -figure.gait.lowerLength, 0)).y);
      close(Math.min(...soles), y);
    }
    stage.disposeStage();
  }
});

test('自行車與機車的座墊鎖住坐點，兩隻鞋在上車瞬間對齊原圖踏板', () => {
  for (const [id, saddle, pegs] of [
    [2, [3321.188, 255.288], [[3350.571, 169.677], [3342.620, 205.233]]],
    [9, [3354.382, 240.517], [[3373.494, 183.621], [3378.659, 186.207]]],
  ]) {
    const stage = stageAtStop(id);
    const vehicle = stage.stageMeshes.get(stage.chapter.departure.sprite)[0];
    for (const t of [0.45, 0.52, 0.65, 0.8, 1]) {
      freeze(stage, t);
      const dx = vehicle.position.x - vehicle.userData.baseX;
      const dy = vehicle.position.y - vehicle.userData.baseY;
      close(stage.traveler.root.position.x - dx, saddle[0]);
      close(stage.traveler.root.position.y + 91 - dy, saddle[1]);
      stage.traveler.legs.forEach(({ shin }, i) => {
        const pad = shin.localToWorld(new Vector3(6, -55, 0));
        const error = Math.hypot(pad.x + stage.camX - dx - pegs[i][0], pad.y - dy - pegs[i][1]);
        assert.ok(error < (id === 2 && t > 0.45 ? 4 : 0.02));
      });
    }
    stage.disposeStage();
  }
});
