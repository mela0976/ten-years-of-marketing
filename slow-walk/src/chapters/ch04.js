import { makeChapter, prop } from './chapter-utils.js';

export default makeChapter({
  id: 4, year: 2021, vehicle: '步行上石階',
  palette: { primary: '#897f9c', warm: '#e57555', sky: '#9e9cb0', far: '#aaaab7', middle: '#777484', ground: '#625c64', fog: '#c8c4d1', ink: '#443e50' },
  ambience: { type: 'mountain-mist', rootHz: 48, filterHz: 330, scale: [330, 392, 440, 523, 587], particle: 'mist', particleCount: 26, stepSurface: 'stone' },
  scenery: {
    sky: [prop('mist-moon', 'ellipse', 2340, 470, 170, 170, '#dfd6c9', { opacity: 0.72 })],
    far: [
      prop('mountain-back', 'mountain', 0, 150, 3600, 410, '#a3a6b6'),
      prop('mountain-front', 'mountain', 420, 110, 3500, 320, '#8e91a2'),
      prop('old-town-roofs', 'rect', 0, 180, 3600, 220, '#898393', { parts: [0, 1, 2, 3, 4, 5].map((n) => prop(`roof-${n}`, 'triangle', 260 + n * 550, 200, 360, 150, '#716f7d')) }),
    ],
    middle: [
      ...[900, 1510, 2140, 2760, 3270].map((x, i) => prop(`lantern-${i}`, 'ellipse', x, 360 + (i % 2) * 58, 80, 122, i % 2 ? '#e88b63' : '#d86f58', { parts: [prop('lantern-band', 'rect', 0, 78, 80, 9, '#f0b177')] })),
      prop('tea-house', 'rect', 1660, 150, 540, 300, '#716b71', { parts: [prop('door-light', 'rect', 95, 26, 350, 184, '#d59a72', { opacity: 0.75 })] }),
    ],
    stage: [
      ...[0, 1, 2, 3, 4, 5, 6].map((n) => prop(`stone-step-${n}`, 'rect', 2180 + n * 75, 150 + n * 34, 340 - n * 23, 31, '#968a84')),
      prop('notice-rack', 'rect', 2670, 172, 260, 230, '#594e4d', { parts: [0, 1, 2, 3].map((n) => prop(`notice-${n}`, 'rect', 15 + n * 60, 25, 48, 165, '#e1d7c2')) }),
      prop('stone-lion', 'ellipse', 1080, 156, 132, 104, '#847a7c'),
    ],
    foreground: [
      prop('roof-frame', 'triangle', 1300, 470, 1200, 300, '#5f5e6a', { opacity: 0.76 }),
      prop('hanging-lantern', 'ellipse', 3300, 290, 112, 160, '#d96e55'),
    ],
  },
  kindness: [{ x: 1060, kind: 'stone', label: '把散落的石階牌放回原位' }, { x: 2270, kind: 'lantern', label: '替屋簷下的燈籠扶正掛繩' }],
});
