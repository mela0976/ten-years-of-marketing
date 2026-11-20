import { makeChapter, prop } from './chapter-utils.js';

export default makeChapter({
  id: 9, year: 2026, vehicle: '機車',
  palette: { primary: '#b3974f', warm: '#f3e5be', sky: '#d3bc7a', far: '#c2b575', middle: '#a9a65f', ground: '#6f744b', fog: '#ded5ad', ink: '#494c35' },
  ambience: { type: 'rice-field', rootHz: 47, filterHz: 560, scale: [330, 392, 440, 523, 659], particle: 'pollen', particleCount: 38, stepSurface: 'dirt' },
  scenery: {
    sky: [prop('afternoon-sun', 'ellipse', 2590, 475, 174, 174, '#f0d18b')],
    far: [prop('central-range', 'mountain', 0, 198, 3600, 330, '#a5a570'), prop('mountain-shadow', 'mountain', 800, 170, 2800, 250, '#909965')],
    middle: [
      prop('rice-fields', 'rect', 0, 164, 3600, 240, '#b4ae5e', { parts: [0, 1, 2, 3, 4, 5, 6, 7].map((n) => prop(`field-line-${n}`, 'rect', 0, n * 27, 3600, 7, '#c9bd69', { opacity: 0.7 })) }),
      ...[780, 1330, 2150, 3110].map((x, i) => prop(`power-pole-${i}`, 'rect', x, 150, 22, 380, '#685f47', { parts: [prop('crossbar', 'rect', -92, 330, 206, 14, '#685f47')] })),
      ...[1020, 2340, 2900].map((x, i) => prop(`palm-${i}`, 'rect', x, 160, 22, 245, '#626346', { parts: [prop('palm-leaf-1', 'triangle', -96, 202, 110, 150, '#71764b'), prop('palm-leaf-2', 'triangle', 14, 202, 110, 150, '#7c8050')] })),
    ],
    stage: [
      prop('grocery-shop', 'rect', 1830, 150, 520, 330, '#b8a57d', { parts: [prop('shop-window', 'rect', 40, 86, 440, 184, '#d6d9c8'), prop('shop-door', 'rect', 435, 20, 62, 235, '#77664d')] }),
      prop('refrigerator', 'rect', 2610, 155, 232, 322, '#d8dfd8', { parts: [prop('fridge-interior', 'rect', 18, 24, 196, 278, '#f3f2e5'), ...[0, 1, 2].map((n) => prop(`drink-${n}`, 'rect', 28 + n * 57, 92, 43, 146, ['#88b99f', '#e9d67d', '#8bbfd0'][n]))] }),
      prop('bench', 'rect', 1100, 156, 225, 34, '#816b49'),
    ],
    foreground: [
      ...[470, 920, 3070, 3370].map((x, i) => prop(`rice-stalk-${i}`, 'triangle', x, 148, 160, 260 + (i % 2) * 70, '#79804b', { rotation: (i % 2 ? -1 : 1) * 0.16 })),
    ],
  },
  kindness: [{ x: 1110, kind: 'stalk', label: '扶起路邊被風吹倒的稻束' }, { x: 2210, kind: 'bench', label: '把長椅上的水壺交給店家' }],
});
