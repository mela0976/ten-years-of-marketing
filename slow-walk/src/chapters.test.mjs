import test from 'node:test';
import assert from 'node:assert/strict';
import content from '../content/content.js';
import { chapters } from './chapters/index.js';

const expectedLayers = [
  ['sky', 0], ['far', 0.16], ['middle', 0.42],
  ['stage', 1], ['characters', 1], ['foreground', 1.22],
];
const allowedShapes = new Set(['rect', 'ellipse', 'circle', 'triangle', 'mountain', 'arch', 'trapezoid', 'roundRect']);
const allowedSurfaces = new Set(['pavement', 'gravel', 'metal', 'stone', 'wood', 'soil', 'rubber', 'dirt']);

function inspectItems(items, visited = []) {
  for (const item of items) {
    visited.push(item);
    if (item.parts) inspectItems(item.parts, visited);
  }
  return visited;
}

test('ten stage configs align with content years, six parallax layers and PRD stops', () => {
  assert.equal(chapters.length, 10);
  assert.equal(content.chapters.length, 10);
  chapters.forEach((chapter, index) => {
    assert.equal(chapter.id, index + 1);
    assert.equal(chapter.year, content.chapters[index].year);
    assert.equal(chapter.length, 3600);
    assert.deepEqual(chapter.layers.map(({ name, scroll }) => [name, scroll]), expectedLayers);
    assert.deepEqual(chapter.stops, { start: 640, chat: 1520, quiz: 2180, interaction: 2800, takeaway: 2800, departure: 3520 });
  });
});

test('chapter shapes are drawable color blocks and remain inside resource budgets', () => {
  chapters.forEach((chapter) => {
    const items = inspectItems(chapter.layers.flatMap((layer) => layer.items));
    assert.ok(items.length < 150, `chapter ${chapter.id} has ${items.length} scene shapes`);
    assert.ok(chapter.ambience.particleCount <= 300);
    assert.ok(allowedSurfaces.has(chapter.ambience.stepSurface));
    for (const item of items) {
      assert.ok(allowedShapes.has(item.shape), `chapter ${chapter.id}: unsupported shape ${item.shape}`);
      assert.ok(Number.isFinite(item.x) && Number.isFinite(item.y));
      assert.ok(Number.isFinite(item.width) && item.width > 0);
      assert.ok(Number.isFinite(item.height) && item.height > 0);
      assert.match(item.color, /^#[\da-f]{6}$/i);
    }
  });
});

test('all six interaction contracts and the no-game final chapter are present in content', () => {
  const types = content.chapters.map((chapter) => chapter.game?.type ?? null);
  assert.deepEqual(types, ['pick', 'slider', 'slider', 'swipe', 'slider', 'swipe', 'multi', 'stop', 'agent', null]);
  assert.equal(content.chapters[3].game.scored, false);
  assert.equal(content.chapters[8].game.scored, false);
  assert.equal(content.chapters[9].game, undefined);
});
