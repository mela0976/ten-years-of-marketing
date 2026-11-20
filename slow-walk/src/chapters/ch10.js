import { makeChapter, prop } from './chapter-utils.js';

export default makeChapter({
  id: 10, year: 2027, vehicle: '步行回家',
  palette: { primary: '#d68168', warm: '#f6cb88', sky: '#eaa894', far: '#d39b8e', middle: '#9e706a', ground: '#665b56', fog: '#f0c8b6', ink: '#563f42' },
  ambience: { type: 'home-evening', rootHz: 42, filterHz: 420, scale: [330, 392, 440, 523, 587], particle: 'moth', particleCount: 20, stepSurface: 'soil' },
  scenery: {
    sky: [prop('evening-sun', 'ellipse', 2470, 360, 270, 270, '#f1bd82', { opacity: 0.8 }), prop('sea', 'rect', 0, 145, 3600, 122, '#7799a0')],
    far: [prop('coastal-range', 'mountain', 0, 190, 3600, 325, '#9c8788'), prop('fishing-village', 'rect', 0, 156, 3600, 204, '#aa817d', { parts: [0, 1, 2, 3, 4].map((n) => prop(`roof-${n}`, 'triangle', 350 + n * 630, 170, 450, 138, '#876a6d')) })],
    middle: [
      prop('windbreak', 'rect', 0, 180, 3600, 150, '#72806d', { parts: [0, 1, 2, 3, 4, 5].map((n) => prop(`tree-${n}`, 'ellipse', 120 + n * 640, 110, 200, 150, '#6b7c67')) }),
      prop('house', 'rect', 2380, 155, 640, 340, '#be9b82', { parts: [prop('house-roof', 'triangle', -42, 306, 720, 130, '#755f5a'), prop('lit-window', 'rect', 90, 95, 214, 160, '#f1c780'), prop('door', 'rect', 430, 20, 108, 240, '#725954')] }),
      prop('yard-tree', 'rect', 1940, 154, 44, 365, '#655147', { parts: [prop('tree-crown', 'ellipse', -120, 290, 280, 250, '#647263')] }),
    ],
    stage: [
      prop('front-gate', 'rect', 2970, 150, 280, 122, '#78635e', { parts: [prop('mailbox', 'rect', 105, 48, 72, 64, '#cf8d72')] }),
      prop('phone-call', 'rect', 1620, 172, 138, 214, '#514b52', { parts: [prop('call-screen', 'rect', 14, 28, 110, 148, '#efd1a9'), prop('call-portrait', 'ellipse', 45, 75, 54, 70, '#8b7770')] }),
      prop('clothesline', 'rect', 310, 362, 630, 7, '#725b54', { parts: [prop('shirt', 'triangle', 200, -5, 146, 122, '#d49c8b')] }),
    ],
    foreground: [
      prop('yard-wall', 'rect', 60, 142, 680, 76, '#81736b'),
      prop('bougainvillea', 'triangle', 225, 182, 350, 245, '#b76d73'),
    ],
  },
  kindness: [{ x: 1150, kind: 'flower', label: '把院子門邊的花盆移進遮雨處' }, { x: 2180, kind: 'gate', label: '替鄰居把院門帶上' }],
});
