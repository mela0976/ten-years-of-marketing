import { makeChapter, prop } from './chapter-utils.js';

export default makeChapter({
  id: 7, year: 2024, vehicle: '小貨車',
  palette: { primary: '#628b58', warm: '#d85745', sky: '#a9c9a0', far: '#9bb68f', middle: '#779b66', ground: '#5d7350', fog: '#cad3bb', ink: '#3e5942' },
  ambience: { type: 'orchard', rootHz: 51, filterHz: 480, scale: [349, 415, 466, 554, 622], particle: 'petal', particleCount: 30, stepSurface: 'gravel' },
  scenery: {
    sky: [prop('cloud', 'ellipse', 480, 485, 490, 110, '#e6e7cc', { opacity: 0.75 }), prop('cloud-small', 'ellipse', 2180, 535, 320, 75, '#e6e7cc', { opacity: 0.72 })],
    far: [prop('cloud-sea', 'mountain', 0, 300, 3600, 270, '#c1cfb6'), prop('high-range', 'mountain', 0, 180, 3600, 310, '#91ad85')],
    middle: [
      ...[640, 1340, 2040, 2720, 3340].map((x, i) => prop(`apple-tree-${i}`, 'rect', x, 145, 42, 210, '#694c3b', { parts: [prop('tree-top', 'ellipse', -78, 160, 200, 205, '#68875b'), prop('apple-1', 'ellipse', -40, 230, 35, 35, '#d65d47'), prop('apple-2', 'ellipse', 42, 190, 34, 34, '#c74d3f')] })),
      prop('terrace', 'rect', 0, 218, 3600, 28, '#8c9f72'),
    ],
    stage: [
      prop('market-stall', 'rect', 2530, 160, 430, 255, '#806a4d', { parts: [prop('stall-roof', 'triangle', -30, 210, 490, 90, '#9d7147'), ...[0, 1, 2, 3].map((n) => prop(`wooden-board-${n}`, 'rect', 24 + n * 96, 38, 78, 122, '#d8c397'))] }),
      prop('apple-crates', 'rect', 1840, 154, 340, 150, '#8a6140', { parts: [prop('apple-box', 'rect', 26, 20, 78, 65, '#c74b3b'), prop('apple-box-2', 'rect', 136, 20, 78, 65, '#dd6750'), prop('apple-box-3', 'rect', 246, 20, 70, 65, '#be493b')] }),
      prop('market-scale', 'rect', 1120, 160, 145, 118, '#75825d'),
    ],
    foreground: [
      prop('apple-branch', 'triangle', 520, 360, 540, 310, '#536f4a'),
      prop('apple-branch-right', 'triangle', 3180, 400, 380, 260, '#536f4a'),
    ],
  },
  kindness: [{ x: 1130, kind: 'apple', label: '把滾到路邊的蘋果放回箱子' }, { x: 2120, kind: 'crates', label: '扶好歪掉的木箱' }],
});
