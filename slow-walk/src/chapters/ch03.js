import { makeChapter, prop } from './chapter-utils.js';

export default makeChapter({
  id: 3, year: 2020, vehicle: '捷運列車',
  palette: { primary: '#99b6bb', warm: '#eebf78', sky: '#c5d2d1', far: '#adbfc0', middle: '#7d9395', ground: '#4d575c', fog: '#d4dddd', ink: '#35454b' },
  ambience: { type: 'metro', rootHz: 46, filterHz: 250, scale: [349, 392, 466, 523, 587], particle: 'window-light', particleCount: 16, stepSurface: 'metal' },
  scenery: {
    sky: [prop('cloud-bank', 'ellipse', 480, 440, 720, 180, '#e3e9e5', { opacity: 0.72 })],
    far: [
      prop('city-silhouette', 'rect', 0, 120, 3600, 330, '#a4b6b8', { parts: [0, 1, 2, 3, 4, 5, 6].map((n) => prop(`tower-${n}`, 'rect', 80 + n * 490, 0, 300, 240 + (n % 3) * 45, '#91a6a9')) }),
      prop('rail-line', 'rect', 0, 440, 3600, 34, '#6d7f82'),
      ...[250, 1120, 2010, 2910].map((x, i) => prop(`pier-${i}`, 'rect', x, 160, 44, 350, '#829294')),
    ],
    middle: [
      prop('platform', 'rect', 0, 145, 3600, 90, '#8d9997'),
      prop('train-car', 'rect', 1670, 190, 1140, 370, '#d5ddd6', { parts: [prop('warm-cabin', 'rect', 60, 68, 1010, 238, '#f2d7a7', { opacity: 0.8 }), ...[165, 405, 645, 885].map((x, i) => prop(`train-window-${i}`, 'rect', x, 76, 170, 162, '#a9c5c3', { opacity: 0.82 })), prop('train-base', 'rect', 0, 0, 1140, 48, '#b4c4c1')] }),
      prop('platform-column', 'rect', 3040, 155, 70, 390, '#697d7e'),
    ],
    stage: [
      prop('ring-bar', 'rect', 2730, 500, 30, 118, '#7e9393'),
      ...[2780, 2880, 2980, 3080].map((x, i) => prop(`ring-${i}`, 'ellipse', x, 425, 36, 86, '#d6bb78', { parts: [prop('ring-hole', 'ellipse', 8, 13, 20, 56, '#798d8b')] })),
      prop('door', 'rect', 2390, 210, 165, 330, '#98aaa5'),
    ],
    foreground: [
      ...[780, 1940, 3160].map((x, i) => prop(`platform-post-${i}`, 'rect', x, 140, 55, 500, '#667578', { opacity: 0.82 })),
    ],
  },
  kindness: [{ x: 1140, kind: 'seat', label: '替空位上的雨傘留個位置' }, { x: 2150, kind: 'handle', label: '扶穩晃動的拉環' }],
});
