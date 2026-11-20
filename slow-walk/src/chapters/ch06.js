import { makeChapter, prop } from './chapter-utils.js';

export default makeChapter({
  id: 6, year: 2023, vehicle: '隨天燈拉遠',
  palette: { primary: '#4a4c82', warm: '#f29a53', sky: '#262d5c', far: '#414871', middle: '#555477', ground: '#292e4e', fog: '#737998', ink: '#292a4a' },
  ambience: { type: 'night-field', rootHz: 39, filterHz: 520, scale: [330, 392, 494, 587, 659], particle: 'lantern', particleCount: 52, stepSurface: 'soil' },
  scenery: {
    sky: [
      ...Array.from({ length: 20 }, (_, i) => prop(`star-${i}`, 'ellipse', 90 + (i * 173) % 3400, 380 + (i * 47) % 310, 5 + (i % 3) * 2, 5 + (i % 3) * 2, '#e1d9bb', { opacity: 0.62 })),
      prop('warm-moon', 'ellipse', 2830, 490, 96, 96, '#efc17d'),
    ],
    far: [prop('valley-ridge-back', 'mountain', 0, 165, 3600, 390, '#383f6d'), prop('valley-ridge-front', 'mountain', 600, 138, 3300, 280, '#4c4b72')],
    middle: [
      prop('town-roofs', 'rect', 0, 156, 3600, 190, '#484662', { parts: [0, 1, 2, 3, 4, 5].map((n) => prop(`town-roof-${n}`, 'triangle', 180 + n * 590, 180, 420, 155, '#373b58')) }),
      prop('railway-line', 'rect', 0, 150, 3600, 18, '#9290a0'),
      ...[930, 1510, 2140, 3370].map((x, i) => prop(`floating-lantern-${i}`, 'ellipse', x, 470 + (i % 2) * 65, 42, 68, '#f4a45c', { opacity: 0.78 })),
    ],
    stage: [
      ...[0, 1, 2, 3].map((n) => prop(`answer-lantern-${n}`, 'ellipse', 2530 + n * 88, 222, 64, 112, '#ed9d59', { parts: [prop('lantern-panel', 'rect', 8, 22, 48, 66, '#f6c67d', { opacity: 0.86 })] })),
      prop('snack-stall', 'rect', 1450, 155, 320, 230, '#61535c', { parts: [prop('stall-light', 'rect', 25, 92, 260, 87, '#d88853')] }),
      prop('rail-crossing', 'rect', 1910, 150, 28, 240, '#aaa18c'),
    ],
    foreground: [
      ...[740, 1770, 3090].map((x, i) => prop(`crowd-silhouette-${i}`, 'ellipse', x, 145, 152, 155, '#292c46', { parts: [prop('shoulder', 'rect', -25, -10, 202, 63, '#292c46')] })),
    ],
  },
  kindness: [{ x: 1170, kind: 'lantern-string', label: '替天燈扶好燈繩' }, { x: 2210, kind: 'cup', label: '把路邊紙杯放進回收桶' }],
});
