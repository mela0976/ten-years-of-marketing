import { makeChapter, prop } from './chapter-utils.js';

export default makeChapter({
  id: 5, year: 2022, vehicle: '藍色區間車',
  palette: { primary: '#398d98', warm: '#e9c46b', sky: '#84bfc3', far: '#87aeb0', middle: '#4c999b', ground: '#526d69', fog: '#b8d1ca', ink: '#2c5554' },
  ambience: { type: 'coast', rootHz: 41, filterHz: 300, scale: [349, 392, 466, 523, 659], particle: 'sea-spray', particleCount: 30, stepSurface: 'wood' },
  scenery: {
    sky: [prop('sunlit-cloud', 'ellipse', 640, 465, 520, 142, '#e9e5d4', { opacity: 0.78 })],
    far: [
      prop('sea-horizon', 'rect', 0, 248, 3600, 260, '#72aeb0'),
      prop('cape', 'mountain', 0, 170, 1650, 280, '#688e8b'),
      prop('far-island', 'mountain', 2110, 232, 1400, 180, '#91b6ad'),
      ...[660, 1730, 2820].map((x, i) => prop(`wind-farm-${i}`, 'rect', x, 305, 22, 330, '#dae2d0', { parts: [prop('turbine-blade-a', 'rect', -118, 290, 258, 10, '#e4e7d6', { rotation: 0.34 }), prop('turbine-blade-b', 'rect', -6, 290, 12, 210, '#e4e7d6', { rotation: -0.14 })] })),
    ],
    middle: [
      ...[0, 1, 2, 3, 4].map((n) => prop(`wave-band-${n}`, 'rect', 0, 205 + n * 35, 3600, 10, n % 2 ? '#89c2bb' : '#c0d2bd', { opacity: 0.6 })),
      prop('rock-platform', 'triangle', 1800, 166, 940, 168, '#667c71'),
      prop('station', 'rect', 2060, 175, 560, 224, '#c4c9b2', { parts: [prop('station-window', 'rect', 55, 50, 450, 92, '#f1d18b'), prop('station-roof', 'triangle', -30, 195, 620, 95, '#647b73')] }),
    ],
    stage: [
      prop('platform-edge', 'rect', 0, 150, 3600, 23, '#e5c36f'),
      prop('tide-gauge', 'rect', 2685, 166, 72, 360, '#eee4c5', { parts: [0, 1, 2, 3, 4, 5].map((n) => prop(`tide-mark-${n}`, 'rect', 10, 33 + n * 48, n % 2 ? 38 : 54, 8, '#52777a')) }),
      ...[600, 3220].map((x, i) => prop(`wave-block-${i}`, 'rect', x, 140, 310, 88, '#747e70')),
    ],
    foreground: [
      prop('shore-grass', 'triangle', 480, 140, 340, 280, '#55796b'),
      prop('beach-grass', 'triangle', 3230, 142, 240, 230, '#69816a'),
    ],
  },
  kindness: [{ x: 1070, kind: 'rock', label: '把岸邊的石頭放回消波塊' }, { x: 2220, kind: 'bottle', label: '拾起候車亭旁的空水瓶' }],
});
