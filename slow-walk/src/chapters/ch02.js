import { makeChapter, prop } from './chapter-utils.js';

export default makeChapter({
  id: 2, year: 2019, vehicle: '公共自行車',
  palette: { primary: '#4f9289', warm: '#f3a34f', sky: '#eaa968', far: '#93b7a9', middle: '#67a79b', ground: '#547c68', fog: '#c0d0bd', ink: '#294942' },
  ambience: { type: 'river', rootHz: 44, filterHz: 360, scale: [330, 392, 440, 494, 587], particle: 'firefly', particleCount: 34, stepSurface: 'gravel' },
  scenery: {
    sky: [prop('sunset', 'ellipse', 720, 420, 240, 240, '#f5a35b')],
    far: [
      prop('distant-ridge', 'mountain', 0, 120, 3600, 360, '#91b5a8'),
      prop('far-city', 'rect', 1650, 210, 1750, 220, '#829f91', { parts: [0, 1, 2, 3, 4].map((n) => prop(`tower-${n}`, 'rect', 60 + n * 300, 0, 185, 170 + (n % 2) * 60, '#78978c')) }),
      prop('bridge', 'arch', 2250, 220, 1100, 210, '#667f76'),
    ],
    middle: [
      prop('river', 'rect', 0, 145, 3600, 125, '#65a99e', { opacity: 0.88, parts: [120, 720, 1390, 2040, 2810].map((x, i) => prop(`river-glint-${i}`, 'rect', x, 35 + (i % 2) * 28, 300, 8, '#d1d0aa', { opacity: 0.6 })) }),
      prop('levee', 'rect', 0, 250, 3600, 70, '#708e79'),
      ...[930, 1650, 2400, 3170].map((x, i) => prop(`reed-${i}`, 'triangle', x, 268, 100, 180, '#718c68', { rotation: (i % 2 ? -1 : 1) * 0.18 })),
    ],
    stage: [
      prop('cycle-path', 'rect', 0, 150, 3600, 24, '#ddc29b'),
      prop('water-gauge', 'rect', 2660, 170, 68, 365, '#e4d6a8', { parts: [0, 1, 2, 3, 4, 5].map((n) => prop(`mark-${n}`, 'rect', 8, 45 + n * 47, 51, 8, '#49695f')) }),
      prop('bike-station', 'rect', 1040, 165, 310, 188, '#5c7c70', { parts: [prop('bike-wheel-1', 'ellipse', 42, -25, 90, 90, '#364b48'), prop('bike-wheel-2', 'ellipse', 182, -25, 90, 90, '#364b48')] }),
      prop('river-bench', 'rect', 2140, 192, 210, 32, '#876b4a'),
    ],
    foreground: [
      ...[500, 900, 1880, 3260].map((x, i) => prop(`reed-front-${i}`, 'triangle', x, 135, 138, 285, i % 2 ? '#55765f' : '#638260', { rotation: (i % 2 ? -1 : 1) * 0.12 })),
    ],
  },
  kindness: [{ x: 1160, kind: 'bike', label: '扶起倒下的自行車' }, { x: 2170, kind: 'reed', label: '替路邊芒草撥開露水' }],
});
