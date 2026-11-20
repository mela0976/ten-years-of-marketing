import { makeChapter, prop } from './chapter-utils.js';

export default makeChapter({
  id: 1, year: 2018, vehicle: '市區公車',
  palette: { primary: '#657e8c', warm: '#efb85c', sky: '#94a8b0', far: '#a8b8bb', middle: '#788c8d', ground: '#665d57', fog: '#bdc8c4', ink: '#263943' },
  ambience: { type: 'street', rootHz: 52, filterHz: 410, scale: [392, 440, 523, 587, 659], particle: 'dust', particleCount: 28, stepSurface: 'pavement' },
  scenery: {
    sky: [prop('morning-sun', 'ellipse', 410, 430, 168, 168, '#f0c477', { opacity: 0.72 })],
    far: [
      ...[0, 1, 2, 3, 4, 5].map((n) => prop(`office-${n}`, 'rect', 120 + n * 620, 160, 330, 390 + (n % 3) * 75, ['#84979c', '#8fa1a3', '#7d9199'][n % 3], { parts: Array.from({ length: 8 }, (_, i) => prop(`window-${i}`, 'rect', 26 + (i % 4) * 72, 205 + Math.floor(i / 4) * 95, 34, 54, '#d8d3bc', { opacity: 0.42 })) })),
    ],
    middle: [
      prop('arcade-roof', 'rect', 300, 255, 3200, 55, '#727b7b'),
      ...[720, 1320, 1920, 2520, 3120].map((x, i) => prop(`arcade-column-${i}`, 'rect', x, 154, 42, 235, '#6e7069')),
      prop('breakfast-shop', 'rect', 1710, 185, 490, 295, '#747c79', { parts: [prop('warm-window', 'rect', 90, 75, 300, 148, '#e9b95e', { opacity: 0.9 }), prop('shop-door', 'rect', 410, 40, 55, 215, '#555e5c')] }),
      prop('awning', 'triangle', 1675, 462, 560, 104, '#bd8054'),
    ],
    stage: [
      prop('notice-board', 'rect', 2630, 165, 310, 260, '#594d43', { parts: [0, 1, 2, 3].map((n) => prop(`report-${n}`, 'rect', 20 + (n % 2) * 145, 24 + Math.floor(n / 2) * 110, 122, 88, '#e7ddc5', { parts: [prop('paper-line', 'rect', 16, 50, 86, 7, '#86938e')] })) }),
      prop('bus-stop', 'rect', 3210, 155, 105, 310, '#8e9c97', { parts: [prop('sign', 'rect', 22, 218, 61, 72, '#e7c36f')] }),
      prop('scooter', 'ellipse', 1060, 138, 180, 76, '#3f535b'),
    ],
    foreground: [
      ...[900, 2200, 3350].map((x, i) => prop(`planter-${i}`, 'rect', x, 150, 180, 68, '#776953', { parts: [prop('plant-leaf', 'triangle', 40, 48, 50, 120, '#5e7560'), prop('plant-leaf-2', 'triangle', 88, 48, 54, 145, '#71836a')] })),
    ],
  },
  kindness: [{ x: 1080, kind: 'scooter', label: '扶正倒下的雨傘' }, { x: 2260, kind: 'plant', label: '替盆栽扶正枝葉' }],
});
